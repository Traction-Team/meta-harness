import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { EnvConfigEntry } from "../../../src/core/env/git-config.js";
import { createEnvConfigReader, readEnvConfig } from "../../../src/core/env/git-config.js";
import { resolveSelection } from "../../../src/core/env/select.js";
import type { EnvVariable } from "../../../src/core/env/types.js";
import { runGit } from "../../../src/util/git.js";
import { isolateGitConfig } from "../hooks/helpers.js";

const FILE = ".factory/factory.yaml";
const PATTERN = ["config", "-z", "--show-scope", "--get-regexp", "^factory\\.env\\."];

/** Verified with Git 2.50: two keys, one of them set twice, one with no value. */
const PINNED_BYTES =
  "local\0factory.env.harness\namp\0local\0factory.env.harness\nx\ny\0local\0factory.env.workspace\0";

const PINNED_ENTRIES: EnvConfigEntry[] = [
  { scope: "local", variable: "harness", value: "amp" },
  { scope: "local", variable: "harness", value: "x\ny" },
  { scope: "local", variable: "workspace", value: "" },
];

const HARNESS: EnvVariable = {
  name: "harness",
  values: [
    { name: "opencode", label: "In OpenCode", line: 6 },
    { name: "claude", label: "In Claude Code", line: 7 },
    { name: "amp", label: "When harness is amp", line: 8 },
  ],
  default: ["claude"],
  line: 5,
};

const EDITOR: EnvVariable = {
  name: "editor",
  values: [
    { name: "vim", label: "When editor is vim", line: 22 },
    { name: "vscode", label: "When editor is vscode", line: 23 },
  ],
  line: 21,
};

let isolation: Awaited<ReturnType<typeof isolateGitConfig>>;
const dirs: string[] = [];

beforeEach(async () => {
  isolation = await isolateGitConfig();
});

afterEach(async () => {
  isolation.restore();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  await rm(isolation.dir, { recursive: true, force: true });
});

async function tempDir(prefix = "metafab-env-"): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await runGit(args, { cwd });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

async function repo(): Promise<string> {
  const dir = await tempDir();
  await git(dir, "init", "--quiet");
  return dir;
}

describe("readEnvConfig", () => {
  test("reads every scope, and the highest-priority scope decides the selection", async () => {
    const root = await repo();
    await git(root, "config", "--system", "factory.env.harness", "amp");
    await git(root, "config", "--global", "factory.env.harness", "claude");
    await git(root, "config", "factory.env.harness", "opencode");
    await git(root, "config", "extensions.worktreeConfig", "true");
    await git(root, "config", "--worktree", "factory.env.harness", "amp");

    const { entries, warnings } = await readEnvConfig(root);
    expect(warnings).toEqual([]);
    expect(entries).toEqual([
      { scope: "system", variable: "harness", value: "amp" },
      { scope: "global", variable: "harness", value: "claude" },
      { scope: "local", variable: "harness", value: "opencode" },
      { scope: "worktree", variable: "harness", value: "amp" },
    ]);

    const selected = async () =>
      (await resolveSelection([HARNESS], { root, processEnv: {} })).variables[0];

    expect(await selected()).toEqual({
      variable: "harness",
      values: ["amp"],
      source: "git",
      scope: "worktree",
    });

    await git(root, "config", "--worktree", "--unset-all", "factory.env.harness");
    expect(await selected()).toEqual({
      variable: "harness",
      values: ["opencode"],
      source: "git",
      scope: "local",
    });

    await git(root, "config", "--local", "--unset-all", "factory.env.harness");
    expect(await selected()).toEqual({
      variable: "harness",
      values: ["claude"],
      source: "git",
      scope: "global",
    });

    await git(root, "config", "--global", "--unset-all", "factory.env.harness");
    expect(await selected()).toEqual({
      variable: "harness",
      values: ["amp"],
      source: "git",
      scope: "system",
    });
  });

  test("repeated keys in one scope combine", async () => {
    const root = await repo();
    await git(root, "config", "--add", "factory.env.harness", "opencode");
    await git(root, "config", "--add", "factory.env.harness", "amp");

    const { entries } = await readEnvConfig(root);
    expect(entries.map((entry) => entry.value)).toEqual(["opencode", "amp"]);

    const result = await resolveSelection([HARNESS], { root, processEnv: {} });
    expect(result.variables[0]).toEqual({
      variable: "harness",
      values: ["opencode", "amp"],
      source: "git",
      scope: "local",
    });
  });

  test("outside a repository a global value is read", async () => {
    const dir = await tempDir();
    await git(dir, "config", "--global", "factory.env.harness", "amp");

    expect(await readEnvConfig(dir)).toEqual({
      entries: [{ scope: "global", variable: "harness", value: "amp" }],
      warnings: [],
    });
  });

  test("without Git on PATH there is nothing and no warning", async () => {
    const root = await repo();
    const previous = process.env.PATH;
    // An existing but empty directory: no `git` on PATH, and no fallback to cwd.
    process.env.PATH = isolation.dir;
    try {
      expect(await readEnvConfig(root)).toEqual({ entries: [], warnings: [] });
    } finally {
      if (previous === undefined) delete process.env.PATH;
      else process.env.PATH = previous;
    }
  });

  test("Git before 2.26 gives one warning and no entries", async () => {
    const read = createEnvConfigReader(async () => ({
      exitCode: 129,
      stdout: "",
      stderr: "error: unknown option `show-scope'\nusage: git config [<options>]\n",
    }));

    expect(await read("/repo")).toEqual({
      entries: [],
      warnings: [
        {
          level: "warning",
          file: FILE,
          message: "Git 2.26 or later is needed to read factory.env.* from Git config",
          fix: "Upgrade Git, or select with --env or FACTORY_ENV_<VARIABLE>",
        },
      ],
    });
  });

  test("parses the pinned byte layout", async () => {
    const read = createEnvConfigReader(async () => ({
      exitCode: 0,
      stdout: PINNED_BYTES,
      stderr: "",
    }));

    expect(await read("/repo")).toEqual({ entries: PINNED_ENTRIES, warnings: [] });
  });

  test("a real repository produces the pinned byte layout", async () => {
    const root = await repo();
    await git(root, "config", "factory.env.harness", "amp");
    await git(root, "config", "--add", "factory.env.harness", "x\ny");
    await appendFile(path.join(root, ".git", "config"), '[factory "env"]\n\tworkspace\n');

    const result = await runGit(PATTERN, { cwd: root });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(PINNED_BYTES);
    expect(await readEnvConfig(root)).toEqual({ entries: PINNED_ENTRIES, warnings: [] });
  });

  test("truncated output gives one warning and no entries", async () => {
    const read = createEnvConfigReader(async () => ({
      exitCode: 0,
      stdout: "local\0factory.env.harness\namp",
      stderr: "",
    }));

    expect(await read("/repo")).toEqual({
      entries: [],
      warnings: [
        {
          level: "warning",
          file: FILE,
          message: "Cannot read factory.env.* from Git config: unexpected output from git config",
          fix: "Fix the Git config file, or select with --env or FACTORY_ENV_<VARIABLE>",
        },
      ],
    });
  });

  test("a value with an embedded newline is one value that the factory ignores", async () => {
    const root = await repo();
    await git(root, "config", "factory.env.harness", "amp\nopencode");

    expect((await readEnvConfig(root)).entries).toEqual([
      { scope: "local", variable: "harness", value: "amp\nopencode" },
    ]);

    const result = await resolveSelection([HARNESS], { root, processEnv: {} });
    expect(result.variables[0]).toEqual({
      variable: "harness",
      values: ["claude"],
      source: "default",
    });
    expect(result.warnings).toEqual([
      {
        level: "warning",
        file: FILE,
        line: 5,
        message:
          'Ignored "amp\nopencode" from factory.env.harness in local Git config: harness does not declare it',
        fix: "Declared values: opencode, claude, amp",
      },
    ]);
  });

  test("a Git failure gives one warning and the selection falls through", async () => {
    const read = createEnvConfigReader(async () => ({
      exitCode: 128,
      stdout: "",
      stderr: "fatal: bad config line 3 in file .git/config\n",
    }));

    expect(await read("/repo")).toEqual({
      entries: [],
      warnings: [
        {
          level: "warning",
          file: FILE,
          message: "Cannot read factory.env.* from Git config: fatal: bad config line 3 in file .git/config",
          fix: "Fix the Git config file, or select with --env or FACTORY_ENV_<VARIABLE>",
        },
      ],
    });

    const result = await resolveSelection([HARNESS, EDITOR], {
      root: "/repo",
      processEnv: {},
      readConfig: read,
    });
    expect(result.variables).toEqual([
      { variable: "harness", values: ["claude"], source: "default" },
      { variable: "editor", values: ["vim", "vscode"], source: "all" },
    ]);
  });

  test("a command-scope record is ignored silently", async () => {
    const read = createEnvConfigReader(async () => ({
      exitCode: 0,
      stdout: "command\0factory.env.harness\namp\0",
      stderr: "",
    }));

    expect(await read("/repo")).toEqual({ entries: [], warnings: [] });
  });

  test("a key under a subsection names no variable", async () => {
    const root = await repo();
    await git(root, "config", "--global", "factory.env.other.harness", "amp");

    expect(await readEnvConfig(root)).toEqual({ entries: [], warnings: [] });

    const result = await resolveSelection([HARNESS], { root, processEnv: {} });
    expect(result.variables[0]).toEqual({
      variable: "harness",
      values: ["claude"],
      source: "default",
    });
    expect(result.warnings).toEqual([]);
  });
});
