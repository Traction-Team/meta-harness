import { chmod, readdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ExitCode } from "../../../src/errors.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";

const DEMO_SKILL =
  "---\nname: demo\ndescription: Demo. Use when testing.\n---\n\n# Demo\n";

const WITH_TEMPLATE = [
  "format: 1",
  "name: demo",
  "requires:",
  "  - path: opencode.json",
  "    description: Defines the agent-coding sub-agent",
  "    template: .factory/templates/setup/opencode.json",
  "",
].join("\n");

const WITHOUT_TEMPLATE = [
  "format: 1",
  "name: demo",
  "requires:",
  "  - path: docs/roadmap.md",
  "    description: The roadmap the workflows read",
  "",
].join("\n");

const repos: TempRepo[] = [];

function track(repo: TempRepo): TempRepo {
  repos.push(repo);
  return repo;
}

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

function checkRepo(factoryYaml: string, files: RepoFiles = {}): Promise<TempRepo> {
  return makeRepo({
    ".factory/factory.yaml": factoryYaml,
    ".factory/metafab.yaml": "agents: [codex]\nmetafab-skill: false\n",
    ".factory/skills/demo/SKILL.md": DEMO_SKILL,
    ...files,
  }).then(track);
}

async function build(root: string): Promise<void> {
  const result = await runCli(["build"], { cwd: root, tty: false });
  if (result.code !== ExitCode.Ok) {
    throw new Error(`build failed: ${result.stdout}${result.stderr}`);
  }
}

/** Every entry in the repository outside `.factory/`, as `/`-separated paths. */
async function outsideFactory(root: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(relative: string): Promise<void> {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const next = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (next === ".factory") continue;
      if (entry.isDirectory()) {
        found.push(`${next}/`);
        await walk(next);
      } else {
        found.push(next);
      }
    }
  }

  await walk("");
  return found.sort();
}

describe("check required repository files", () => {
  test("a missing required file is a warning with the copy fix, and exits 0", async () => {
    const repo = await checkRepo(WITH_TEMPLATE, {
      ".factory/templates/setup/opencode.json": "{}\n",
    });
    await build(repo.root);

    const result = await runCli(["check"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toBe("0 errors, 1 warning\n");
    expect(result.stderr).toBe(
      [
        ".factory/factory.yaml:4: warning: Required file opencode.json is missing: Defines the agent-coding sub-agent",
        "  fix: Copy .factory/templates/setup/opencode.json to opencode.json",
        "",
      ].join("\n"),
    );
  });

  test("a blocked path gives the blocked wording and a fix naming the entry in the way", async () => {
    const repo = await checkRepo(WITHOUT_TEMPLATE, { "docs/roadmap.md/inside.md": "body\n" });
    await build(repo.root);

    const result = await runCli(["check"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toBe("0 errors, 1 warning\n");
    expect(result.stderr).toBe(
      [
        ".factory/factory.yaml:4: warning: Required file docs/roadmap.md cannot be created: docs/roadmap.md is a directory",
        "  fix: Move docs/roadmap.md away, then create docs/roadmap.md",
        "",
      ].join("\n"),
    );
  });

  test("a present required file gives no warning, with or without a template", async () => {
    const repo = await checkRepo(WITH_TEMPLATE, {
      ".factory/templates/setup/opencode.json": "{}\n",
      "opencode.json": "mine\n",
    });
    await build(repo.root);

    const result = await runCli(["check"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toBe("0 errors, 0 warnings\n");
    expect(result.stderr).toBe("");

    const untemplated = await checkRepo(WITHOUT_TEMPLATE, { "docs/roadmap.md": "# Roadmap\n" });
    await build(untemplated.root);

    const again = await runCli(["check"], { cwd: untemplated.root, tty: false });

    expect(again.code).toBe(ExitCode.Ok);
    expect(again.stdout).toBe("0 errors, 0 warnings\n");
    expect(again.stderr).toBe("");
  });

  const permissionsSkip = process.platform === "win32" || process.getuid?.() === 0;

  test.skipIf(permissionsSkip)("an unreadable parent gives the check-permissions fix", async () => {
    const repo = await checkRepo(WITHOUT_TEMPLATE, { "docs/other.md": "# Other\n" });
    await build(repo.root);
    await chmod(repo.path("docs"), 0o000);

    try {
      const result = await runCli(["check"], { cwd: repo.root, tty: false });

      expect(result.code).toBe(ExitCode.Ok);
      expect(result.stdout).toBe("0 errors, 1 warning\n");
      expect(result.stderr).toBe(
        [
          ".factory/factory.yaml:4: warning: Required file docs/roadmap.md cannot be created: Cannot read docs",
          "  fix: Check the permissions of docs, then run metafab check again",
          "",
        ].join("\n"),
      );
    } finally {
      await chmod(repo.path("docs"), 0o755);
    }
  });
});

describe("build required repository files", () => {
  test("a missing required file changes nothing outside the build output and gives no warning", async () => {
    const plain = await checkRepo("format: 1\nname: demo\n");
    await build(plain.root);
    const owned = await outsideFactory(plain.root);

    const required: RepoFiles = {
      ".factory/templates/setup/opencode.json": "{}\n",
    };
    const repo = await checkRepo(
      [
        "format: 1",
        "name: demo",
        "requires:",
        "  - path: opencode.json",
        "    description: Defines the agent-coding sub-agent",
        "    template: .factory/templates/setup/opencode.json",
        "  - path: docs/roadmap.md",
        "    description: The roadmap the workflows read",
        "",
      ].join("\n"),
      required,
    );

    const result = await runCli(["build", "--json"], { cwd: repo.root, tty: false });
    const payload = JSON.parse(result.stdout) as {
      problems: Array<{ message: string }>;
      changed: Array<{ path: string }>;
    };

    expect(result.code).toBe(ExitCode.Ok);
    expect(await outsideFactory(repo.root)).toEqual(owned);
    expect(
      payload.problems.some((problem) => problem.message.includes("Required file")),
    ).toBe(false);
    expect(payload.changed.some((change) => change.path === "opencode.json")).toBe(false);
  });
});
