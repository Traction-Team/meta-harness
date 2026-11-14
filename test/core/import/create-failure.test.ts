import { readFile, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { pathExists } from "../../../src/util/fs.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

/** When set, an exclusive create of a path ending with it fails with EACCES. */
let failing: string | undefined;

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  failing = undefined;
  vi.mocked(writeFile).mockImplementation((async (
    target: string,
    data: unknown,
    options?: { flag?: string },
  ) => {
    if (
      failing !== undefined &&
      String(target).endsWith(failing) &&
      options?.flag === "wx"
    ) {
      throw Object.assign(new Error("EACCES: permission denied, open"), { code: "EACCES" });
    }
    return (actual.writeFile as (...values: unknown[]) => Promise<void>)(target, data, options);
  }) as never);
});

const repos: TempRepo[] = [];

afterEach(async () => {
  failing = undefined;
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

function fabFiles(): RepoFiles {
  return {
    ".factory/factory.yaml": [
      "format: 1",
      "name: demo-fab",
      "",
      "requires:",
      "  - path: opencode.json",
      "    description: Defines the agent-coding sub-agent that every workflow starts",
      "    template: .factory/templates/setup/opencode.json",
      "",
    ].join("\n"),
    ".factory/templates/setup/opencode.json": '{\n  "agent": {}\n}\n',
    ".factory/AGENTS.md": "# Agents\n",
  };
}

describe("import requires creation failure", { timeout: 30_000 }, () => {
  test("a file that cannot be created is a warning, exit 0 and the factory is in place", async () => {
    const repo = await makeRepo({}, { git: true });
    repos.push(repo);
    const fab = await makeRepo(fabFiles());
    repos.push(fab);
    failing = "opencode.json";

    const result = await runCli(["import", fab.root, "--agents", "claude", "--setup", "--json"], {
      cwd: repo.root,
    });

    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      requires: { path: string; state: string; reason?: string }[];
      problems: { level: string; file: string; message: string; fix?: string }[];
    };
    expect(payload.requires[0]).toMatchObject({ path: "opencode.json", state: "failed" });
    expect(payload.problems).toContainEqual({
      level: "warning",
      file: "opencode.json",
      message: "Could not create opencode.json: EACCES",
      fix: "Copy .factory/templates/setup/opencode.json to opencode.json",
    });

    expect(await pathExists(repo.path(".factory", "factory.yaml"))).toBe(true);
    expect(await readFile(repo.path(".factory", "metafab.yaml"), "utf8")).toContain("upstream:");
    expect(await pathExists(repo.path("opencode.json"))).toBe(false);
  });
});
