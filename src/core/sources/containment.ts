import { realpath, stat } from "node:fs/promises";
import path from "node:path";

const FACTORY_DIRECTORY = ".factory";

/** The parts of a `stat()` result that identify a file on disk. */
export interface FileIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}

/**
 * Whether two `stat(path, { bigint: true })` results are the same file. NTFS
 * file IDs are 64 bits, and a JavaScript number keeps only 53, so comparing
 * `dev` and `ino` as numbers makes different files look like the same one.
 * Pass bigint stats so the exact values are compared.
 */
export function sameFile(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

/**
 * The directory a link must stay inside. The spelling of the stored path is not
 * what the filesystem matches on: on a case-insensitive filesystem
 * `.FACTORY/leak` lives in the same directory as `.factory/leak`, and a
 * symlinked parent can put a differently spelled path there too. Walk the
 * link's real ancestors and compare their identity with `.factory`.
 */
export async function containmentRootAbsolute(
  absoluteLinkPath: string,
  destination: string,
): Promise<string> {
  const destinationRoot = await realpath(destination).catch(() => path.resolve(destination));
  const factoryPath = path.join(destination, FACTORY_DIRECTORY);
  const factory = await stat(factoryPath, { bigint: true }).catch(() => undefined);
  if (factory === undefined) return destinationRoot;

  let current = path.dirname(absoluteLinkPath);
  for (;;) {
    const ancestor = await stat(current, { bigint: true }).catch(() => undefined);
    if (ancestor !== undefined && sameFile(ancestor, factory)) {
      return realpath(factoryPath).catch(() => factoryPath);
    }
    const parent = path.dirname(current);
    if (parent === current) return destinationRoot;
    current = parent;
  }
}

export function isInsideAbsolute(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  if (relative === "") return true;
  if (path.isAbsolute(relative)) return false;
  if (relative === "..") return false;
  // A name may start with two dots (`.factory/..notes.md`); only a `..`
  // segment, whole or followed by a separator, leaves the root.
  return !(relative.startsWith(`..${path.sep}`) || relative.startsWith("../"));
}
