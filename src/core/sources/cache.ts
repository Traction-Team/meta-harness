import { createHash, randomUUID } from "node:crypto";
import { lstat, readdir, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { isAbsentError, pathExists, toPosixPath } from "../../util/fs.js";
import { sourceWithoutCredentials } from "./parse.js";

export interface CacheLayout {
  root: string;
  npmTarball(name: string, version: string): string;
  gitMirror(url: string): string;
  fabDir(key: string): string;
  fabFactoryDir(key: string): string;
}

export interface GetOrCreateOptions<T> {
  /** The cache root, so a write failure can name what to make writable. */
  root: string;
  /** Validates the entry in the directory it is given and returns the final path. */
  validate: (dir: string) => Promise<T>;
  /** Builds the entry in the staging directory it is given. */
  create: (staging: string) => Promise<void>;
}

const MAX_KEY_LENGTH = 120;
const STALE_AGE_MS = 24 * 60 * 60 * 1000;

export function cacheRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.METAFAB_CACHE?.trim();
  if (override !== undefined && override !== "") return path.resolve(override);
  return path.join(homedir(), ".metafab", "cache");
}

function keySegment(value: string): string {
  const key = value.replace(/[^A-Za-z0-9._@-]+/g, "-").replace(/^\.+$/, "");
  if (key === "") throw new Error(`Invalid cache key "${value}"`);
  return key;
}

export function fabKey(...parts: string[]): string {
  const key = keySegment(parts.filter((part) => part !== "").join("-"));
  if (key.length <= MAX_KEY_LENGTH) return key;
  // A Git source carries its whole path into the name. Keep the readable head
  // and add a digest of the whole key so a path longer than the filesystem
  // allows still names one stable entry.
  const digest = createHash("sha256").update(key).digest("hex").slice(0, 32);
  return `${key.slice(0, 80)}-${digest}`;
}

export function cacheLayout(root: string = cacheRoot()): CacheLayout {
  return {
    root,
    npmTarball(name: string, version: string): string {
      return path.join(root, "npm", ...name.split("/"), `${version}.tgz`);
    },
    gitMirror(url: string): string {
      // Key on the URL without credentials so a new token reuses the mirror
      // instead of cloning the same repository again. A `file:` URL carries
      // none, and its path may hold a `@` that is not userinfo.
      const hash = createHash("sha256").update(sourceWithoutCredentials(url)).digest("hex");
      return path.join(root, "git", hash);
    },
    fabDir(key: string): string {
      return path.join(root, "fabs", keySegment(key));
    },
    fabFactoryDir(key: string): string {
      return path.join(root, "fabs", keySegment(key), ".factory");
    },
  };
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

async function removeQuietly(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true }).catch(() => undefined);
}

/**
 * True when a rename failed because another command put the target in place
 * first. Windows reports a directory rename over an existing one as EPERM or
 * EBUSY, so those count only when the target is there.
 */
export async function isLostRaceError(error: unknown, target: string): Promise<boolean> {
  const code = errorCode(error);
  if (code === "EEXIST" || code === "ENOTEMPTY") return true;
  if (code === "EPERM" || code === "EBUSY") return await pathExists(target);
  return false;
}

/**
 * Removes `<name>.tmp-*` and `<name>.old-*` siblings older than 24 hours. A
 * concurrent command's clone is never touched: no clone takes a day. Best
 * effort, because a cache it cannot clean is still usable.
 */
export async function sweepStale(parent: string, name: string, now: number = Date.now()): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(parent);
  } catch {
    return;
  }

  const prefixes = [`${name}.tmp-`, `${name}.old-`];
  for (const entry of entries) {
    if (!prefixes.some((prefix) => entry.startsWith(prefix))) continue;
    const candidate = path.join(parent, entry);
    try {
      const info = await stat(candidate);
      if (now - info.mtimeMs <= STALE_AGE_MS) continue;
    } catch {
      continue;
    }
    await removeQuietly(candidate);
  }
}

/**
 * One `fetch-failed` problem naming the path: a cache Metafab cannot write
 * stops the command before the repository changes, instead of surfacing a
 * filesystem error as an internal bug.
 */
export function cacheWriteError(target: string, root: string, error: unknown): MetafabError {
  const detail = errorCode(error) ?? (error instanceof Error ? error.message : String(error));
  const message = `Cannot write the Metafab cache: ${detail}: ${target}`;
  const problem: Problem = {
    level: "error",
    file: toPosixPath(target),
    message,
    fix: `Free disk space or make ${root} writable, or set METAFAB_CACHE to a writable directory, then run the command again`,
  };
  return new MetafabError(message, {
    exitCode: ExitCode.FetchFailed,
    code: "fetch-failed",
    problems: [problem],
    cause: error,
  });
}

/**
 * Moves a complete entry that failed validation out of the way. The rename is
 * atomic, so when two commands find the same corrupt entry only one moves it;
 * the other's rename fails with ENOENT and it carries on to create. The caller
 * removes the returned sibling once its replacement is in place: while the old
 * inode is still allocated the replacement cannot reuse it, so a command that
 * read the entry before the swap still sees a different identity afterwards.
 * A sibling a command leaves behind is swept after 24 hours.
 */
async function discardEntry(target: string, root: string): Promise<string | undefined> {
  const discarded = `${target}.old-${randomUUID()}`;
  try {
    await rename(target, discarded);
  } catch (error) {
    // Another command moved it first, so it is already gone.
    if (isAbsentError(error)) return undefined;
    throw cacheWriteError(target, root, error);
  }
  return discarded;
}

interface EntryIdentity {
  dev: bigint;
  ino: bigint;
  ctimeNs: bigint;
}

/**
 * What `lstat` says about the entry: its identity, `"absent"` when it is not
 * there, or `undefined` when `lstat` failed for another reason, which the
 * caller answers the way it always has.
 */
async function entryIdentity(target: string): Promise<EntryIdentity | "absent" | undefined> {
  try {
    const info = await lstat(target, { bigint: true });
    return { dev: info.dev, ino: info.ino, ctimeNs: info.ctimeNs };
  } catch (error) {
    return isAbsentError(error) ? "absent" : undefined;
  }
}

/**
 * True when two reads are the same directory entry. A replaced entry has a new
 * identity, because the rename that installs it moves a different inode in and
 * the entry it replaces stays allocated until then, so an entry that did not
 * change needs no second walk. The values are `bigint` because an NTFS file
 * index can exceed `Number.MAX_SAFE_INTEGER`, where two different entries
 * could compare equal as numbers. An inode of 0, which some network
 * filesystems report, cannot tell two entries apart, so it is never the same
 * entry.
 */
function sameEntry(left: EntryIdentity, right: EntryIdentity): boolean {
  return (
    left.ino !== 0n &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.ctimeNs === right.ctimeNs
  );
}

export async function getOrCreate<T>(target: string, options: GetOrCreateOptions<T>): Promise<T> {
  // A complete entry that fails validation is wrong, not another command's
  // partial work: renames are atomic. Another command may have replaced it
  // since it was read, though, so look again before moving it: moving an entry
  // that just became good would take the path away from its caller. The second
  // look compares identity, so an entry that is still the one that failed is
  // not walked twice; only an entry another command replaced is validated
  // again.
  const before = await entryIdentity(target);
  let discarded: string | undefined;
  // An `lstat` that failed for another reason is not absence: ask the question
  // this code always asked, so the identity check can only skip a walk and
  // never add a failure.
  const present = before === undefined ? await pathExists(target) : before !== "absent";
  if (present) {
    try {
      return await options.validate(target);
    } catch {
      const after = await entryIdentity(target);
      if (after !== "absent") {
        if (
          before !== undefined &&
          before !== "absent" &&
          after !== undefined &&
          sameEntry(before, after)
        ) {
          // The entry that failed is the one still there, so a second walk
          // would fail the same way.
          discarded = await discardEntry(target, options.root);
        } else if (await pathExists(target)) {
          // Another command replaced the entry, or an `lstat` failed for
          // another reason: validate again before moving anything aside.
          try {
            return await options.validate(target);
          } catch {
            discarded = await discardEntry(target, options.root);
          }
        }
      }
    }
  }

  try {
    await sweepStale(path.dirname(target), path.basename(target));

    const staging = `${target}.tmp-${randomUUID()}`;
    try {
      await options.create(staging);
    } catch (error) {
      await removeQuietly(staging);
      throw error;
    }

    let result: T;
    try {
      result = await options.validate(staging);
    } catch (error) {
      await removeQuietly(staging);
      throw error;
    }

    try {
      await rename(staging, target);
    } catch (error) {
      if (await isLostRaceError(error, target)) {
        // Another command renamed a complete entry into place first. Its entry
        // is the one that won; use it rather than deleting it.
        await removeQuietly(staging);
        return await options.validate(target);
      }
      await removeQuietly(staging);
      throw cacheWriteError(target, options.root, error);
    }

    return result;
  } finally {
    // The discarded entry stays allocated until its replacement is in place,
    // so the replacement cannot reuse its inode.
    if (discarded !== undefined) await removeQuietly(discarded);
  }
}
