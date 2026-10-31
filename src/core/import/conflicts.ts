import path from "node:path";
import type { Problem } from "../../errors.js";
import { snapshotDirectories, snapshotTree } from "./file-tree.js";
import type { FileEntry, FileTree } from "./file-tree.js";
import type { AdoptionMove } from "../adopt.js";

/** A file that an incoming fab path would replace, with the path to report. */
export interface LocalFile {
  entry: FileEntry;
  file: string;
}

/**
 * The local paths an import would write over, keyed by the factory-relative
 * path the incoming fab uses for them.
 */
export interface LocalPaths {
  files: Map<string, LocalFile>;
  /** Every existing local directory, empty ones included: `key` to local path. */
  directories: Map<string, string>;
}

/**
 * Local paths indexed the way the filesystem compares them: ignoring case,
 * with each directory mapped to a key beneath it. The entries keep the
 * spelling and the file path of the local tree, so a problem names the local
 * entry.
 */
interface LocalIndex {
  files: Map<string, { key: string; local: LocalFile }>;
  directories: Map<string, string>;
}

function absolute(root: string, relativePath: string): string {
  return path.join(root, ...relativePath.split("/"));
}

function ancestors(relativePath: string): string[] {
  const parts = relativePath.split("/");
  const prefixes: string[] = [];
  for (let index = 1; index < parts.length; index += 1) {
    prefixes.push(parts.slice(0, index).join("/"));
  }
  return prefixes;
}

function replaced(file: string): Problem {
  return {
    level: "error",
    file,
    message: `The incoming fab would replace ${file}`,
    fix: "Keep the local file, or run metafab import --force to replace it",
  };
}

function blocked(file: string): Problem {
  return {
    level: "error",
    file,
    message: `The incoming fab would replace ${file} with a different kind of entry`,
    fix: "Move the local entry away, or run metafab import --force to replace it",
  };
}

function differentSpelling(file: string, incoming: string): Problem {
  return {
    level: "error",
    file,
    message: `The incoming fab writes ${incoming}, which differs only in case from ${file}`,
    fix: "Keep the local file, or run metafab import --force to replace it",
  };
}

function addTree(
  files: Map<string, LocalFile>,
  tree: FileTree,
  prefix: string,
  sourceDirectory: string,
): void {
  for (const [relativePath, entry] of Object.entries(tree)) {
    const key = prefix === "" ? relativePath : `${prefix}/${relativePath}`;
    if (files.has(key)) continue;
    files.set(key, { entry, file: `${sourceDirectory}/${relativePath}` });
  }
}

function addDirectories(
  directories: Map<string, string>,
  relativePaths: readonly string[],
  prefix: string,
  sourceDirectory: string,
): void {
  for (const relativePath of relativePaths) {
    const key = prefix === "" ? relativePath : `${prefix}/${relativePath}`;
    if (directories.has(key)) continue;
    directories.set(key, `${sourceDirectory}/${relativePath}`);
  }
}

/**
 * The local paths an import could write over: the factory, plus the files of
 * each skill adoption will move into it. Keys are factory-relative paths, so a
 * planned move of `release` maps `.claude/skills/release/SKILL.md` to
 * `skills/release/SKILL.md`, where the incoming fab writes.
 *
 * Directories are listed too, empty ones included: a snapshot has none, so
 * without this an incoming file could quietly delete one.
 */
export async function localFilesForImport(
  root: string,
  factoryDir: string,
  moves: readonly AdoptionMove[],
  hasFactory: boolean,
): Promise<LocalPaths> {
  const paths: LocalPaths = { files: new Map(), directories: new Map() };

  if (hasFactory) {
    addTree(paths.files, await snapshotTree(factoryDir), "", ".factory");
    addDirectories(paths.directories, await snapshotDirectories(factoryDir), "", ".factory");
  }

  for (const move of moves) {
    const primary = move.from[0];
    if (primary === undefined) continue;
    let tree: FileTree;
    let directories: string[];
    try {
      [tree, directories] = await Promise.all([
        snapshotTree(absolute(root, primary)),
        snapshotDirectories(absolute(root, primary)),
      ]);
    } catch {
      continue;
    }
    addTree(paths.files, tree, `skills/${move.name}`, primary);
    addDirectories(paths.directories, directories, `skills/${move.name}`, primary);
  }

  return paths;
}

function indexOf(local: LocalPaths): LocalIndex {
  const files = new Map<string, { key: string; local: LocalFile }>();
  const directories = new Map<string, string>();

  for (const [key, file] of local.directories) {
    const folded = key.toLowerCase();
    if (!directories.has(folded)) directories.set(folded, file);
  }

  for (const [key, localFile] of local.files) {
    const folded = key.toLowerCase();
    if (!files.has(folded)) files.set(folded, { key, local: localFile });
  }

  return { files, directories };
}

/**
 * Every incoming path that would replace or remove local content: a file, link
 * or directory whose content differs, or a local path that differs only in
 * case. Content is compared without line-ending changes counting as a
 * difference, and without case: a path that differs only in case still lands on
 * the same entry on a case-insensitive filesystem. An incoming file or link at
 * the path of an existing local directory is a conflict too, empty directories
 * included, because the copy would delete it. A path that would replace a file
 * with a directory, a directory with a file, or a link with a file, is a
 * conflict, so the copy can never fail on it or delete local content.
 */
export async function findImportConflicts(
  incomingDir: string,
  local: LocalPaths,
): Promise<Problem[]> {
  const incoming = await snapshotTree(incomingDir);
  const index = indexOf(local);
  const problems: Problem[] = [];
  const reported = new Set<string>();

  function report(problem: Problem): void {
    const id = `${problem.file}\u0000${problem.message}`;
    if (reported.has(id)) return;
    reported.add(id);
    problems.push(problem);
  }

  for (const relativePath of Object.keys(incoming).sort()) {
    const folded = relativePath.toLowerCase();
    const existing = index.files.get(folded);
    if (existing !== undefined) {
      if (existing.key !== relativePath) {
        report(differentSpelling(existing.local.file, relativePath));
      } else if (existing.local.entry.hash !== incoming[relativePath]!.hash) {
        report(replaced(existing.local.file));
      }
      continue;
    }

    let blocker: LocalFile | undefined;
    for (const prefix of ancestors(relativePath)) {
      blocker = index.files.get(prefix.toLowerCase())?.local;
      if (blocker !== undefined) break;
    }
    if (blocker !== undefined) {
      report(blocked(blocker.file));
      continue;
    }

    const asDirectory = index.directories.get(folded);
    if (asDirectory !== undefined) report(blocked(asDirectory));
  }

  return problems;
}
