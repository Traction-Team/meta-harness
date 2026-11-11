import { lstat, readdir, readFile, readlink } from "node:fs/promises";
import path from "node:path";

/**
 * One entry of a raw tree walk: exact spelling, exact bytes, exact mode and the
 * exact link target.
 *
 * `snapshotTree` is not usable here: it normalises line endings, hashes with LF,
 * and keeps no directories, so it cannot prove that a restore left the
 * directory byte-identical.
 */
export interface RawEntry {
  path: string;
  kind: "file" | "directory" | "link";
  /** Full permission bits, for a file. */
  mode?: number;
  /** The file's bytes, base64 so a byte difference is visible. */
  data?: string;
  /** The target of a link. */
  target?: string;
}

/** Every entry under `root`, parents before children, sorted by name at each level. */
export async function walkRaw(root: string, prefix = ""): Promise<RawEntry[]> {
  const entries: RawEntry[] = [];
  const children = await readdir(root, { withFileTypes: true });
  children.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

  for (const child of children) {
    const target = path.join(root, child.name);
    const relativePath = prefix === "" ? child.name : `${prefix}/${child.name}`;
    const info = await lstat(target);

    if (info.isSymbolicLink()) {
      entries.push({ path: relativePath, kind: "link", target: await readlink(target) });
    } else if (info.isDirectory()) {
      entries.push({ path: relativePath, kind: "directory" });
      entries.push(...(await walkRaw(target, relativePath)));
    } else {
      entries.push({
        path: relativePath,
        kind: "file",
        mode: info.mode & 0o7777,
        data: (await readFile(target)).toString("base64"),
      });
    }
  }

  return entries;
}
