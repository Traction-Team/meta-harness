import { chmod, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  HOOK_NAMES,
  hookCommand,
  hookScript,
  syncGitHooks,
} from "../../../src/core/hooks/index.js";
import { isolateGitConfig, makeTestRepo } from "./helpers.js";
import type { TestRepo } from "./helpers.js";

let isolation: Awaited<ReturnType<typeof isolateGitConfig>> | undefined;
const repos: TestRepo[] = [];
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

async function repo(options: { git?: boolean } = {}): Promise<TestRepo> {
  const created = await makeTestRepo(options);
  repos.push(created);
  return created;
}

async function hookText(repo: TestRepo, hook: string): Promise<string> {
  return readFile(repo.path(".git/hooks", hook), "utf8");
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

const noGitWarning = {
  level: "warning",
  file: ".factory/metafab.yaml",
  message: "git-hooks is true, but this is not a Git repository or git is not installed",
  fix: "Install Git, or set git-hooks: false",
};

describe.skipIf(process.platform === "win32")("syncGitHooks", () => {
  test("enabled creates three 0755 hooks, and a second run changes nothing", async () => {
    const git = await repo();

    const first = await syncGitHooks(git.root, true, "1.0.0");

    expect(first.changed).toEqual([
      { hook: "post-checkout", action: "created" },
      { hook: "post-merge", action: "created" },
      { hook: "post-rewrite", action: "created" },
    ]);
    expect(first.warnings).toEqual([]);

    for (const hook of HOOK_NAMES) {
      expect(await hookText(git, hook)).toBe(hookScript(hook, ".", "1.0.0"));
      expect((await stat(git.path(".git/hooks", hook))).mode & 0o777).toBe(0o755);
    }

    await expect(syncGitHooks(git.root, true, "1.0.0")).resolves.toEqual({
      changed: [],
      warnings: [],
    });
  });

  test("a version change rewrites all three as updated", async () => {
    const git = await repo();
    await syncGitHooks(git.root, true, "1.0.0");

    const result = await syncGitHooks(git.root, true, "1.1.0");

    expect(result.changed).toEqual([
      { hook: "post-checkout", action: "updated" },
      { hook: "post-merge", action: "updated" },
      { hook: "post-rewrite", action: "updated" },
    ]);
    expect(await hookText(git, "post-merge")).toContain("@seasb/metafab@1.1.0 build");
  });

  test("compares content after CRLF to LF", async () => {
    const git = await repo();
    const crlf = hookScript("post-merge", ".", "1.0.0").replace(/\n/g, "\r\n");
    await git.write(".git/hooks/post-merge", crlf);
    await chmod(git.path(".git/hooks/post-merge"), 0o755);

    const result = await syncGitHooks(git.root, true, "1.0.0");

    expect(result.changed).toEqual([
      { hook: "post-checkout", action: "created" },
      { hook: "post-rewrite", action: "created" },
    ]);
    expect(await hookText(git, "post-merge")).toBe(crlf);
  });

  test("leaves a foreign post-merge alone and still creates the other two", async () => {
    const git = await repo();
    const foreign = "#!/bin/sh\necho foreign\n";
    await git.write(".git/hooks/post-merge", foreign);

    const result = await syncGitHooks(git.root, true, "1.0.0");

    expect(result.changed).toEqual([
      { hook: "post-checkout", action: "created" },
      { hook: "post-rewrite", action: "created" },
    ]);
    expect(result.warnings).toEqual([
      {
        level: "warning",
        file: ".git/hooks/post-merge",
        message: ".git/hooks/post-merge exists and was not written by Metafab",
        fix: `Add this line to .git/hooks/post-merge: ${hookCommand(".", "1.0.0")}`,
      },
    ]);
    expect(await hookText(git, "post-merge")).toBe(foreign);
  });

  test("the ownership marker must be a line of its own", async () => {
    const git = await repo();
    await git.write(".git/hooks/post-merge", "#!/bin/sh\n# note: # metafab:start\n");

    const result = await syncGitHooks(git.root, true, "1.0.0");

    expect(result.warnings[0]?.message).toBe(
      ".git/hooks/post-merge exists and was not written by Metafab",
    );
  });

  test("with core.hooksPath set, writes nothing and warns once", async () => {
    const git = await repo();
    await git.git("config", "core.hooksPath", ".husky");

    const result = await syncGitHooks(git.root, true, "1.0.0");

    expect(result.changed).toEqual([]);
    expect(result.warnings).toEqual([
      {
        level: "warning",
        file: ".factory/metafab.yaml",
        message: "core.hooksPath is set, so Metafab did not install Git hooks",
        fix: `Add this line to post-checkout, post-merge and post-rewrite in .husky: ${hookCommand(".", "1.0.0")}`,
      },
    ]);
    for (const hook of HOOK_NAMES) {
      expect(await exists(git.path(".git/hooks", hook))).toBe(false);
    }
  });

  test("core.hooksPath set after hooks were written still allows removal", async () => {
    const git = await repo();
    await syncGitHooks(git.root, true, "1.0.0");
    await git.git("config", "core.hooksPath", ".husky");

    const enabled = await syncGitHooks(git.root, true, "1.0.0");
    expect(enabled.changed).toEqual([]);
    expect(enabled.warnings).toHaveLength(1);

    const disabled = await syncGitHooks(git.root, false, "1.0.0");
    expect(disabled.changed).toEqual([
      { hook: "post-checkout", action: "removed" },
      { hook: "post-merge", action: "removed" },
      { hook: "post-rewrite", action: "removed" },
    ]);
    for (const hook of HOOK_NAMES) {
      expect(await exists(git.path(".git/hooks", hook))).toBe(false);
    }
  });

  test("disabled removes owned hooks and keeps a foreign one", async () => {
    const git = await repo();
    const foreign = "#!/bin/sh\necho foreign\n";
    await git.write(".git/hooks/post-merge", foreign);
    await syncGitHooks(git.root, true, "1.0.0");

    const disabled = await syncGitHooks(git.root, false, "1.0.0");

    expect(disabled.changed).toEqual([
      { hook: "post-checkout", action: "removed" },
      { hook: "post-rewrite", action: "removed" },
    ]);
    expect(disabled.warnings).toEqual([]);
    expect(await hookText(git, "post-merge")).toBe(foreign);
    expect(await exists(git.path(".git/hooks/post-checkout"))).toBe(false);
    expect(await exists(git.path(".git/hooks/post-rewrite"))).toBe(false);
  });

  test("an owned hook with no cd line counts as this factory's", async () => {
    const git = await repo();
    await git.write(".git/hooks/post-merge", "#!/bin/sh\n# metafab:start\necho old\n");

    const result = await syncGitHooks(git.root, true, "1.0.0");

    expect(result.changed).toContainEqual({ hook: "post-merge", action: "updated" });
    expect(result.warnings).toEqual([]);
  });

  test("outside a Git repository it does nothing and warns only when enabled", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "metafab-hooks-nogit-"));
    temporary.push(dir);

    await expect(syncGitHooks(dir, true, "1.0.0")).resolves.toEqual({
      changed: [],
      warnings: [noGitWarning],
    });
    await expect(syncGitHooks(dir, false, "1.0.0")).resolves.toEqual({
      changed: [],
      warnings: [],
    });
  });

  test("with git missing it does nothing and warns only when enabled", async () => {
    const git = await repo();
    const empty = await mkdtemp(path.join(tmpdir(), "metafab-hooks-path-"));
    temporary.push(empty);
    const previousPath = process.env.PATH;

    try {
      process.env.PATH = empty;
      await expect(syncGitHooks(git.root, true, "1.0.0")).resolves.toEqual({
        changed: [],
        warnings: [noGitWarning],
      });
      await expect(syncGitHooks(git.root, false, "1.0.0")).resolves.toEqual({
        changed: [],
        warnings: [],
      });
    } finally {
      process.env.PATH = previousPath;
    }
  });

  test("inside a linked worktree it writes to the shared .git/hooks", async () => {
    const git = await repo();
    await git.writeAndCommit("README.md", "hello\n", "initial");
    const worktree = git.path("..", "wt");
    await git.git("worktree", "add", worktree, "-b", "wt");

    const result = await syncGitHooks(worktree, true, "1.0.0");

    expect(result.changed).toHaveLength(3);
    for (const hook of HOOK_NAMES) {
      expect((await stat(git.path(".git/hooks", hook))).mode & 0o777).toBe(0o755);
    }
    expect(await exists(git.path(".git/worktrees/wt/hooks/post-checkout"))).toBe(false);
  });

  test("a monorepo factory writes its directory, and a second factory warns", async () => {
    const git = await repo();
    const app = git.path("packages/app");
    await mkdir(app, { recursive: true });

    const first = await syncGitHooks(app, true, "1.0.0");
    expect(first.changed).toHaveLength(3);
    expect(await hookText(git, "post-merge")).toContain(
      'cd "$(git rev-parse --show-toplevel)/packages/app"',
    );

    const second = await syncGitHooks(git.root, true, "1.0.0");

    expect(second.changed).toEqual([]);
    expect(second.warnings).toHaveLength(3);
    expect(second.warnings[0]).toEqual({
      level: "warning",
      file: ".git/hooks/post-checkout",
      message: ".git/hooks/post-checkout runs metafab build for packages/app",
      fix: "Git hooks support one factory per repository; set git-hooks: false in one of them",
    });

    const disabled = await syncGitHooks(git.root, false, "1.0.0");
    expect(disabled.changed).toEqual([]);
    expect(disabled.warnings).toEqual([]);
    expect(await hookText(git, "post-merge")).toContain("/packages/app");
  });

  test("repairs the mode to 0755 when it rewrites a hook", async () => {
    const git = await repo();
    await syncGitHooks(git.root, true, "1.0.0");
    await chmod(git.path(".git/hooks/post-merge"), 0o644);

    await syncGitHooks(git.root, true, "1.1.0");

    expect((await stat(git.path(".git/hooks/post-merge"))).mode & 0o777).toBe(0o755);
  });

  test("repairs the mode of a matching hook without rewriting its content", async () => {
    const git = await repo();
    await syncGitHooks(git.root, true, "1.0.0");
    const content = await hookText(git, "post-merge");
    await chmod(git.path(".git/hooks/post-merge"), 0o644);

    const result = await syncGitHooks(git.root, true, "1.0.0");

    expect(result.changed).toEqual([{ hook: "post-merge", action: "updated" }]);
    expect(result.warnings).toEqual([]);
    expect((await stat(git.path(".git/hooks/post-merge"))).mode & 0o777).toBe(0o755);
    expect(await hookText(git, "post-merge")).toBe(content);

    await expect(syncGitHooks(git.root, true, "1.0.0")).resolves.toEqual({
      changed: [],
      warnings: [],
    });
  });
});
