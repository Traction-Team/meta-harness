import { mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { FileEntry, FileTree } from "../import/file-tree.js";
import { ambiguousSpellingProblem } from "./clashes.js";

/** Factory-relative paths an update writes, in the source's spelling. */
export interface IncomingSpelling {
  /** Paths written as a file or a symbolic link. */
  files: readonly string[];
  /** Directories created before a file beneath them is written. */
  directories: readonly string[];
}

interface IncomingPath {
  relativePath: string;
  directory: boolean;
}

/**
 * How one path component in the factory relates to the incoming spelling.
 *
 * An exact entry is already right. A single folded match is renamed. No match
 * means the path is created. More than one match is ambiguous: two local
 * entries differ only in case and neither spells the incoming name, so the
 * update cannot tell which one the incoming path means.
 */
type Choice =
  | { kind: "exact" }
  | { kind: "rename"; name: string }
  | { kind: "missing" }
  | { kind: "ambiguous"; names: string[] };

function chooseName(entries: readonly string[], part: string): Choice {
  if (entries.includes(part)) return { kind: "exact" };
  const matches = entries.filter((name) => name.toLowerCase() === part.toLowerCase());
  if (matches.length === 0) return { kind: "missing" };
  if (matches.length > 1) return { kind: "ambiguous", names: matches };
  return { kind: "rename", name: matches[0]! };
}

function ambiguousSpelling(relativePath: string, candidates: readonly string[]): MetafabError {
  return new MetafabError(
    "Update stopped because local paths differ only in case and the incoming path does not match one exactly.",
    {
      exitCode: ExitCode.Failed,
      code: "update-path-conflict",
      problems: [ambiguousSpellingProblem(candidates, relativePath)],
    },
  );
}

/** Incoming paths in the order the renames must happen: parents before children. */
function incomingPaths(incoming: IncomingSpelling): IncomingPath[] {
  return [
    ...incoming.directories.map((relativePath) => ({ relativePath, directory: true })),
    ...incoming.files.map((relativePath) => ({ relativePath, directory: false })),
  ].sort(
    (left, right) =>
      left.relativePath.split("/").length - right.relativePath.split("/").length ||
      left.relativePath.localeCompare(right.relativePath),
  );
}

/**
 * Renames local entries so each incoming path uses the source's spelling.
 *
 * An unversioned update copies the source over the factory and a versioned
 * update writes the merged files, so a local entry that differs only in case
 * from a path the update writes is replaced anyway. Writing it without renaming
 * would keep the local spelling on a case-insensitive filesystem, so the path on
 * disk would not match the source the fab records. Each component is renamed
 * from the local spelling that matches it, which also realigns a directory that
 * differs only in case, moving the files beneath it along with it.
 *
 * An exact match is always preferred, so a local entry is never renamed over
 * another that is already spelled the incoming way. When several local entries
 * fold to one incoming name and none matches exactly, there is no safe choice:
 * the update is refused before anything is written, and the clash preflight
 * reports the same problem for a dry run.
 *
 * Only incoming paths are visited: local-only paths keep their spelling unless
 * they live beneath a directory that is realigned, in which case they move with
 * it. A missing file is left for the copy or write to create.
 */
export async function alignFactorySpelling(
  factoryDir: string,
  incoming: IncomingSpelling,
): Promise<void> {
  for (const { relativePath, directory } of incomingPaths(incoming)) {
    const parts = relativePath.split("/");
    let current = factoryDir;
    const walked: string[] = [];

    for (const [index, part] of parts.entries()) {
      const last = index === parts.length - 1;
      const choice = chooseName(await readdir(current), part);
      const relative = [...walked, part].join("/");

      if (choice.kind === "ambiguous") {
        throw ambiguousSpelling(
          relative,
          choice.names.map((name) => `.factory/${[...walked, name].join("/")}`),
        );
      }

      if (choice.kind === "missing") {
        // The copy creates a missing file; a missing directory is created here
        // so the next component can be renamed into it.
        if (last && !directory) break;
        await mkdir(path.join(current, part), { recursive: true });
      } else if (choice.kind === "rename") {
        await rename(path.join(current, choice.name), path.join(current, part));
      }

      current = path.join(current, part);
      walked.push(part);
    }
  }
}

interface SpellingNode {
  children: Map<string, SpellingNode>;
  /** Set when the node is a file or link rather than a directory. */
  entry?: FileEntry;
}

function buildSpellingTree(tree: FileTree): SpellingNode {
  const root: SpellingNode = { children: new Map() };

  for (const [relativePath, entry] of Object.entries(tree)) {
    const parts = relativePath.split("/");
    let node = root;
    for (const [index, part] of parts.entries()) {
      if (index === parts.length - 1) {
        node.children.set(part, { children: new Map(), entry });
        continue;
      }

      let child = node.children.get(part);
      if (child === undefined) {
        child = { children: new Map() };
        node.children.set(part, child);
      }
      node = child;
    }
  }

  return root;
}

function alignSpellingTree(root: SpellingNode, incoming: IncomingSpelling): void {
  for (const { relativePath, directory } of incomingPaths(incoming)) {
    const parts = relativePath.split("/");
    let node = root;
    const walked: string[] = [];

    for (const [index, part] of parts.entries()) {
      const last = index === parts.length - 1;
      const choice = chooseName([...node.children.keys()], part);
      const relative = [...walked, part].join("/");

      if (choice.kind === "ambiguous") {
        throw ambiguousSpelling(
          relative,
          choice.names.map((name) => `.factory/${[...walked, name].join("/")}`),
        );
      }

      if (choice.kind === "missing") {
        if (last && !directory) break;
        const created: SpellingNode = { children: new Map() };
        node.children.set(part, created);
        node = created;
      } else if (choice.kind === "rename") {
        const child = node.children.get(choice.name)!;
        node.children.delete(choice.name);
        node.children.set(part, child);
        node = child;
      } else {
        node = node.children.get(part)!;
      }

      walked.push(part);
    }
  }
}

function collectSpellingTree(
  node: SpellingNode,
  prefix: string,
  into: Record<string, FileEntry>,
): void {
  for (const [name, child] of node.children) {
    const relativePath = prefix === "" ? name : `${prefix}/${name}`;
    if (child.entry !== undefined) {
      into[relativePath] = child.entry;
    } else {
      collectSpellingTree(child, relativePath, into);
    }
  }
}

/**
 * The same realignment as {@link alignFactorySpelling}, applied to a snapshot
 * instead of the filesystem.
 *
 * A dry run cannot write, so it computes the tree the writes would produce. A
 * case-only replacement removes the old spelling and adds the new one; without
 * this the summary would report the added path and omit the removed one the
 * real run prints. The rules match the filesystem version, including preferring
 * an exact spelling and refusing an ambiguous one.
 */
export function alignTreeSpelling(tree: FileTree, incoming: IncomingSpelling): FileTree {
  const root = buildSpellingTree(tree);
  alignSpellingTree(root, incoming);

  const aligned: Record<string, FileEntry> = {};
  collectSpellingTree(root, "", aligned);
  return aligned;
}

/**
 * The spelling one path has after the realignment.
 *
 * Components that fold to an incoming path are renamed the way the filesystem
 * realignment renames them; a path outside the incoming paths keeps its
 * spelling. Used for a side file, whose own name is local content but whose
 * directories follow the source, so it lands in the realigned directory instead
 * of recreating the old spelling.
 */
export function alignPathSpelling(relativePath: string, incoming: IncomingSpelling): string {
  // Only the keys of this one-entry tree are read.
  const entry: FileEntry = { hash: "", mode: 0, binary: false };
  const paths = Object.keys(alignTreeSpelling({ [relativePath]: entry }, incoming));
  return paths.length === 1 ? paths[0]! : relativePath;
}
