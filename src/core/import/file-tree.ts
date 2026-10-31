import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { listFiles } from "../../util/fs.js";
import { isBinary, toLF } from "../../util/text.js";

export interface FileEntry {
  /** SHA-256 of the content: the LF-normalised bytes for text, the raw bytes for binary. */
  hash: string;
  /** Permission bits, so an executable bit counts as a change. */
  mode: number;
  binary: boolean;
  /** Content when the file is text, with LF line endings. */
  text?: string;
  /** Content when the file is binary. */
  data?: Uint8Array;
}

/** A snapshot of a factory directory: relative POSIX path to entry. */
export type FileTree = Readonly<Record<string, FileEntry>>;

function hashOf(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Snapshot every file under `dir`, keyed by its POSIX path relative to `dir`.
 *
 * Text is stored with LF line endings and hashed that way, so a change of line
 * endings alone is not a change. Binary content is stored and hashed as bytes.
 */
export async function snapshotTree(dir: string): Promise<FileTree> {
  const root = path.resolve(dir);
  const files = await listFiles(root);
  const entries: Record<string, FileEntry> = {};

  for (const relativePath of files) {
    const target = path.join(root, ...relativePath.split("/"));
    const [data, info] = await Promise.all([readFile(target), stat(target)]);
    const mode = info.mode & 0o777;
    if (isBinary(data)) {
      entries[relativePath] = { hash: hashOf(data), mode, binary: true, data };
    } else {
      const text = toLF(data.toString("utf8"));
      entries[relativePath] = { hash: hashOf(text), mode, binary: false, text };
    }
  }

  return entries;
}

/** Snapshot the active factory, `.factory/` under `root`. */
export async function snapshotFactory(root: string): Promise<FileTree> {
  return snapshotTree(path.join(path.resolve(root), ".factory"));
}

/** A file tree with no entries: the state of a repository before its first import. */
export function emptyTree(): FileTree {
  return {};
}
