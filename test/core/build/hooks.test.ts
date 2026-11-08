import { mkdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode } from "../../../src/errors.js";
import { runGit } from "../../../src/util/git.js";
import { isolateGitConfig } from "../hooks/helpers.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";

let isolation: Awaited<ReturnType<typeof isolateGitConfig>> | undefined;
const repos: TempRepo[] = [];
const temporary: string[] = [];

beforeEach(async () => {
  isolation = await isolateGitConfig();
});

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  isolation?.restore();
  if (isolation !== undefined) {
    await rm(isolation.dir, { recursive: true, force: true });
    isolation = undefined;
  }
});

async function buildRepo(files: RepoFiles = {}, git = true): Promise<TempRepo> {
  const repo = await makeRepo(
    {
      ".factory/factory.yaml": "format: 1\nname: demo\n",
      ".factory/metafab.yaml": "agents: [codex]\nmetafab-skill: false\ngit-hooks: true\n",
      ".factory/skills/demo/SKILL.md":
        "---\nname: demo\ndescription: Demo. Use when testing.\n---\n\n# Demo\n",
      ...files,
    },
    { git },
  );
  repos.push(repo);
  return repo;
}

function hookPath(repo: TempRepo, hook: string): string {
  return repo.path(".git", "hooks", hook);
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  const result = await runGit(args, { cwd });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
}

describe.skipIf(process.platform === "win32")("build and Git hooks", () => {
  test("installs the three hooks after the file output", async () => {
    const repo = await buildRepo();

    const result = await runCli(["build"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("+ git hook post-checkout");
    expect(result.stdout).toContain("+ git hook post-merge");
    expect(result.stdout).toContain("+ git hook post-rewrite");
    expect(result.stdout.indexOf("+ AGENTS.md")).toBeLessThan(
      result.stdout.indexOf("+ git hook post-checkout"),
    );

    for (const hook of ["post-checkout", "post-merge", "post-rewrite"]) {
      expect((await stat(hookPath(repo, hook))).mode & 0o777).toBe(0o755);
      expect(await readFile(hookPath(repo, hook), "utf8")).toContain("# metafab:start");
    }

    const second = await runCli(["build"], { cwd: repo.root, tty: false });
    expect(second.code).toBe(ExitCode.Ok);
    expect(second.stdout).toBe("Up to date.\n");
  });

  test("adds hooks and hook warnings to the JSON result", async () => {
    const repo = await buildRepo();
    const hooksDir = repo.path(".git", "hooks");
    const foreign = "#!/bin/sh\necho custom\n";
    await mkdir(hooksDir, { recursive: true });
    await writeFile(path.join(hooksDir, "post-merge"), foreign);

    const result = await runCli(["build", "--json"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stderr).toBe("");
    const json = JSON.parse(result.stdout) as {
      hooks: { hook: string; action: string }[];
      problems: { level: string; file: string; message: string; fix?: string }[];
    };
    expect(json.hooks).toContainEqual({ hook: "post-checkout", action: "created" });
    expect(json.hooks).toContainEqual({ hook: "post-rewrite", action: "created" });
    expect(json.hooks.some((change) => change.hook === "post-merge")).toBe(false);
    expect(json.problems).toContainEqual({
      level: "warning",
      file: ".git/hooks/post-merge",
      message: ".git/hooks/post-merge exists and was not written by Metafab",
      fix: expect.stringContaining("Add this line to .git/hooks/post-merge:"),
    });
    expect(await readFile(path.join(hooksDir, "post-merge"), "utf8")).toBe(foreign);
  });

  test("still exits 0 with one warning when git is not installed", async () => {
    const repo = await buildRepo({}, false);
    const previousPath = process.env.PATH;

    try {
      process.env.PATH = "";
      const result = await runCli(["build"], { cwd: repo.root, tty: false });

      expect(result.code).toBe(ExitCode.Ok);
      expect(result.stderr).toContain(
        "git-hooks is true, but this is not a Git repository or git is not installed",
      );
      expect(result.stderr).toContain("fix: Install Git, or set git-hooks: false");
      expect(result.stdout).toContain("+ AGENTS.md");
      expect(await exists(hookPath(repo, "post-merge"))).toBe(false);
    } finally {
      process.env.PATH = previousPath;
    }
  });

  test("writes hooks to the shared .git/hooks in a linked worktree", async () => {
    const repo = await buildRepo();
    await git(repo.root, "config", "user.name", "Metafab Test");
    await git(repo.root, "config", "user.email", "metafab@example.com");
    await git(repo.root, "add", "-A");
    await git(repo.root, "commit", "--quiet", "-m", "factory");

    const worktree = `${repo.root}-wt`;
    temporary.push(worktree);
    await git(repo.root, "worktree", "add", worktree, "-b", "linked", "--quiet");

    const result = await runCli(["build"], { cwd: worktree, tty: false });

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toContain("+ git hook post-checkout");
    expect(await exists(hookPath(repo, "post-checkout"))).toBe(true);
    expect(
      await exists(
        path.join(repo.root, ".git", "worktrees", path.basename(worktree), "hooks", "post-checkout"),
      ),
    ).toBe(false);
  });

  test("check neither installs nor rewrites hooks", async () => {
    const repo = await buildRepo();
    await runCli(["build"], { cwd: repo.root, tty: false });
    const before = await readFile(hookPath(repo, "post-checkout"), "utf8");
    await unlink(hookPath(repo, "post-merge"));

    const result = await runCli(["check"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Ok);
    expect(await exists(hookPath(repo, "post-merge"))).toBe(false);
    expect(await readFile(hookPath(repo, "post-checkout"), "utf8")).toBe(before);
    expect(await exists(hookPath(repo, "post-rewrite"))).toBe(true);
  });
});

describe("build in a directory without Git", () => {
  test("does not warn when git-hooks is off", async () => {
    const repo = await buildRepo(
      { ".factory/metafab.yaml": "agents: [codex]\nmetafab-skill: false\n" },
      false,
    );

    const result = await runCli(["build"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stderr).toBe("");
    const json = await runCli(["build", "--json"], { cwd: repo.root, tty: false });
    expect((JSON.parse(json.stdout) as { hooks: unknown[] }).hooks).toEqual([]);
  });
});
