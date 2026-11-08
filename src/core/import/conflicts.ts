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
 * Local paths indexed the way the filesystem compares them: ignoring case, with
 * every spelling kept. A case-sensitive filesystem can hold two entries that
 * fold to one name, and both callers must see both rather than silently
 * choosing one.
 */
export interface Indexed<T> {
  key: string;
  value: T;
}

/** One list of entries per folded name, each entry keeping its local spelling. */
export function indexOf<T>(entries: Iterable<[string, T]>): Map<string, Indexed<T>[]> {
  const index = new Map<string, Indexed<T>[]>();
  for (const [key, value] of entries) {
    const folded = key.toLowerCase();
    const indexed = index.get(folded);
    if (indexed === undefined) index.set(folded, [{ key, value }]);
    else indexed.push({ key, value });
  }
  return index;
}

function absolute(root: string, relativePath: string): string {
  return path.join(root, ...relativePath.split("/"));
}

export function ancestors(relativePath: string): string[] {
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

/** The one wording for a local entry that differs only in case from an incoming path. */
export function differentSpelling(
  file: string,
  incoming: string,
  command: "import" | "update",
): Problem {
  const importing = command === "import";
  return {
    level: "error",
    file,
    message: importing
      ? `The incoming fab writes ${incoming}, which differs only in case from ${file}`
      : `The update writes ${incoming}, which differs only in case from ${file}`,
    fix: importing
      ? "Keep the local file, or run metafab import --force to replace it"
      : "Move the local entry away, then run metafab update again",
  };
}

/**
 * The problem for an incoming path that several local spellings fold to.
 *
 * The clash preflight and the realignment both refuse this case, so the text is
 * built here once and both paths report it identically.
 */
export function ambiguousSpellingProblem(
  files: readonly string[],
  incoming: string,
  command: "import" | "update",
): Problem {
  const importing = command === "import";
  return {
    level: "error",
    file: files[0] ?? incoming,
    message: importing
      ? `The incoming fab writes ${incoming}, but these local entries differ only in case: ${files.join(", ")}`
      : `The update writes ${incoming}, but these local entries differ only in case: ${files.join(", ")}`,
    fix: importing
      ? "Move all but one of the local entries away, then run metafab import again"
      : "Move all but one of the local entries away, then run metafab update again",
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

function localIndex(local: LocalPaths): {
  files: Map<string, Indexed<LocalFile>[]>;
  directories: Map<string, Indexed<string>[]>;
} {
  return {
    files: indexOf(local.files.entries()),
    directories: indexOf(local.directories.entries()),
  };
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
 *
 * Every incoming path is folded against its local ancestors as well as the
 * path itself, so a case-only clash with a local file, link or directory at any
 * depth is refused. Without that, an incoming `templates/` would slip past a
 * local `Templates/` on a case-insensitive filesystem and split in two on a
 * case-sensitive one.
 */
export async function findImportConflicts(
  incomingDir: string,
  local: LocalPaths,
): Promise<Problem[]> {
  const [incoming, incomingDirectories] = await Promise.all([
    snapshotTree(incomingDir),
    snapshotDirectories(incomingDir),
  ]);
  const index = localIndex(local);
  const problems: Problem[] = [];
  const reported = new Set<string>();

  function report(problem: Problem): void {
    const id = `${problem.file}\u0000${problem.message}`;
    if (reported.has(id)) return;
    reported.add(id);
    problems.push(problem);
  }

  /**
   * Reports the first local entry on the path itself, or among its ancestors,
   * that the incoming entry would replace. Case-only clashes name the local
   * entry and the incoming path; an exact spelling that changes the kind of
   * entry is reported as blocked.
   */
  function checkLocalPath(relativePath: string, incomingDirectory: boolean): void {
    const folded = relativePath.toLowerCase();

    const existingFile = index.files.get(folded)?.[0];
    if (existingFile !== undefined) {
      if (existingFile.key !== relativePath) {
        report(differentSpelling(existingFile.value.file, relativePath, "import"));
      } else if (incomingDirectory) {
        report(blocked(existingFile.value.file));
      } else if (existingFile.value.entry.hash !== incoming[relativePath]!.hash) {
        report(replaced(existingFile.value.file));
      }
      return;
    }

    for (const prefix of ancestors(relativePath)) {
      const foldedPrefix = prefix.toLowerCase();
      const ancestorFile = index.files.get(foldedPrefix)?.[0];
      if (ancestorFile !== undefined) {
        report(
          ancestorFile.key === prefix
            ? blocked(ancestorFile.value.file)
            : differentSpelling(ancestorFile.value.file, relativePath, "import"),
        );
        return;
      }

      const ancestorDirectory = index.directories.get(foldedPrefix)?.[0];
      if (ancestorDirectory !== undefined && ancestorDirectory.key !== prefix) {
        report(differentSpelling(ancestorDirectory.value, relativePath, "import"));
        return;
      }
    }

    const existingDirectory = index.directories.get(folded)?.[0];
    if (existingDirectory === undefined) return;
    if (existingDirectory.key !== relativePath) {
      report(differentSpelling(existingDirectory.value, relativePath, "import"));
    } else if (!incomingDirectory) {
      report(blocked(existingDirectory.value));
    }
  }

  for (const relativePath of Object.keys(incoming).sort()) {
    checkLocalPath(relativePath, false);
  }

  // Directories are checked too: an incoming empty directory can clash with a
  // local one, or replace a local file or link, just as a file can.
  for (const relativePath of [...incomingDirectories].sort()) {
    checkLocalPath(relativePath, true);
  }

  return problems;
}
