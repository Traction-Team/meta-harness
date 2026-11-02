import type { Problem } from "../../errors.js";
import type { LocalPaths } from "../import/conflicts.js";

/** Factory-relative paths an update will write, as files and as directories. */
export interface IncomingPaths {
  /** Paths written as a file or a symbolic link. */
  files: readonly string[];
  /** Directories created before a file beneath them is written. */
  directories: readonly string[];
  /**
   * Paths the update removes before it writes. Local content at these paths is
   * gone by the time a write lands, so it never stands in the way: an upstream
   * rename or a file turned into a directory removes a path and writes its
   * replacement. Without this, a normal restructure would be refused.
   */
  removed?: readonly string[];
  /**
   * True when a source file replaces a local file that differs only in case,
   * and the copy spells it the source's way. An unversioned update replaces the
   * file by design, so a case-only difference is not a conflict there.
   */
  replaceCaseOnlyFiles?: boolean;
  /**
   * True when the update realigns a local directory whose spelling differs only
   * in case from an incoming directory. A versioned update writes the source's
   * spelling for every path it writes, so a case-only directory rename is not a
   * conflict there: the directory moves, and local-only files move with it.
   */
  renameCaseOnlyDirectories?: boolean;
}

interface Indexed<T> {
  key: string;
  value: T;
}

/**
 * Local paths indexed the way the filesystem compares them: ignoring case, with
 * every spelling kept. A case-sensitive filesystem can hold two entries that
 * fold to one name, and the update must see both rather than silently choosing
 * one.
 */
function indexOf<T>(entries: Iterable<[string, T]>): Map<string, Indexed<T>[]> {
  const index = new Map<string, Indexed<T>[]>();
  for (const [key, value] of entries) {
    const folded = key.toLowerCase();
    const indexed = index.get(folded);
    if (indexed === undefined) index.set(folded, [{ key, value }]);
    else indexed.push({ key, value });
  }
  return index;
}

/** The candidates the plan has not removed, in their local spelling. */
function remaining<T>(
  candidates: readonly Indexed<T>[] | undefined,
  removed: ReadonlySet<string>,
): Indexed<T>[] {
  return (candidates ?? []).filter((candidate) => !removed.has(candidate.key.toLowerCase()));
}

function exactOf<T>(candidates: readonly Indexed<T>[], relativePath: string): Indexed<T> | undefined {
  return candidates.find((candidate) => candidate.key === relativePath);
}

function ancestors(relativePath: string): string[] {
  const parts = relativePath.split("/");
  const prefixes: string[] = [];
  for (let index = 1; index < parts.length; index += 1) {
    prefixes.push(parts.slice(0, index).join("/"));
  }
  return prefixes;
}

function replacedKind(file: string): Problem {
  return {
    level: "error",
    file,
    message: `The update would replace ${file} with a different kind of entry`,
    fix: "Move the local entry away, then run metafab update again",
  };
}

function differentSpelling(file: string, incoming: string): Problem {
  return {
    level: "error",
    file,
    message: `The update writes ${incoming}, which differs only in case from ${file}`,
    fix: "Move the local entry away, then run metafab update again",
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
): Problem {
  return {
    level: "error",
    file: files[0] ?? incoming,
    message: `The update writes ${incoming}, but these local entries differ only in case: ${files.join(", ")}`,
    fix: "Move all but one of the local entries away, then run metafab update again",
  };
}

function blockedByFile(file: string, incoming: string): Problem {
  return {
    level: "error",
    file,
    message: `The update writes ${incoming}, but ${file} is a file`,
    fix: `Move ${file} away, then run metafab update again`,
  };
}

/**
 * Every incoming path that would replace local content instead of merging with
 * it: a file or link landing on a local directory, a directory landing on a
 * local file, a path beneath a local file, or any path that differs only in
 * case from a local file.
 *
 * The update writes with a remove-then-write, so without this check an incoming
 * file at the path of a local directory would delete that directory and
 * everything under it, while the merge plan still reported those files as
 * preserved. A case-only clash is refused, so the same fab update behaves the
 * same everywhere, as `import` does. The exception is a directory a versioned
 * update realigns to the source's spelling: that moves the directory rather
 * than replacing it, so local-only files inside it survive.
 *
 * Several local spellings can fold to one incoming path on a case-sensitive
 * filesystem. An exact match is used; when none matches exactly there is no
 * safe pick, so the update is refused rather than renaming one entry over
 * another and losing local content.
 *
 * Paths the merge plan removes are not obstacles: they are deleted before any
 * write lands. A local directory counts as removed once the plan removes every
 * file beneath it, which is what lets an upstream directory collapse into a
 * file. Local content the plan keeps still blocks a write, as it must.
 */
export function findPathClashes(local: LocalPaths, incoming: IncomingPaths): Problem[] {
  const files = indexOf(local.files.entries());
  const directories = indexOf(local.directories.entries());
  const removed = new Set((incoming.removed ?? []).map((relativePath) => relativePath.toLowerCase()));
  const foldedLocalFiles = [...local.files.keys()].map((key) => key.toLowerCase());
  const problems: Problem[] = [];
  const reported = new Set<string>();

  function report(problem: Problem): void {
    const id = `${problem.file}\u0000${problem.message}`;
    if (reported.has(id)) return;
    reported.add(id);
    problems.push(problem);
  }

  /** True when the plan removes every local file beneath `prefix`. */
  function emptied(prefix: string): boolean {
    const head = `${prefix}/`;
    for (const key of foldedLocalFiles) {
      if (key.startsWith(head) && !removed.has(key)) return false;
    }
    return true;
  }

  function check(relativePath: string, incomingDirectory: boolean): void {
    const folded = relativePath.toLowerCase();

    const localFiles = remaining(files.get(folded), removed);
    const localDirectories = directories.get(folded) ?? [];
    const exactFile = exactOf(localFiles, relativePath);
    const exactLocalDirectory = exactOf(localDirectories, relativePath);

    // On a case-sensitive filesystem a file and a directory can fold to one
    // name. With no exact match for either there is no safe choice, so the
    // update is refused rather than picking one and losing the other.
    if (
      exactFile === undefined &&
      exactLocalDirectory === undefined &&
      localFiles.length + localDirectories.length > 1
    ) {
      report(
        ambiguousSpellingProblem(
          [
            ...localFiles.map((entry) => entry.value.file),
            ...localDirectories.map((entry) => entry.value),
          ],
          relativePath,
        ),
      );
      return;
    }

    if (exactFile !== undefined) {
      if (incomingDirectory) report(replacedKind(exactFile.value.file));
      return;
    }
    if (localFiles.length > 1) {
      report(ambiguousSpellingProblem(localFiles.map((entry) => entry.value.file), relativePath));
      return;
    }
    if (localFiles.length === 1) {
      // An unversioned copy may replace a file that differs only in case; the
      // copy spells it the source's way. A directory landing on a local file
      // is still a kind clash.
      if (incoming.replaceCaseOnlyFiles !== true || incomingDirectory) {
        report(differentSpelling(localFiles[0]!.value.file, relativePath));
      }
      return;
    }

    for (const prefix of ancestors(relativePath)) {
      const foldedPrefix = prefix.toLowerCase();

      const ancestorFiles = remaining(files.get(foldedPrefix), removed);
      const exactAncestor = exactOf(ancestorFiles, prefix);
      if (exactAncestor !== undefined) {
        report(blockedByFile(exactAncestor.value.file, relativePath));
        return;
      }
      if (ancestorFiles.length > 1) {
        report(ambiguousSpellingProblem(ancestorFiles.map((entry) => entry.value.file), relativePath));
        return;
      }
      if (ancestorFiles.length === 1) {
        report(differentSpelling(ancestorFiles[0]!.value.file, relativePath));
        return;
      }

      const ancestorDirectories = directories.get(foldedPrefix) ?? [];
      const exactDirectory = exactOf(ancestorDirectories, prefix);
      if (exactDirectory !== undefined) continue;
      if (ancestorDirectories.length > 1) {
        report(
          ambiguousSpellingProblem(
            ancestorDirectories.map((entry) => entry.value),
            relativePath,
          ),
        );
        return;
      }
      if (ancestorDirectories.length === 1) {
        const replaceable =
          incoming.replaceCaseOnlyFiles === true ||
          incoming.renameCaseOnlyDirectories === true ||
          emptied(foldedPrefix);
        if (!replaceable) {
          report(differentSpelling(ancestorDirectories[0]!.value, relativePath));
          return;
        }
      }
    }

    if (exactLocalDirectory !== undefined) {
      if (!incomingDirectory && !emptied(folded)) {
        report(replacedKind(exactLocalDirectory.value));
      }
      return;
    }
    if (localDirectories.length === 1) {
      // Two directories that differ only in case can be reconciled when the
      // source is copied over them, when a versioned update realigns the
      // directory to the source's spelling, or when the plan empties the local
      // one. A file landing on the local directory is still a kind clash.
      const replaceable =
        (incoming.replaceCaseOnlyFiles === true && incomingDirectory) ||
        (incoming.renameCaseOnlyDirectories === true && incomingDirectory) ||
        emptied(folded);
      if (!replaceable) {
        report(differentSpelling(localDirectories[0]!.value, relativePath));
      }
    }
  }

  for (const relativePath of [...incoming.files].sort()) check(relativePath, false);
  for (const relativePath of [...incoming.directories].sort()) check(relativePath, true);

  return problems;
}
