import { createHash } from "node:crypto";
import path from "node:path";
import { toLF } from "../../util/text.js";
import { textContent } from "../build/skill.js";
import { snapshotFactory, snapshotTree } from "../import/file-tree.js";
import type { FileEntry, FileTree } from "../import/file-tree.js";
import { FAB_ROOT_EXCLUDES } from "../import/copy.js";
import type { MergeInput } from "../merge.js";
import { modeMatters } from "../summary.js";

/**
 * Files that belong to the receiving repository rather than the fab:
 * `metafab.yaml` and the README at the `.factory/` root. An update leaves them
 * alone and a comparison skips them.
 */
export const FACTORY_EXCLUDES: ReadonlySet<string> = FAB_ROOT_EXCLUDES;

/** A factory snapshot without the paths an update never merges. */
export function withoutFactoryExcludes(tree: FileTree): FileTree {
  const kept: Record<string, FileEntry> = {};
  for (const [relativePath, entry] of Object.entries(tree)) {
    if (FACTORY_EXCLUDES.has(relativePath)) continue;
    kept[relativePath] = entry;
  }
  return kept;
}

/** Snapshot a fetched fab's `.factory/` directory, without the excluded paths. */
export async function factoryTree(factoryDir: string): Promise<FileTree> {
  return withoutFactoryExcludes(await snapshotTree(factoryDir));
}

/** Snapshot the active `.factory/` under `root`, without the excluded paths. */
export async function localFactoryTree(root: string): Promise<FileTree> {
  return withoutFactoryExcludes(await snapshotFactory(root));
}

/** The bytes a merge compares: file content, or a link's target. */
export function entryContent(entry: FileEntry): Buffer {
  if (entry.link !== undefined) return Buffer.from(entry.link, "utf8");
  if (entry.binary) return Buffer.from(entry.data ?? new Uint8Array());
  return Buffer.from(entry.text ?? "", "utf8");
}

/** One side of a three-way merge, or undefined when the path is absent. */
export function mergeInputOf(entry: FileEntry | undefined): MergeInput | undefined {
  if (entry === undefined) return undefined;
  return {
    content: entryContent(entry),
    mode: entry.mode,
    ...(entry.link === undefined ? {} : { link: entry.link }),
  };
}

function hashOf(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Builds the snapshot entry for content the merge produced. */
export function entryFromContent(content: Buffer, mode: number): FileEntry {
  const text = textContent(content);
  if (text === undefined) {
    return { hash: hashOf(content), mode: mode & 0o777, binary: true, data: content };
  }
  const normalised = toLF(text);
  return { hash: hashOf(normalised), mode: mode & 0o777, binary: false, text: normalised };
}

/** True when two snapshots describe the same content, mode, and link target. */
export function sameEntry(left: FileEntry | undefined, right: FileEntry | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.hash === right.hash && left.link === right.link && !modeMatters(left, right);
}

/** Absolute path of a factory-relative POSIX path. */
export function factoryPath(factoryDir: string, relativePath: string): string {
  return path.join(factoryDir, ...relativePath.split("/"));
}
