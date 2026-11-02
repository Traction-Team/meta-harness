import type { Problem } from "../../errors.js";
import type { LocalPaths } from "../import/conflicts.js";

/** Factory-relative paths an update will write, as files and as directories. */
export interface IncomingPaths {
  /** Paths written as a file or a symbolic link. */
  files: readonly string[];
  /** Directories created before a file beneath them is written. */
  directories: readonly string[];
}

interface Indexed<T> {
  key: string;
  value: T;
}

/**
 * Local paths indexed the way the filesystem compares them: ignoring case, with
 * the first spelling of a folded path winning so a problem names a real entry.
 */
function indexOf<T>(entries: Iterable<[string, T]>): Map<string, Indexed<T>> {
  const index = new Map<string, Indexed<T>>();
  for (const [key, value] of entries) {
    const folded = key.toLowerCase();
    if (!index.has(folded)) index.set(folded, { key, value });
  }
  return index;
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
 * case from a local file or directory.
 *
 * The update writes with a remove-then-write, so without this check an incoming
 * file at the path of a local directory would delete that directory and
 * everything under it, while the merge plan still reported those files as
 * preserved. A case-only clash is refused on every filesystem, so the same fab
 * update behaves the same everywhere, as `import` does.
 */
export function findPathClashes(local: LocalPaths, incoming: IncomingPaths): Problem[] {
  const files = indexOf(local.files.entries());
  const directories = indexOf(local.directories.entries());
  const problems: Problem[] = [];
  const reported = new Set<string>();

  function report(problem: Problem): void {
    const id = `${problem.file}\u0000${problem.message}`;
    if (reported.has(id)) return;
    reported.add(id);
    problems.push(problem);
  }

  function check(relativePath: string, incomingDirectory: boolean): void {
    const folded = relativePath.toLowerCase();

    const localFile = files.get(folded);
    if (localFile !== undefined) {
      if (localFile.key !== relativePath) {
        report(differentSpelling(localFile.value.file, relativePath));
      } else if (incomingDirectory) {
        report(replacedKind(localFile.value.file));
      }
      return;
    }

    for (const prefix of ancestors(relativePath)) {
      const foldedPrefix = prefix.toLowerCase();
      const ancestorFile = files.get(foldedPrefix);
      if (ancestorFile !== undefined) {
        report(
          ancestorFile.key === prefix
            ? blockedByFile(ancestorFile.value.file, relativePath)
            : differentSpelling(ancestorFile.value.file, relativePath),
        );
        return;
      }

      const ancestorDirectory = directories.get(foldedPrefix);
      if (ancestorDirectory !== undefined && ancestorDirectory.key !== prefix) {
        report(differentSpelling(ancestorDirectory.value, relativePath));
        return;
      }
    }

    const localDirectory = directories.get(folded);
    if (localDirectory === undefined) return;
    if (localDirectory.key !== relativePath) {
      report(differentSpelling(localDirectory.value, relativePath));
    } else if (!incomingDirectory) {
      report(replacedKind(localDirectory.value));
    }
  }

  for (const relativePath of [...incoming.files].sort()) check(relativePath, false);
  for (const relativePath of [...incoming.directories].sort()) check(relativePath, true);

  return problems;
}
