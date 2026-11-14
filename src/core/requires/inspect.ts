import path from "node:path";
import { readdirTyped } from "../../util/fs.js";
import type { DirEntry } from "../../util/fs.js";
import type { Requirement } from "../factory/types.js";

export type RequirementState = "present" | "missing" | "blocked" | "created" | "declined" | "failed";

/** What kind of entry stands in the way of a required path. */
export type RequirementClashKind = "file" | "directory" | "link" | "other";

export interface RequirementResult {
  path: string;
  description: string;
  template?: string;
  state: RequirementState;
  /** Why it is blocked or failed, as a phrase for the summary. */
  reason?: string;
  /**
   * For `blocked`: the repository-relative path of the existing entry in the
   * way (the directory at the path, the file or link parent, or the case
   * variant). `check`'s fix line names it.
   */
  clash?: string;
  /**
   * For a `blocked` case variant: what kind of entry has the other spelling, so
   * a fix line offers a rename only when renaming gives the required path what
   * it needs (a directory at a parent, or any non-directory entry at the path
   * itself, which inspection would then report as present).
   */
  clashKind?: RequirementClashKind;
}

/** What inspection needs of a requirement; a `Requirement` satisfies it. */
export type RequirementRef = Pick<Requirement, "path" | "description"> & { template?: string };

function base(requirement: RequirementRef): Omit<RequirementResult, "state"> {
  return {
    path: requirement.path,
    description: requirement.description,
    ...(requirement.template === undefined ? {} : { template: requirement.template }),
  };
}

function missing(requirement: RequirementRef): RequirementResult {
  return { ...base(requirement), state: "missing" };
}

function present(requirement: RequirementRef): RequirementResult {
  return { ...base(requirement), state: "present" };
}

function blocked(
  requirement: RequirementRef,
  reason: string,
  clash: string,
  clashKind?: RequirementClashKind,
): RequirementResult {
  return {
    ...base(requirement),
    state: "blocked",
    reason,
    clash,
    ...(clashKind === undefined ? {} : { clashKind }),
  };
}

/** What kind of entry a case variant is, from a listing that never follows links. */
function kindOf(entry: DirEntry): RequirementClashKind {
  if (entry.isFile()) return "file";
  if (entry.isDirectory()) return "directory";
  if (entry.isSymbolicLink()) return "link";
  return "other";
}

type DirectoryRead = { ok: true; entries: DirEntry[] } | { ok: false; absent: boolean };

async function readDirectory(directory: string): Promise<DirectoryRead> {
  try {
    return { ok: true, entries: await readdirTyped(directory) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    return { ok: false, absent: code === "ENOENT" || code === "ENOTDIR" };
  }
}

function label(relativePath: string): string {
  return relativePath === "" ? "." : relativePath;
}

/**
 * What is at a required path in the repository, without writing anything:
 *
 * - `present`: a file, link (even a dangling one) or other entry that is not a
 *   directory.
 * - `missing`: nothing is at the path, and no parent is in the way.
 * - `blocked`: a directory is at the path, a parent is a file or link (or not a
 *   directory), the path or a parent differs only in letter case from an
 *   existing entry, or a parent cannot be read.
 *
 * Inspection never follows a link, so a linked parent cannot redirect a later
 * write. Names are folded with `toLowerCase`, as `import` folds them, so a case
 * variant is reported the same way on every filesystem.
 */
export async function inspectRequirement(
  root: string,
  requirement: RequirementRef,
): Promise<RequirementResult> {
  const segments = requirement.path.split("/");
  const last = segments.pop() ?? "";
  const parents: string[] = [];
  let directory = root;

  const unreadable = (parent: string): RequirementResult =>
    blocked(requirement, `Cannot read ${label(parent)}`, label(parent));

  for (const segment of segments) {
    const listing = await readDirectory(directory);
    if (!listing.ok) {
      if (listing.absent) return missing(requirement);
      return unreadable(parents.join("/"));
    }

    const relativePath = [...parents, segment].join("/");
    const exact = listing.entries.find((entry) => entry.name === segment);

    if (exact !== undefined) {
      if (exact.isDirectory()) {
        parents.push(segment);
        directory = path.join(directory, segment);
        continue;
      }

      if (exact.isSymbolicLink()) return blocked(requirement, `${relativePath} is a symbolic link`, relativePath);
      if (exact.isFile()) return blocked(requirement, `${relativePath} is a file`, relativePath);
      return blocked(requirement, `${relativePath} is not a directory`, relativePath);
    }

    const folded = listing.entries.find(
      (entry) => entry.name.toLowerCase() === segment.toLowerCase(),
    );
    if (folded !== undefined) {
      const clash = [...parents, folded.name].join("/");
      return blocked(
        requirement,
        `${clash} differs only in letter case`,
        clash,
        kindOf(folded),
      );
    }

    return missing(requirement);
  }

  const listing = await readDirectory(directory);
  if (!listing.ok) {
    if (listing.absent) return missing(requirement);
    return unreadable(parents.join("/"));
  }

  const exact = listing.entries.find((entry) => entry.name === last);
  if (exact !== undefined) {
    return exact.isDirectory()
      ? blocked(requirement, `${requirement.path} is a directory`, requirement.path)
      : present(requirement);
  }

  const folded = listing.entries.find((entry) => entry.name.toLowerCase() === last.toLowerCase());
  if (folded !== undefined) {
    const clash = [...parents, folded.name].join("/");
    return blocked(requirement, `${clash} differs only in letter case`, clash, kindOf(folded));
  }

  return missing(requirement);
}
