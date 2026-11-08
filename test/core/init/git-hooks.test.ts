import { mkdir, readFile, rm, stat, symlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { HOOK_NAMES } from "../../../src/core/hooks/index.js";
import { GITATTRIBUTES_LINES } from "../../../src/core/init/gitattributes.js";
import { pathExists } from "../../../src/util/fs.js";
import { runCli } from "../../helpers/runCli.js";
import type { RunCliResult } from "../../helpers/runCli.js";
import { isolateGitConfig, makeTestRepo } from "../hooks/helpers.js";
import type { TestRepo } from "../hooks/helpers.js";

const SUGGESTION =
  'Add "npx --yes @seasb/metafab build" to scripts.setup in orca.yaml so new Orca worktrees get the factory skills.';

const GIT_HOOKS_QUESTION = "Run metafab build automatically after checkout, merge, and rebase?";

let isolation: Awaited<ReturnType<typeof isolateGitConfig>> | undefined;
const repos: TestRepo[] = [];

beforeEach(async () => {
  isolation = await isolateGitConfig();
});

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
  isolation?.restore();
  if (isolation !== undefined) {
    await rm(isolation.dir, { recursive: true, force: true });
    isolation = undefined;
  }
});

async function gitRepo(): Promise<TestRepo> {
  const repo = await makeTestRepo();
  repos.push(repo);
  return repo;
}

async function plainRepo(): Promise<TestRepo> {
  const repo = await makeTestRepo({ git: false });
  repos.push(repo);
  return repo;
}

function parseJson(result: RunCliResult): Record<string, unknown> {
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function config(repo: TestRepo): Promise<string> {
  return readFile(repo.path(".factory/metafab.yaml"), "utf8");
}

async function hookExists(repo: TestRepo, hook: string): Promise<boolean> {
  return pathExists(repo.path(".git", "hooks", hook));
}

describe("metafab init git-hooks", () => {
  test("answering yes writes git-hooks: true and installs the three hooks", async () => {
    const repo = await gitRepo();

    const result = await runCli(["init", "--agents", "claude"], {
      cwd: repo.root,
      tty: true,
      stdin: Readable.from(["y\n"]),
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toContain(GIT_HOOKS_QUESTION);
    expect(await config(repo)).toBe("agents: [claude]\ngit-hooks: true\n");
    for (const hook of HOOK_NAMES) {
      expect(await hookExists(repo, hook)).toBe(true);
      // Windows has no executable bit: the mode is not meaningful there.
      if (process.platform !== "win32") {
        expect((await stat(repo.path(".git", "hooks", hook))).mode & 0o777).toBe(0o755);
      }
      expect(result.stdout).toContain(`+ git hook ${hook}`);
    }
  });

  test("answering no writes git-hooks: false and installs no hooks", async () => {
    const repo = await gitRepo();

    const result = await runCli(["init", "--agents", "claude"], {
      cwd: repo.root,
      tty: true,
      stdin: Readable.from(["n\n"]),
    });

    expect(result.code).toBe(0);
    expect(await config(repo)).toBe("agents: [claude]\ngit-hooks: false\n");
    for (const hook of HOOK_NAMES) {
      expect(await hookExists(repo, hook)).toBe(false);
    }
  });

  test("leaves the key absent without a terminal and without a flag", async () => {
    const repo = await gitRepo();

    const result = await runCli(["init", "--agents", "claude"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(0);
    expect(await config(repo)).toBe("agents: [claude]\n");
    for (const hook of HOOK_NAMES) {
      expect(await hookExists(repo, hook)).toBe(false);
    }
  });

  test("--git-hooks skips the question and writes true", async () => {
    const repo = await gitRepo();

    const result = await runCli(["init", "--agents", "claude", "--git-hooks"], {
      cwd: repo.root,
      tty: true,
      stdin: Readable.from(["n\n"]),
    });

    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain(GIT_HOOKS_QUESTION);
    expect(await config(repo)).toBe("agents: [claude]\ngit-hooks: true\n");
    expect(await hookExists(repo, "post-merge")).toBe(true);
  });

  test("--no-git-hooks skips the question and writes false", async () => {
    const repo = await gitRepo();

    const result = await runCli(["init", "--agents", "claude", "--no-git-hooks"], {
      cwd: repo.root,
      tty: true,
      stdin: Readable.from(["y\n"]),
    });

    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain(GIT_HOOKS_QUESTION);
    expect(await config(repo)).toBe("agents: [claude]\ngit-hooks: false\n");
    expect(await hookExists(repo, "post-merge")).toBe(false);
  });

  test("both flags together is a usage error that writes nothing", async () => {
    const repo = await gitRepo();

    const result = await runCli(
      ["init", "--agents", "claude", "--git-hooks", "--no-git-hooks"],
      { cwd: repo.root },
    );

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Pass --git-hooks or --no-git-hooks, not both");
    expect(result.stderr).toContain("Pass --git-hooks or --no-git-hooks, not both");
    expect(await pathExists(repo.path(".factory"))).toBe(false);
    expect(await pathExists(repo.path(".gitattributes"))).toBe(false);
  });

  test("never changes an existing value and notes it", async () => {
    const repo = await gitRepo();
    await runCli(["init", "--agents", "claude", "--git-hooks"], { cwd: repo.root });

    const result = await runCli(["init", "--no-git-hooks"], { cwd: repo.root });

    expect(result.code).toBe(0);
    expect(await config(repo)).toBe("agents: [claude]\ngit-hooks: true\n");
    expect(result.stdout).toContain("git-hooks is already true in .factory/metafab.yaml");
    expect(result.stderr).not.toContain(GIT_HOOKS_QUESTION);
    expect(await hookExists(repo, "post-merge")).toBe(true);
  });

  test("leaves a present non-boolean value alone and reports the configuration error", async () => {
    const repo = await gitRepo();
    const original = 'agents: [claude]\ngit-hooks: "yes"\n';
    await repo.write(".factory/metafab.yaml", original);

    const result = await runCli(["init", "--agents", "claude", "--git-hooks"], { cwd: repo.root });

    expect(result.code).toBe(1);
    expect(await config(repo)).toBe(original);
    expect(result.stderr).toContain(`"git-hooks" must be a boolean.`);
    expect(await hookExists(repo, "post-merge")).toBe(false);
  });

  test("prints the note after Already initialised and includes it in JSON", async () => {
    const repo = await gitRepo();
    await repo.write(".factory/metafab.yaml", "agents: [claude]\ngit-hooks: false\n");
    await runCli(["init", "--agents", "claude"], { cwd: repo.root });

    const first = await runCli(["init", "--agents", "claude"], { cwd: repo.root });
    expect(first.code).toBe(0);
    expect(first.stdout).toBe(
      "Already initialised\ngit-hooks is already false in .factory/metafab.yaml\n",
    );

    const second = await runCli(["init", "--agents", "claude", "--json"], { cwd: repo.root });
    expect(second.code).toBe(0);
    const payload = parseJson(second);
    expect(payload.notes).toEqual(["git-hooks is already false in .factory/metafab.yaml"]);
    expect(payload.hooks).toEqual([]);
    expect(payload.suggestions).toEqual([]);
  });

  test("--json includes the installed hooks", async () => {
    const repo = await gitRepo();

    const result = await runCli(["init", "--agents", "claude", "--git-hooks", "--json"], {
      cwd: repo.root,
    });

    expect(result.code).toBe(0);
    const payload = parseJson(result);
    expect(payload.hooks).toEqual([
      { hook: "post-checkout", action: "created" },
      { hook: "post-merge", action: "created" },
      { hook: "post-rewrite", action: "created" },
    ]);
    expect(payload.notes).toEqual([]);
  });

  test("reports hook warnings in the init output", async () => {
    const repo = await gitRepo();
    await repo.write(".git/hooks/post-merge", "#!/bin/sh\necho foreign\n");

    const result = await runCli(["init", "--agents", "claude", "--git-hooks"], { cwd: repo.root });

    expect(result.code).toBe(0);
    expect(result.stderr).toContain(
      ".git/hooks/post-merge exists and was not written by Metafab",
    );
    expect(await readFile(repo.path(".git", "hooks", "post-merge"), "utf8")).toBe(
      "#!/bin/sh\necho foreign\n",
    );

    const json = await runCli(["init", "--agents", "claude", "--git-hooks", "--json"], {
      cwd: repo.root,
    });
    expect(json.code).toBe(0);
    const problems = parseJson(json).problems as { message: string }[];
    expect(
      problems.some((problem) =>
        problem.message.includes(".git/hooks/post-merge exists and was not written by Metafab"),
      ),
    ).toBe(true);
  });

  test("warns and still exits 0 with --git-hooks outside a Git repository", async () => {
    const repo = await plainRepo();

    const result = await runCli(["init", "--agents", "claude", "--git-hooks"], { cwd: repo.root });

    expect(result.code).toBe(0);
    expect(result.stderr).toContain(
      "git-hooks is true, but this is not a Git repository or git is not installed",
    );
  });

  test("suggests the Orca setup step when it creates metafab.yaml", async () => {
    const repo = await gitRepo();
    await repo.write("orca.yaml", "scripts:\n  setup: |\n    echo hello\n");

    const result = await runCli(["init", "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(SUGGESTION);

    const second = await runCli(["init", "--agents", "claude", "--json"], { cwd: repo.root });
    expect(second.code).toBe(0);
    expect(parseJson(second).suggestions).toEqual([]);
  });

  test("suggests the Orca setup step in JSON", async () => {
    const repo = await gitRepo();
    await repo.write("orca.yaml", "scripts:\n  setup: |\n    echo hello\n");

    const result = await runCli(["init", "--agents", "claude", "--json"], { cwd: repo.root });

    expect(result.code).toBe(0);
    expect(parseJson(result).suggestions).toEqual([SUGGESTION]);
  });

  test("does not suggest the Orca setup step when orca.yaml runs metafab build", async () => {
    const repo = await gitRepo();
    await repo.write("orca.yaml", "scripts:\n  setup: |\n    npx --yes @seasb/metafab build\n");

    const result = await runCli(["init", "--agents", "claude", "--json"], { cwd: repo.root });

    expect(result.code).toBe(0);
    expect(parseJson(result).suggestions).toEqual([]);
  });

  test("does not suggest the Orca setup step without orca.yaml", async () => {
    const repo = await gitRepo();

    const result = await runCli(["init", "--agents", "claude", "--json"], { cwd: repo.root });

    expect(result.code).toBe(0);
    expect(parseJson(result).suggestions).toEqual([]);
  });
});

describe.skipIf(process.platform === "win32")("metafab init write-through links", () => {
  test("refuses a dangling .factory/AGENTS.md link and writes no factory file", async () => {
    const repo = await gitRepo();
    await mkdir(repo.path(".factory"), { recursive: true });
    await symlink("../outside", repo.path(".factory", "AGENTS.md"));

    const result = await runCli(["init", "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      ".factory/AGENTS.md is a symbolic link, so metafab init will not write through it",
    );
    expect(result.stderr).toContain("Replace it with a regular file, then run metafab init again");
    expect(await pathExists(repo.path("outside"))).toBe(false);
    expect(await pathExists(repo.path(".factory", "factory.yaml"))).toBe(false);
    expect(await pathExists(repo.path(".factory", "metafab.yaml"))).toBe(false);
  });

  test("refuses a dangling .gitattributes link and writes no factory file", async () => {
    const repo = await gitRepo();
    await symlink("../outside", repo.path(".gitattributes"));

    const result = await runCli(["init", "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      ".gitattributes is a symbolic link, so metafab init will not write through it",
    );
    expect(result.stderr).toContain("Replace it with a regular file, then run metafab init again");
    expect(await pathExists(repo.path("outside"))).toBe(false);
    expect(await pathExists(repo.path(".factory", "factory.yaml"))).toBe(false);
    expect(await pathExists(repo.path(".factory", "metafab.yaml"))).toBe(false);
  });

  test("leaves a .gitattributes link to a file that already has every line alone", async () => {
    const content = `${GITATTRIBUTES_LINES.join("\n")}\n`;
    const repo = await gitRepo();
    await repo.write("shared/attrs", content);
    await symlink("shared/attrs", repo.path(".gitattributes"));

    const result = await runCli(["init", "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(0);
    expect(await readFile(repo.path("shared", "attrs"), "utf8")).toBe(content);
  });
});
