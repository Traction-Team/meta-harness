import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runGit } from "../../../src/util/git.js";
import type { GitResult } from "../../../src/util/git.js";

/**
 * Points Git at empty global and system config files in a temporary directory,
 * so a developer's own `core.hooksPath` cannot change a test result.
 */
export async function isolateGitConfig(): Promise<{ dir: string; restore(): void }> {
  const dir = await mkdtemp(path.join(tmpdir(), "metafab-hooks-env-"));
  const globalConfig = path.join(dir, "global.gitconfig");
  const systemConfig = path.join(dir, "system.gitconfig");
  await writeFile(globalConfig, "");
  await writeFile(systemConfig, "");

  const previous = {
    GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
    GIT_CONFIG_SYSTEM: process.env.GIT_CONFIG_SYSTEM,
  };

  process.env.GIT_CONFIG_GLOBAL = globalConfig;
  process.env.GIT_CONFIG_SYSTEM = systemConfig;

  return {
    dir,
    restore(): void {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

export interface TestRepo {
  container: string;
  root: string;
  path(...segments: string[]): string;
  write(relativePath: string, content: string): Promise<void>;
  /** Run Git and throw on a non-zero exit. */
  git(...args: string[]): Promise<GitResult>;
  /** Run Git without asserting the exit code. */
  gitRaw(...args: string[]): Promise<GitResult>;
  /** Run Git in another directory, throwing on a non-zero exit. */
  gitAt(cwd: string, ...args: string[]): Promise<GitResult>;
  writeAndCommit(relativePath: string, content: string, message: string): Promise<void>;
  cleanup(): Promise<void>;
}

export interface MakeTestRepoOptions {
  git?: boolean;
  /** Prefix for the temporary container, so a test can put a space or `é` in every path. */
  containerPrefix?: string;
  /** The main checkout's directory name inside the container, so a test can put a newline in it. */
  rootName?: string;
}

export async function makeTestRepo(options: MakeTestRepoOptions = {}): Promise<TestRepo> {
  const container = await mkdtemp(
    path.join(tmpdir(), options.containerPrefix ?? "metafab-hooks-"),
  );
  const root = path.join(container, options.rootName ?? "repo");
  await mkdir(root, { recursive: true });

  const useGit = options.git ?? true;

  const repo: TestRepo = {
    container,
    root,
    path: (...segments: string[]) => path.join(root, ...segments),
    async write(relativePath: string, content: string): Promise<void> {
      const target = path.join(root, ...relativePath.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    },
    async git(...args: string[]): Promise<GitResult> {
      return repo.gitAt(root, ...args);
    },
    async gitRaw(...args: string[]): Promise<GitResult> {
      return runGit(args, { cwd: root });
    },
    async gitAt(cwd: string, ...args: string[]): Promise<GitResult> {
      const result = await runGit(args, { cwd });
      if (result.exitCode !== 0) {
        throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
      }
      return result;
    },
    async writeAndCommit(relativePath: string, content: string, message: string): Promise<void> {
      await repo.write(relativePath, content);
      await repo.git("add", "-A");
      await repo.git("commit", "--quiet", "-m", message);
    },
    async cleanup(): Promise<void> {
      await rm(container, { recursive: true, force: true });
    },
  };

  if (useGit) {
    await repo.git("init", "--quiet");
    await repo.git("config", "user.name", "Metafab Test");
    await repo.git("config", "user.email", "metafab@example.com");
    await repo.git("config", "commit.gpgsign", "false");
  }

  return repo;
}
