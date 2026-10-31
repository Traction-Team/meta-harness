import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import path from "node:path";
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
  /** The target of a symbolic link, when the entry is a link rather than a file. */
  link?: string;
}

/** A snapshot of a factory directory: relative POSIX path to entry. */
export type FileTree = Readonly<Record<string, FileEntry>>;

const LINK_HASH_PREFIX = "\0metafab-link\0";

function hashOf(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

async function entryOf(target: string, link: string | undefined): Promise<FileEntry> {
  if (link !== undefined) {
    const info = await lstat(target);
    // The prefix keeps a link's target from hashing like file content with the same bytes.
    return {
      hash: hashOf(`${LINK_HASH_PREFIX}${link}`),
      mode: info.mode & 0o777,
      binary: false,
      link,
    };
  }

  const [data, info] = await Promise.all([readFile(target), lstat(target)]);
  const mode = info.mode & 0o777;
  if (isBinary(data)) {
    return { hash: hashOf(data), mode, binary: true, data };
  }
  const text = toLF(data.toString("utf8"));
  return { hash: hashOf(text), mode, binary: false, text };
}

/**
 * Snapshot every file and symbolic link under `dir`, keyed by its POSIX path
 * relative to `dir`.
 *
 * Text is stored with LF line endings and hashed that way, so a change of line
 * endings alone is not a change. Binary content is stored and hashed as bytes.
 * A link is stored with its target, so an added, removed, or repointed link is
 * a change like any other.
 */
export async function snapshotTree(dir: string): Promise<FileTree> {
  const root = path.resolve(dir);
  const entries: Record<string, FileEntry> = {};

  async function walk(directory: string, prefix: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

    for (const child of children) {
      const relativePath = prefix === "" ? child.name : `${prefix}/${child.name}`;
      const target = path.join(directory, child.name);

      if (child.isSymbolicLink()) {
        entries[relativePath] = await entryOf(target, await readlink(target));
      } else if (child.isDirectory()) {
        await walk(target, relativePath);
      } else if (child.isFile()) {
        entries[relativePath] = await entryOf(target, undefined);
      }
    }
  }

  await walk(root, "");
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
