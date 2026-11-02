import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { writeRepoFiles } from "../../helpers/makeRepo.js";
import type { RepoFiles } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";
import type { RunCliResult } from "../../helpers/runCli.js";

const execFileAsync = promisify(execFile);

/** The source text tests pass to `import`; insteadOf rewrites it to the fixture. */
export const FAB_URL = "https://example.com/fab.git";
export const FAB_SOURCE = `git+${FAB_URL}`;

export async function runGitIn(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true },
  );
  return stdout.trim();
}

export interface GitFab {
  root: string;
  work: string;
  repo: string;
  gitconfig: string;
  /** Files committed in the repository under test. */
  commit(files: RepoFiles, message: string): Promise<string>;
  remove(paths: string[], message: string): Promise<string>;
  tag(name: string): Promise<void>;
  createBranch(name: string): Promise<void>;
  checkout(name: string): Promise<void>;
  push(branch?: string): Promise<void>;
  head(): Promise<string>;
  cleanup(): Promise<void>;
}

/**
 * A bare Git fab repository, driven from a working clone.
 *
 * The working repository's `origin` is the bare repository, so a test writes
 * files, commits and pushes a version, then runs `metafab update` against the
 * rewritten `https://example.com/fab.git` URL.
 */
export async function createGitFab(initial: RepoFiles): Promise<GitFab> {
  const root = await mkdtemp(path.join(tmpdir(), "metafab-update-git-"));
  const work = path.join(root, "work");
  const repo = path.join(root, "repo.git");
  await mkdir(work, { recursive: true });

  await runGitIn(root, ["init", "-q", "-b", "main", work]);
  await runGitIn(work, ["config", "user.name", "Metafab Test"]);
  await runGitIn(work, ["config", "user.email", "metafab@example.com"]);
  await runGitIn(root, ["init", "-q", "--bare", repo]);
  await runGitIn(repo, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  await runGitIn(work, ["remote", "add", "origin", repo]);

  await writeRepoFiles(work, initial);
  await runGitIn(work, ["add", "-A"]);
  await runGitIn(work, ["commit", "-qm", "initial"]);

  // Git reads a backslash in a quoted config value as an escape, so a Windows
  // path is written as a file URL, which Git accepts on every platform.
  const gitconfig = path.join(root, "gitconfig");
  await writeFile(gitconfig, `[url "${pathToFileURL(repo).href}"]\n\tinsteadOf = ${FAB_URL}\n`);

  const fab: GitFab = {
    root,
    work,
    repo,
    gitconfig,
    async commit(files, message) {
      await writeRepoFiles(work, files);
      await runGitIn(work, ["add", "-A"]);
      await runGitIn(work, ["commit", "-qm", message]);
      return runGitIn(work, ["rev-parse", "HEAD"]);
    },
    async remove(paths, message) {
      for (const relativePath of paths) {
        await rm(path.join(work, ...relativePath.split("/")), { recursive: true, force: true });
      }
      await runGitIn(work, ["add", "-A"]);
      await runGitIn(work, ["commit", "-qm", message]);
      return runGitIn(work, ["rev-parse", "HEAD"]);
    },
    async tag(name) {
      await runGitIn(work, ["tag", name]);
    },
    async createBranch(name) {
      await runGitIn(work, ["switch", "-q", "-c", name]);
    },
    async checkout(name) {
      await runGitIn(work, ["switch", "-q", name]);
    },
    async push(branch = "main") {
      await runGitIn(work, ["push", "-q", "origin", branch, "--tags"]);
    },
    async head() {
      return runGitIn(work, ["rev-parse", "HEAD"]);
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };

  await fab.push();
  return fab;
}

const SOURCE_ENV = ["GIT_CONFIG_GLOBAL", "METAFAB_CACHE"] as const;

/** Runs `fn` with Git pointed at the fixture's rewrites and a private cache. */
export async function withFabEnvironment<T>(fab: GitFab, fn: () => Promise<T>): Promise<T> {
  const previous = Object.fromEntries(SOURCE_ENV.map((key) => [key, process.env[key]]));
  process.env.GIT_CONFIG_GLOBAL = fab.gitconfig;
  process.env.METAFAB_CACHE = path.join(fab.root, "cache");
  try {
    return await fn();
  } finally {
    for (const key of SOURCE_ENV) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** Imports the fixture fab into `cwd`, with no build output surprises. */
export function importFab(
  cwd: string,
  source = FAB_SOURCE,
  extra: readonly string[] = [],
): Promise<RunCliResult> {
  return runCli(["import", source, "--agents", "claude", "--json", ...extra], { cwd });
}

export function updateFab(cwd: string, args: readonly string[] = []): Promise<RunCliResult> {
  return runCli(["update", ...args], { cwd });
}

export function parseJson(result: RunCliResult): Record<string, unknown> {
  return JSON.parse(result.stdout) as Record<string, unknown>;
}
