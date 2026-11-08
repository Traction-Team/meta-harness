import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { HOOK_NAMES, syncGitHooks } from "../../../src/core/hooks/index.js";
import { isolateGitConfig, makeTestRepo } from "./helpers.js";
import type { TestRepo } from "./helpers.js";

const execFileAsync = promisify(execFile);

let isolation: Awaited<ReturnType<typeof isolateGitConfig>> | undefined;
const repos: TestRepo[] = [];

beforeEach(async () => {
  isolation = await isolateGitConfig();
});

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
  isolation?.restore();
  isolation = undefined;
});

async function repo(): Promise<TestRepo> {
  const created = await makeTestRepo();
  repos.push(created);
  return created;
}

async function logLines(log: string): Promise<string[]> {
  try {
    const text = await readFile(log, "utf8");
    return text.split("\n").filter((line) => line !== "");
  } catch {
    return [];
  }
}

interface Stub {
  bin: string;
  log: string;
  originalPath: string | undefined;
}

async function installStub(git: TestRepo, script: string): Promise<Stub> {
  const bin = path.join(git.container, "bin");
  await mkdir(bin, { recursive: true });
  const log = path.join(git.container, "build.log");
  const stub = path.join(bin, "metafab");
  await writeFile(stub, script.replace("__LOG__", log), "utf8");
  await chmod(stub, 0o755);
  return { bin, log, originalPath: process.env.PATH };
}

function usePath(stub: Stub): void {
  process.env.PATH = `${stub.bin}${path.delimiter}${stub.originalPath ?? ""}`;
}

function restorePath(stub: Stub): void {
  if (stub.originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = stub.originalPath;
}

const LOGGING_STUB = `#!/bin/sh
printf '%s\\n' "$PWD" >> '__LOG__'
`;

const FAILING_STUB = `#!/bin/sh
echo "stub build failed" >&2
exit 1
`;

async function clear(log: string): Promise<void> {
  await writeFile(log, "", "utf8");
}

describe.skipIf(process.platform === "win32")("Git hooks end to end", () => {
  test("worktree add, merge and rebase run metafab build; amend and file checkout do not", async () => {
    const git = await repo();
    await git.writeAndCommit(
      ".factory/metafab.yaml",
      "agents: all\ngit-hooks: true\n",
      "factory",
    );
    await git.writeAndCommit("file.txt", "one\n", "file");
    const installed = await syncGitHooks(git.root, true, "1.0.0");
    expect(installed.changed).toHaveLength(3);

    const stub = await installStub(git, LOGGING_STUB);
    usePath(stub);

    try {
      const branch = (await git.git("rev-parse", "--abbrev-ref", "HEAD")).stdout.trim();

      await git.git("worktree", "add", git.path("..", "wt"), "-b", "wt");
      expect(await logLines(stub.log)).toEqual([await realpath(git.path("..", "wt"))]);

      await clear(stub.log);
      await git.git("checkout", "--quiet", "-b", "topic");
      await git.writeAndCommit("topic.txt", "topic\n", "topic");
      await git.git("checkout", "--quiet", branch);
      await clear(stub.log);
      await git.git("merge", "--no-ff", "--quiet", "-m", "merge topic", "topic");
      expect(await logLines(stub.log)).toEqual([await realpath(git.root)]);

      await git.git("checkout", "--quiet", "-b", "rebase-topic");
      await git.writeAndCommit("rebase.txt", "rebase\n", "rebase topic");
      await git.git("checkout", "--quiet", branch);
      await git.writeAndCommit("main.txt", "main\n", "main");
      await git.git("checkout", "--quiet", "rebase-topic");
      await clear(stub.log);
      await git.git("rebase", "--quiet", branch);
      expect(await logLines(stub.log)).toHaveLength(2);
      expect(await logLines(stub.log)).toEqual([
        await realpath(git.root),
        await realpath(git.root),
      ]);

      await clear(stub.log);
      await git.git("commit", "--amend", "--no-edit", "--quiet");
      expect(await logLines(stub.log)).toEqual([]);

      await clear(stub.log);
      await git.git("checkout", "--", "file.txt");
      expect(await logLines(stub.log)).toEqual([]);
    } finally {
      restorePath(stub);
    }
  });

  test("post-checkout exits for a file checkout and post-rewrite for an amend", async () => {
    const git = await repo();
    await git.writeAndCommit(".factory/metafab.yaml", "agents: all\n", "factory");
    await syncGitHooks(git.root, true, "1.0.0");
    const stub = await installStub(git, LOGGING_STUB);
    usePath(stub);

    try {
      await execFileAsync(
        "sh",
        [git.path(".git/hooks/post-checkout"), "old", "new", "0"],
        { cwd: git.root },
      );
      expect(await logLines(stub.log)).toEqual([]);

      await execFileAsync(
        "sh",
        [git.path(".git/hooks/post-rewrite"), "amend"],
        { cwd: git.root },
      );
      expect(await logLines(stub.log)).toEqual([]);

      await execFileAsync(
        "sh",
        [git.path(".git/hooks/post-rewrite"), "rebase"],
        { cwd: git.root },
      );
      expect(await logLines(stub.log)).toHaveLength(1);
    } finally {
      restorePath(stub);
    }
  });

  test("a failing build still lets the Git command succeed and prints one line", async () => {
    const git = await repo();
    await git.writeAndCommit(".factory/metafab.yaml", "agents: all\n", "factory");
    await git.writeAndCommit("file.txt", "one\n", "file");
    await syncGitHooks(git.root, true, "1.0.0");
    const stub = await installStub(git, FAILING_STUB);
    usePath(stub);

    try {
      const result = await git.gitRaw(
        "worktree",
        "add",
        git.path("..", "wt"),
        "-b",
        "wt",
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("metafab: build failed. Run metafab build.");
      expect(await logLines(stub.log)).toEqual([]);
      for (const hook of HOOK_NAMES) {
        expect(await readFile(git.path(".git/hooks", hook), "utf8")).toContain(
          'echo "metafab: build failed. Run metafab build." >&2',
        );
      }
    } finally {
      restorePath(stub);
    }
  });
});
