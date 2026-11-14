import { createHash } from "node:crypto";
import { lstat, readFile, readlink } from "node:fs/promises";
import path from "node:path";
import { readdirTyped } from "../../util/fs.js";
import { toLF, usesCRLF } from "../../util/text.js";
import { textContent } from "../build/skill.js";

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
  /** True when the text uses CRLF on every line, so a write can keep it. */
  crlf?: true;
  /** The file's original bytes when they differ from the LF text, so a write can keep them. */
  raw?: Buffer;
}

/** A snapshot of a factory directory: relative POSIX path to entry. */
export type FileTree = Readonly<Record<string, FileEntry>>;

export const LINK_HASH_PREFIX = "\0metafab-link\0";

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
  // Decoding keeps a valid UTF-8 file as text. Anything else stays raw bytes:
  // re-encoding a lossy decode would corrupt the file, and two different invalid
  // sequences would decode to the same replacement characters.
  const decoded = textContent(data);
  if (decoded === undefined) {
    return { hash: hashOf(data), mode, binary: true, data };
  }
  const text = toLF(decoded);
  const entry: FileEntry = { hash: hashOf(text), mode, binary: false, text };
  // Keep the original bytes only when normalising changed them, which is a
  // CRLF or mixed-ending file, so a write can reproduce the file as it was.
  if (text !== decoded) entry.raw = data;
  if (usesCRLF(decoded)) entry.crlf = true;
  return entry;
}

/**
 * Snapshot every file and symbolic link under `dir`, keyed by its POSIX path
 * relative to `dir`.
 *
 * Text is stored with LF line endings and hashed that way, so a change of line
 * endings alone is not a change. Content that is not valid UTF-8, and content
 * with a NUL, are binary: stored and hashed as raw bytes. A link is stored with
 * its target, so an added, removed, or repointed link is a change like any
 * other.
 */
export async function snapshotTree(dir: string): Promise<FileTree> {
  const root = path.resolve(dir);
  const entries: Record<string, FileEntry> = {};

  async function walk(directory: string, prefix: string): Promise<void> {
    const children = await readdirTyped(directory);
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

/**
 * Every directory under `dir`, as POSIX paths relative to it, symbolic links
 * not followed.
 *
 * A snapshot keeps no directories, so this is how a preflight finds a local
 * directory that an incoming file or link would delete, empty or not.
 */
export async function snapshotDirectories(dir: string): Promise<string[]> {
  const root = path.resolve(dir);
  const directories: string[] = [];

  async function walk(directory: string, prefix: string): Promise<void> {
    const children = await readdirTyped(directory);
    children.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

    for (const child of children) {
      // A symbolic link is not a directory here: the snapshot treats it as a link.
      if (!child.isDirectory()) continue;
      const relativePath = prefix === "" ? child.name : `${prefix}/${child.name}`;
      directories.push(relativePath);
      await walk(path.join(directory, child.name), relativePath);
    }
  }

  await walk(root, "");
  return directories;
}

/** A file tree with no entries: the state of a repository before its first import. */
export function emptyTree(): FileTree {
  return {};
}
