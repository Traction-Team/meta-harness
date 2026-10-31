import { createHash } from "node:crypto";
import type { FileEntry, FileTree } from "../../../src/core/import/file-tree.js";

function hashOf(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** An in-memory text entry, hashed the way `snapshotTree` hashes it. */
export function textFile(text: string, mode = 0o644): FileEntry {
  return { hash: hashOf(text), mode, binary: false, text };
}

/** An in-memory binary entry, hashed the way `snapshotTree` hashes it. */
export function binaryFile(data: Uint8Array, mode = 0o644): FileEntry {
  return { hash: hashOf(data), mode, binary: true, data };
}

export function makeTree(files: Record<string, FileEntry>): FileTree {
  return { ...files };
}
