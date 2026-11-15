import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, stat, symlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import type { Problem } from "../../../src/errors.js";
import {
  createRequirements,
  decideSetup,
  describeRequirementList,
  SETUP_QUESTION,
  setupRequired,
} from "../../../src/core/requires/setup.js";
import type { RequirementResult } from "../../../src/core/requires/inspect.js";
import { pathExists } from "../../../src/util/fs.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";

const cannotCheckMode = process.platform === "win32";
const cannotLink = process.platform === "win32";
const run = promisify(execFile);

function result(
  path: string,
  state: RequirementResult["state"] = "missing",
  template?: string,
): RequirementResult {
  return {
    path,
    description: `The ${path} file`,
    ...(template === undefined ? {} : { template }),
    state,
  };
}

function stderrText(): { write(text: string): void; text(): string } {
  let collected = "";
  return {
    write: (text: string) => {
      collected += text;
    },
    text: () => collected,
  };
}

describe("describeRequirementList", () => {
  test("lists only the creatable entries, padded, in the order given", () => {
    const list = describeRequirementList([
      result("orca.yaml", "present"),
      result("docs/roadmap.md", "missing", ".factory/templates/docs/roadmap.md"),
      result("opencode.json", "missing", ".factory/templates/setup/opencode.json"),
      result("docs/factory.md", "missing"),
      result("blocked.md", "blocked"),
    ]);

    expect(list).toBe(
      [
        "The factory needs these files, which are missing:",
        "  docs/roadmap.md  The docs/roadmap.md file",
        "  opencode.json    The opencode.json file",
        "",
      ].join("\n"),
    );
  });

  test("returns nothing when no entry can be created", () => {
    expect(describeRequirementList([result("a.md", "present"), result("b.md", "missing")])).toBe("");
  });
});

describe("setupRequired", () => {
  test("names the flag and the paths that can be created", () => {
    expect(
      setupRequired([
        result("a.md", "missing", ".factory/templates/a.md"),
        result("b.md", "present", ".factory/templates/b.md"),
      ]),
    ).toEqual({
      name: "setup",
      flag: "--setup",
      description:
        "Create the missing repository files the factory needs: a.md. Pass --setup to create them or --no-setup to skip",
    });
  });
});

describe("decideSetup", () => {
  test("returns the flag's answer without asking", async () => {
    const stderr = stderrText();

    expect(await decideSetup([result("a.md", "missing", "t.md")], true, { stderr: stderr.write }, false)).toBe(true);
    expect(await decideSetup([result("a.md", "missing", "t.md")], false, { stderr: stderr.write }, true)).toBe(false);
    expect(stderr.text()).toBe("");
  });

  test("asks nothing and requires nothing when no file can be created", async () => {
    const stderr = stderrText();

    expect(await decideSetup([result("a.md", "present")], undefined, { stderr: stderr.write }, false)).toBe(false);
    expect(stderr.text()).toBe("");
  });

  test("needs input without a terminal", async () => {
    const stderr = stderrText();

    expect(
      await decideSetup([result("a.md", "missing", "t.md")], undefined, { stderr: stderr.write }, false),
    ).toBe("needs-input");
    expect(stderr.text()).toBe("");
  });

  test("asks in a terminal, lists to stderr and defaults to yes", async () => {
    const stderr = stderrText();

    const answer = await decideSetup(
      [result("opencode.json", "missing", ".factory/templates/setup/opencode.json")],
      undefined,
      { tty: true, stdin: Readable.from(["\n"]), stderr: stderr.write },
      true,
    );

    expect(answer).toBe(true);
    expect(stderr.text()).toContain("The factory needs these files, which are missing:\n");
    expect(stderr.text()).toContain("  opencode.json  The opencode.json file\n");
    expect(stderr.text()).toContain(SETUP_QUESTION);
  });

  test("records a no answer", async () => {
    const stderr = stderrText();

    const answer = await decideSetup(
      [result("a.md", "missing", "t.md")],
      undefined,
      { tty: true, stdin: Readable.from(["n\n"]), stderr: stderr.write },
      true,
    );

    expect(answer).toBe(false);
  });
});

const CREATED: TempRepo[] = [];

async function repo(files: Record<string, string | Uint8Array> = {}): Promise<TempRepo> {
  const created = await makeRepo(files);
  CREATED.push(created);
  return created;
}

afterEach(async () => {
  await Promise.all(CREATED.splice(0).map((created) => created.cleanup()));
});

describe("createRequirements", () => {
  test("copies a template byte for byte, CRLF included", async () => {
    const created = await repo({
      ".factory/templates/setup/opencode.json": "{\r\n  \"a\": 1\r\n}\r\n",
    });

    const results = await createRequirements(created.root, [
      result("opencode.json", "missing", ".factory/templates/setup/opencode.json"),
    ]);

    expect(results).toEqual([
      {
        path: "opencode.json",
        description: "The opencode.json file",
        template: ".factory/templates/setup/opencode.json",
        state: "created",
      },
    ]);
    expect(await readFile(created.path("opencode.json"))).toEqual(
      Buffer.from("{\r\n  \"a\": 1\r\n}\r\n"),
    );
    // Windows has no POSIX modes: `chmod` is a no-op there and the filesystem
    // reports 0o666, so only POSIX asserts the 0644 from Sharing: Importing.
    if (!cannotCheckMode) {
      expect((await stat(created.path("opencode.json"))).mode & 0o777).toBe(0o644);
    }
  });

  test("creates missing parent directories", async () => {
    const created = await repo({
      ".factory/templates/docs/factory.md": "# Factory\n",
    });

    const results = await createRequirements(created.root, [
      result("docs/nested/factory.md", "missing", ".factory/templates/docs/factory.md"),
    ]);

    expect(results[0]?.state).toBe("created");
    expect(await readFile(created.path("docs", "nested", "factory.md"), "utf8")).toBe(
      "# Factory\n",
    );
  });

  test.skipIf(cannotCheckMode)("keeps the executable bit of the template", async () => {
    const created = await repo({
      ".factory/templates/scripts/setup.sh": "#!/bin/sh\necho setup\n",
    });

    await chmod(created.path(".factory", "templates", "scripts", "setup.sh"), 0o755);
    const results = await createRequirements(created.root, [
      result("scripts/setup.sh", "missing", ".factory/templates/scripts/setup.sh"),
    ]);

    expect(results[0]?.state).toBe("created");
    expect((await stat(created.path("scripts", "setup.sh"))).mode & 0o111).not.toBe(0);
  });

  test("never touches an existing file, reported as present", async () => {
    const created = await repo({
      ".factory/templates/setup/opencode.json": "{}\n",
      "opencode.json": "mine\n",
    });

    const before = await stat(created.path("opencode.json"));
    const results = await createRequirements(created.root, [
      result("opencode.json", "missing", ".factory/templates/setup/opencode.json"),
    ]);
    const after = await stat(created.path("opencode.json"));

    expect(results[0]?.state).toBe("present");
    expect(await readFile(created.path("opencode.json"), "utf8")).toBe("mine\n");
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  test("leaves a template-less requirement missing and a declined one declined", async () => {
    const created = await repo({});

    const results = await createRequirements(created.root, [
      result("docs/factory.md", "missing"),
      result("opencode.json", "declined", ".factory/templates/setup/opencode.json"),
      result("orca.yaml", "present"),
    ]);

    expect(results.map((entry) => entry.state)).toEqual(["missing", "declined", "present"]);
  });

  test("carries a blocked entry through unchanged", async () => {
    const created = await repo({
      ".factory/templates/setup/opencode.json": "{}\n",
    });
    const blocked: RequirementResult = {
      path: "opencode.json",
      description: "Agents",
      template: ".factory/templates/setup/opencode.json",
      state: "blocked",
      reason: "opencode.json is a directory",
      clash: "opencode.json",
    };

    expect(await createRequirements(created.root, [blocked])).toEqual([blocked]);
  });

  test.skipIf(cannotLink)(
    "refuses a template reached through a directory link outside .factory/",
    async () => {
      const created = await repo({ "outside/opencode.json": "{}\n" });
      await mkdir(created.path(".factory", "templates"), { recursive: true });
      await symlink(created.path("outside"), created.path(".factory", "templates", "link"));

      const problems: Problem[] = [];
      const results = await createRequirements(
        created.root,
        [result("opencode.json", "missing", ".factory/templates/link/opencode.json")],
        problems,
      );

      expect(results).toEqual([
        {
          path: "opencode.json",
          description: "The opencode.json file",
          template: ".factory/templates/link/opencode.json",
          state: "failed",
          reason:
            "its template .factory/templates/link/opencode.json is not a regular file inside .factory/",
        },
      ]);
      expect(await pathExists(created.path("opencode.json"))).toBe(false);
      expect(problems).toEqual([
        {
          level: "warning",
          file: "opencode.json",
          message:
            "Could not create opencode.json: its template .factory/templates/link/opencode.json is not a regular file inside .factory/",
          fix: "Replace .factory/templates/link/opencode.json with a file inside .factory/templates/",
        },
      ]);
    },
  );

  test("refuses a template that is a directory, without reading it", async () => {
    const created = await repo({ ".factory/templates/setup/opencode.json": "{}\n" });

    const problems: Problem[] = [];
    const results = await createRequirements(
      created.root,
      [result("opencode.json", "missing", ".factory/templates/setup")],
      problems,
    );

    expect(results).toEqual([
      {
        path: "opencode.json",
        description: "The opencode.json file",
        template: ".factory/templates/setup",
        state: "failed",
        reason: "its template .factory/templates/setup is not a regular file inside .factory/",
      },
    ]);
    expect(await pathExists(created.path("opencode.json"))).toBe(false);
    expect(problems).toEqual([
      {
        level: "warning",
        file: "opencode.json",
        message:
          "Could not create opencode.json: its template .factory/templates/setup is not a regular file inside .factory/",
        fix: "Replace .factory/templates/setup with a file inside .factory/templates/",
      },
    ]);
  });

  test.skipIf(cannotLink)(
    "refuses a template that is a FIFO, without waiting for a writer",
    { timeout: 5_000 },
    async () => {
      const created = await repo({ ".factory/templates/setup/opencode.json": "{}\n" });
      await run("mkfifo", [created.path(".factory", "templates", "fifo")]);

      const problems: Problem[] = [];
      const results = await createRequirements(
        created.root,
        [result("opencode.json", "missing", ".factory/templates/fifo")],
        problems,
      );

      expect(results).toEqual([
        {
          path: "opencode.json",
          description: "The opencode.json file",
          template: ".factory/templates/fifo",
          state: "failed",
          reason: "its template .factory/templates/fifo is not a regular file inside .factory/",
        },
      ]);
      expect(await pathExists(created.path("opencode.json"))).toBe(false);
      expect(problems.map((problem) => problem.fix)).toEqual([
        "Replace .factory/templates/fifo with a file inside .factory/templates/",
      ]);
    },
  );
});
