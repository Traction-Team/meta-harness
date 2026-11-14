import { lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { ExitCode, MetafabError } from "../errors.js";
import { isDirectory, normalizeProblemPath } from "../util/fs.js";
import { runGit } from "../util/git.js";
import type { GitOptions, GitResult } from "../util/git.js";
import { deriveFactoryName } from "./edit/paths.js";
import { sameFile } from "./sources/containment.js";
import type { FileIdentity } from "./sources/containment.js";

export interface FactoryLocation {
  root: string;
  factoryDir: string;
}

export type GitRunner = (args: string[], options?: GitOptions) => Promise<GitResult>;

export interface RepositoryScope {
  /** Directories to search, nearest first: the current directory up to and including the top level. Only the current directory outside Git. */
  searched: string[];
  /** The top level, spelled like the current directory's path; undefined outside Git. */
  topLevel?: string;
  /** How the top level was decided. */
  via: "git" | "dot-git" | "none";
}

export interface DiscoveryOptions {
  /** The command name for fix lines, such as "build" or "pipeline add". */
  command?: string;
  git?: GitRunner;
}

const MISSING_FACTORY_CODE = "factory-not-found";
const NO_WORK_TREE_CODE = "no-work-tree";
const DROID_CODE = "droid-factory";

const NOT_A_REPOSITORY = /not a git repository/i;
const NO_WORK_TREE = /must be run in a work tree/i;
const DROID_MARKERS = ["settings.json", "droids"] as const;

/** The directory and every parent, up to and including the filesystem root. */
function ancestors(start: string): string[] {
  const chain = [start];
  let current = start;
  for (;;) {
    const parent = path.dirname(current);
    if (parent === current) return chain;
    chain.push(parent);
    current = parent;
  }
}

async function identity(target: string): Promise<FileIdentity | undefined> {
  try {
    return await stat(target, { bigint: true });
  } catch {
    return undefined;
  }
}

/**
 * The index of the chain's directory that is the same file on disk as `target`.
 * A directory that cannot be reached, or a `target` Git printed that does not
 * exist as spelled, counts as no match.
 */
async function matchIndex(chain: readonly string[], target: string): Promise<number | undefined> {
  const targetIdentity = await identity(target);
  if (targetIdentity === undefined) return undefined;

  for (let index = 0; index < chain.length; index += 1) {
    const directory = chain[index];
    if (directory === undefined) continue;
    const current = await identity(directory);
    if (current !== undefined && sameFile(current, targetIdentity)) return index;
  }
  return undefined;
}

function scopeFromChain(chain: readonly string[], index: number, via: "git" | "dot-git"): RepositoryScope {
  const directory = chain[index];
  if (directory === undefined) throw new Error("discovery scope index is out of range");
  return { searched: chain.slice(0, index + 1), topLevel: directory, via };
}

/** The first directory, nearest first, with a `.git` entry: a directory, or the file a worktree has. */
async function dotGitIndex(chain: readonly string[]): Promise<number | undefined> {
  for (let index = 0; index < chain.length; index += 1) {
    const directory = chain[index];
    if (directory === undefined) continue;
    try {
      await lstat(path.join(directory, ".git"));
      return index;
    } catch {
      // Keep walking: this directory has no `.git` entry.
    }
  }
  return undefined;
}

function noWorkTreeError(cwd: string, start: string): MetafabError {
  const message = `${cwd} is inside a Git directory that has no work tree.`;
  return new MetafabError(message, {
    exitCode: ExitCode.Failed,
    code: NO_WORK_TREE_CODE,
    details: { cwd: start },
    problems: [
      {
        level: "error",
        file: ".",
        message,
        fix: "Run metafab from a checkout of the repository",
      },
    ],
  });
}

/**
 * Where `.factory/` may be, and the top level that bounds the search. Git is
 * the authority, so `GIT_DIR`, `GIT_WORK_TREE`, linked worktrees and submodules
 * all resolve to the repository Git reports. When Git cannot answer, the
 * nearest `.git` entry stands in for the top level.
 */
export async function repositoryScope(cwd: string, git: GitRunner = runGit): Promise<RepositoryScope> {
  const start = path.resolve(cwd);
  const chain = ancestors(start);

  let result: GitResult | undefined;
  try {
    result = await git(["rev-parse", "--show-toplevel"], { cwd: start });
  } catch {
    result = undefined;
  }

  if (result !== undefined) {
    if (result.exitCode === 0 && result.stdout.trim() !== "") {
      const gitTop = path.resolve(result.stdout.trim());
      const index = await matchIndex(chain, gitTop);
      if (index !== undefined) return scopeFromChain(chain, index, "git");

      // The current directory was reached through a symbolic link from outside
      // the repository, so the typed path is not an ancestor chain of the top
      // level. The real spellings are the only correct ones then.
      const realStart = await realpath(start).catch(() => undefined);
      if (realStart !== undefined) {
        const realChain = ancestors(realStart);
        const realIndex = await matchIndex(realChain, gitTop);
        if (realIndex !== undefined) return scopeFromChain(realChain, realIndex, "git");
      }

      // The top level exists but is not above the current directory, as with a
      // `GIT_WORK_TREE` that names a subdirectory. Git is the authority on the
      // repository, so search only the one it reports.
      if ((await identity(gitTop)) !== undefined) {
        return { searched: [gitTop], topLevel: gitTop, via: "git" };
      }
      // For example a Cygwin Git printing a path this filesystem does not
      // have; the `.git` fallback below decides instead.
    } else if (result.exitCode === 128 && NOT_A_REPOSITORY.test(result.stderr)) {
      return { searched: [start], via: "none" };
    } else if (result.exitCode === 128 && NO_WORK_TREE.test(result.stderr)) {
      throw noWorkTreeError(cwd, start);
    }
  }

  const index = await dotGitIndex(chain);
  if (index === undefined) return { searched: [start], via: "none" };
  return scopeFromChain(chain, index, "dot-git");
}

async function lstatIfExists(target: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(target);
  } catch {
    return undefined;
  }
}

/**
 * Refuses a `.factory/` that belongs to Factory.ai Droid: no `factory.yaml`,
 * but a `settings.json` or a `droids/`. The person decides whose folder it is
 * by adding `factory.yaml` by hand; Metafab never writes to a Droid folder.
 */
export async function assertNotDroid(factoryDir: string, cwd: string, command?: string): Promise<void> {
  if ((await lstatIfExists(path.join(factoryDir, "factory.yaml"))) !== undefined) return;

  const found: string[] = [];
  for (const marker of DROID_MARKERS) {
    if ((await lstatIfExists(path.join(factoryDir, marker))) !== undefined) found.push(marker);
  }
  if (found.length === 0) return;

  const display = normalizeProblemPath(factoryDir, cwd);
  const name = deriveFactoryName(path.basename(path.dirname(factoryDir)));
  const again = command === undefined ? "then run metafab again" : `then run metafab ${command} again`;
  const message = `${display} belongs to Factory.ai Droid, not Metafab.`;
  throw new MetafabError(message, {
    exitCode: ExitCode.NotOwned,
    code: DROID_CODE,
    details: { factoryDir, markers: found },
    problems: [
      {
        level: "error",
        file: display,
        message: `${display} has ${found.join(" and ")} and no factory.yaml, so it belongs to Factory.ai Droid`,
        fix:
          `If this is Factory.ai Droid's folder, leave it, or run metafab in a repository without it. ` +
          `If it is a Metafab factory, add ${display}/factory.yaml with the lines \`format: 1\` and \`name: ${name}\`, ${again}`,
      },
    ],
  });
}

async function searchScope(
  scope: RepositoryScope,
  cwd: string,
  command: string | undefined,
): Promise<FactoryLocation | undefined> {
  for (const directory of scope.searched) {
    const factoryDir = path.join(directory, ".factory");
    if (!(await isDirectory(factoryDir))) continue;
    await assertNotDroid(factoryDir, cwd, command);
    return { root: directory, factoryDir };
  }
  return undefined;
}

/**
 * True when Git named a top level that does not contain the current directory,
 * as with a `GIT_WORK_TREE` elsewhere: it is the only directory searched, and
 * it is not the current directory under another spelling (a symlink into it).
 */
async function searchesRootOnly(scope: RepositoryScope, cwd: string): Promise<boolean> {
  const topLevel = scope.topLevel;
  if (topLevel === undefined) return false;
  if (scope.searched.length !== 1 || scope.searched[0] !== topLevel) return false;

  const [start, top] = await Promise.all([identity(cwd), identity(topLevel)]);
  return start !== undefined && top !== undefined && !sameFile(start, top);
}

async function missingFactoryError(scope: RepositoryScope, cwd: string): Promise<MetafabError> {
  const file = normalizeProblemPath(".factory", cwd);
  const topLevel = scope.topLevel;
  if (topLevel !== undefined && (await searchesRootOnly(scope, cwd))) {
    return new MetafabError(`No .factory directory found at the repository root ${topLevel}.`, {
      exitCode: ExitCode.Failed,
      code: MISSING_FACTORY_CODE,
      details: { cwd, repositoryRoot: topLevel },
      problems: [
        {
          level: "error",
          file,
          message: `No factory found at the repository root ${topLevel}.`,
          fix: "Run metafab init",
        },
      ],
    });
  }
  if (topLevel !== undefined) {
    return new MetafabError(
      `No .factory directory found in ${cwd} or its parents up to the repository root ${topLevel}.`,
      {
        exitCode: ExitCode.Failed,
        code: MISSING_FACTORY_CODE,
        details: { cwd, repositoryRoot: topLevel },
        problems: [
          {
            level: "error",
            file,
            message: `No factory found between ${cwd} and the repository root.`,
            fix: "Run metafab init",
          },
        ],
      },
    );
  }

  const message = `No .factory directory found in ${cwd}. Outside a Git repository, Metafab looks only in the current directory.`;
  return new MetafabError(message, {
    exitCode: ExitCode.Failed,
    code: MISSING_FACTORY_CODE,
    details: { cwd, repositoryRoot: null },
    problems: [
      {
        level: "error",
        file,
        message,
        fix: "Run metafab init, or run metafab in the directory that contains .factory/",
      },
    ],
  });
}

export async function findFactory(cwd: string, options: DiscoveryOptions = {}): Promise<FactoryLocation> {
  const scope = await repositoryScope(cwd, options.git);
  const location = await searchScope(scope, cwd, options.command);
  if (location !== undefined) return location;
  throw await missingFactoryError(scope, cwd);
}

export async function resolveNewFactoryRoot(cwd: string, options: DiscoveryOptions = {}): Promise<string> {
  const scope = await repositoryScope(cwd, options.git);
  const location = await searchScope(scope, cwd, options.command);
  if (location !== undefined) return location.root;
  return scope.topLevel ?? path.resolve(cwd);
}
