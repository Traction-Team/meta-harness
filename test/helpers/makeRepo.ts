import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runGit } from "../../src/util/git.js";

export type RepoFiles = Record<string, string | Uint8Array>;

export interface MakeRepoOptions {
  git?: boolean;
  prefix?: string;
}

export interface TempRepo {
  root: string;
  path(...segments: string[]): string;
  cleanup(): Promise<void>;
}

export async function writeRepoFiles(root: string, files: RepoFiles): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

export async function makeRepo(files: RepoFiles = {}, options: MakeRepoOptions = {}): Promise<TempRepo> {
  const root = await mkdtemp(path.join(tmpdir(), options.prefix ?? "metafab-test-"));

  try {
    await writeRepoFiles(root, files);
    if (options.git === true) {
      const result = await runGit(["init", "--quiet"], { cwd: root });
      if (result.exitCode !== 0) {
        throw new Error(`git init failed: ${result.stderr.trim()}`);
      }
    }
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }

  let cleanedUp = false;
  return {
    root,
    path: (...segments: string[]) => path.join(root, ...segments),
    async cleanup(): Promise<void> {
      if (cleanedUp) return;
      cleanedUp = true;
      await rm(root, { recursive: true, force: true });
    },
  };
}
