import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode } from "../../src/errors.js";
import { copyTree, pathExists } from "../../src/util/fs.js";
import { runGit } from "../../src/util/git.js";
import { isolateGitConfig } from "../core/hooks/helpers.js";
import { runCli } from "../helpers/runCli.js";

const FIXTURE = fileURLToPath(new URL("../fixtures/env/factory", import.meta.url));
const NO_VARIABLES = "This factory declares no environment variables.";
const KEY = "factory.env.harness";

const dirs: string[] = [];
let isolation: Awaited<ReturnType<typeof isolateGitConfig>>;
let savedEnvironment: [string, string | undefined][] = [];

beforeEach(async () => {
  isolation = await isolateGitConfig();
  // No developer's FACTORY_ENV_* may decide a test's selection.
  savedEnvironment = Object.entries(process.env).filter(([key]) =>
    key.toUpperCase().startsWith("FACTORY_ENV_"),
  );
  for (const [key] of savedEnvironment) delete process.env[key];
});

afterEach(async () => {
  for (const [key, value] of savedEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnvironment = [];
  isolation.restore();
  await rm(isolation.dir, { recursive: true, force: true });
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "metafab-env-cli-"));
  dirs.push(dir);
  return dir;
}

async function write(root: string, relativePath: string, content: string): Promise<void> {
  const target = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function git(cwd: string, args: string[]): Promise<void> {
  const result = await runGit(args, { cwd });
  expect(result.exitCode, result.stderr).toBe(0);
}

/** A copy of the format 2 factory fixture, in a Git repository unless asked otherwise. */
async function envRepo(options: { git?: boolean } = {}): Promise<string> {
  const root = await tempDir();
  await copyTree(FIXTURE, root);
  if (options.git !== false) await git(root, ["init", "--quiet"]);
  return root;
}

/** Every value of the key, or an empty list when it is not set. */
async function configValues(cwd: string, scope = "--local"): Promise<string[]> {
  const result = await runGit(["config", scope, "--get-all", KEY], { cwd });
  if (result.exitCode !== 0) return [];
  return result.stdout.split("\n").filter((line) => line !== "");
}

function env(argv: readonly string[], cwd: string): ReturnType<typeof runCli> {
  return runCli(argv, { cwd, tty: false });
}

describe("metafab env", () => {
  test("prints each variable, its selected values and the source of each", async () => {
    const root = await envRepo();

    const result = await env(["env"], root);

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      [
        "harness    opencode, claude, amp  every value (nothing selected)",
        "workspace  worktree               default in factory.yaml",
        "",
      ].join("\n"),
    );
  });

  test("names every source it can take a selection from", async () => {
    const root = await envRepo();

    const preview = await env(["env", "--env", "harness=amp"], root);
    expect(preview.stdout).toContain("harness    amp");
    expect(preview.stdout).toContain("--env");

    process.env.FACTORY_ENV_HARNESS = "amp";
    const fromEnvironment = await env(["env"], root);
    delete process.env.FACTORY_ENV_HARNESS;
    expect(fromEnvironment.stdout).toContain("FACTORY_ENV_HARNESS");

    await git(root, ["config", KEY, "claude"]);
    const fromGit = await env(["env"], root);
    expect(fromGit.stdout).toContain("harness    claude");
    expect(fromGit.stdout).toContain("Git config (local)");
  });

  test("a factory with no variables says so and exits 0", async () => {
    const root = await tempDir();
    await write(root, ".factory/factory.yaml", "format: 1\nname: demo\n");
    await write(root, ".factory/metafab.yaml", "agents: [claude]\n");

    const result = await env(["env"], root);

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout.trim()).toBe(NO_VARIABLES);
  });

  test("a factory.yaml error exits 1", async () => {
    const root = await envRepo();
    await write(
      root,
      ".factory/factory.yaml",
      "format: 1\nname: dragonfly\nenv:\n  harness:\n    values: [amp]\n",
    );

    const result = await env(["env"], root);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain('"env" needs format: 2');
  });

  test("a broken skill does not stop it", async () => {
    const root = await envRepo();
    await write(root, ".factory/skills/broken/SKILL.md", "# No frontmatter\n");

    const result = await env(["env"], root);

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("harness");
  });
});

describe("metafab env --json", () => {
  test("pins the whole result", async () => {
    const root = await envRepo();
    await git(root, ["config", KEY, "claude,opencode"]);

    const result = await env(["env", "--json"], root);

    expect(result.code).toBe(ExitCode.Ok);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      command: "env",
      exitCode: 0,
      problems: [],
      variables: [
        {
          name: "harness",
          description: "The agent tool that runs the workflows",
          values: [
            { name: "opencode", label: "In OpenCode" },
            { name: "claude", label: "In Claude Code" },
            { name: "amp", label: "In Amp (AMP_THREAD_ID is set)" },
          ],
          selected: ["opencode", "claude"],
          source: "git",
          scope: "local",
        },
        {
          name: "workspace",
          values: [
            { name: "orca", label: "When workspace is orca" },
            { name: "worktree", label: "When workspace is worktree" },
          ],
          selected: ["worktree"],
          source: "default",
        },
      ],
    });
  });

  test("a FACTORY_ENV_* variable is named as the source", async () => {
    const root = await envRepo();
    process.env.FACTORY_ENV_HARNESS = "amp";

    const result = await env(["env", "--json"], root);

    const parsed = JSON.parse(result.stdout) as {
      variables: { name: string; selected: string[]; source: string; from?: string }[];
    };
    const harness = parsed.variables.find((variable) => variable.name === "harness");
    expect(harness).toEqual({
      name: "harness",
      description: "The agent tool that runs the workflows",
      values: [
        { name: "opencode", label: "In OpenCode" },
        { name: "claude", label: "In Claude Code" },
        { name: "amp", label: "In Amp (AMP_THREAD_ID is set)" },
      ],
      selected: ["amp"],
      source: "environment",
      from: "FACTORY_ENV_HARNESS",
    });
  });
});

describe("metafab env set", () => {
  test("writes repository Git config, then builds", async () => {
    const root = await envRepo();

    const result = await env(["env", "set", "harness=claude,opencode"], root);

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toContain("factory.env.harness set to claude,opencode in repository config");
    expect(await configValues(root)).toEqual(["claude,opencode"]);
    expect(await pathExists(path.join(root, ".claude", "skills", "hello", "SKILL.md"))).toBe(true);
  });

  test("--global writes global Git config", async () => {
    const root = await envRepo();

    const result = await env(["env", "set", "harness=amp", "--global"], root);

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toContain("in global config");
    expect(await configValues(root, "--global")).toEqual(["amp"]);
    expect(await configValues(root)).toEqual([]);
  });

  test("replaces the values that --add wrote", async () => {
    const root = await envRepo();
    await git(root, ["config", "--add", KEY, "amp"]);
    await git(root, ["config", "--add", KEY, "claude"]);

    const result = await env(["env", "set", "harness=opencode"], root);

    expect(result.code).toBe(ExitCode.Ok);
    expect(await configValues(root)).toEqual(["opencode"]);
  });

  test("refuses an undeclared value and writes nothing", async () => {
    const root = await envRepo();

    const result = await env(["env", "set", "harness=zed"], root);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain('Value "zed" is not declared for "harness"');
    expect(result.stderr).toContain("fix: Declared values: opencode, claude, amp");
    expect(await configValues(root)).toEqual([]);
  });

  test("refuses an empty value and points at env unset", async () => {
    const root = await envRepo();

    const result = await env(["env", "set", "harness="], root);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("metafab env set harness= names no value");
    expect(result.stderr).toContain("fix: Run metafab env unset harness");
    expect(await configValues(root)).toEqual([]);
  });

  test("outside a repository it needs --global", async () => {
    const root = await envRepo({ git: false });

    const refused = await env(["env", "set", "harness=amp"], root);
    expect(refused.code).toBe(ExitCode.Failed);
    expect(refused.stderr).toContain(
      "metafab env set needs a Git repository for repository config",
    );
    expect(refused.stderr).toContain("fix: Use --global, or set FACTORY_ENV_HARNESS");

    const allowed = await env(["env", "set", "harness=amp", "--global"], root);
    expect(allowed.code).toBe(ExitCode.Ok);
    expect(await configValues(root, "--global")).toEqual(["amp"]);
  });

  test("warns when FACTORY_ENV_* still decides the selection", async () => {
    const root = await envRepo();
    process.env.FACTORY_ENV_HARNESS = "opencode";

    const result = await env(["env", "set", "harness=amp"], root);

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stderr).toContain("FACTORY_ENV_HARNESS is set and overrides Git config");
    expect(await configValues(root)).toEqual(["amp"]);
  });

  test("warns when a higher scope still decides the selection", async () => {
    const root = await envRepo();
    await git(root, ["config", KEY, "claude"]);

    const result = await env(["env", "set", "harness=amp", "--global"], root);

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stderr).toContain(
      "factory.env.harness is also set in local config, which takes priority",
    );
  });

  test("a second set reports Up to date.", async () => {
    const root = await envRepo();
    await env(["env", "set", "harness=amp"], root);

    const result = await env(["env", "set", "harness=amp"], root);

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toContain("Up to date.");
  });

  test("a failed build keeps the change and warns", async () => {
    const root = await envRepo();
    await write(root, ".factory/skills/broken/SKILL.md", "# No frontmatter\n");

    const result = await env(["env", "set", "harness=amp", "--json"], root);

    expect(result.code).toBe(ExitCode.Failed);
    expect(await configValues(root)).toEqual(["amp"]);
    const parsed = JSON.parse(result.stdout) as {
      ok: boolean;
      exitCode: number;
      problems: { level: string; message: string; fix?: string }[];
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.exitCode).toBe(ExitCode.Failed);
    expect(parsed.problems.some((problem) => problem.message.includes("Missing frontmatter"))).toBe(
      true,
    );
    expect(parsed.problems.at(-1)).toEqual({
      level: "warning",
      file: ".factory/factory.yaml",
      line: 5,
      message: "factory.env.harness changed, but the installed output was not rebuilt",
      fix: "Fix the problems above, then run metafab build",
    });
  });

  test("a Git config file Git cannot write exits 1 with its message", async () => {
    const root = await envRepo();
    const previous = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = path.join(root, "missing-directory", "config");
    try {
      const result = await env(["env", "set", "harness=amp", "--global"], root);

      expect(result.code).toBe(ExitCode.Failed);
      expect(result.stderr).toContain("Cannot change factory.env.harness in Git config:");
      expect(result.stderr).toContain("could not lock config file");
      expect(await pathExists(path.join(root, ".claude"))).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      else process.env.GIT_CONFIG_GLOBAL = previous;
    }
  });

  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "a read-only global config file exits 1 with Git's message",
    async () => {
      const root = await envRepo();
      const directory = path.dirname(process.env.GIT_CONFIG_GLOBAL!);
      await chmod(directory, 0o555);
      try {
        const result = await env(["env", "set", "harness=amp", "--global"], root);

        expect(result.code).toBe(ExitCode.Failed);
        expect(result.stderr).toContain("Cannot change factory.env.harness in Git config:");
        expect(result.stderr).toContain("fix:");
      } finally {
        await chmod(directory, 0o755);
      }
    },
  );
});

describe("metafab env unset", () => {
  test("removes the key and rebuilds", async () => {
    const root = await envRepo();
    await git(root, ["config", KEY, "claude"]);

    const result = await env(["env", "unset", "harness"], root);

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toContain("factory.env.harness removed from repository config");
    expect(await configValues(root)).toEqual([]);
  });

  test("a key that is not set is not an error", async () => {
    const root = await envRepo();
    const built = await env(["build"], root);
    expect(built.code).toBe(ExitCode.Ok);

    const result = await env(["env", "unset", "harness"], root);

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toContain("factory.env.harness was not set in repository config");
    expect(result.stdout).toContain("Up to date.");
  });

  test("removes a global key another factory declared", async () => {
    const root = await envRepo();
    await git(root, ["config", "--global", KEY, "amp"]);

    const result = await env(["env", "unset", "workspace", "--global"], root);

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toContain("factory.env.workspace was not set in global config");
  });
});

describe("metafab env subcommands", () => {
  test("an unknown subcommand suggests set", async () => {
    const root = await envRepo();

    const result = await env(["env", "sett"], root);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain('Unknown env subcommand "sett"');
    expect(result.stderr).toContain('Did you mean "set"?');
  });

  test("env set without its argument names the usage", async () => {
    const root = await envRepo();

    const result = await env(["env", "set"], root);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("metafab env set needs one <variable>=<values>");
  });
});
