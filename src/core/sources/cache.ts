import { createHash, randomUUID } from "node:crypto";
import { readdir, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { pathExists, toPosixPath } from "../../util/fs.js";
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

export async function getOrCreate<T>(target: string, options: GetOrCreateOptions<T>): Promise<T> {
  // A complete entry that fails validation is the one case where removing the
  // target is safe: renames are atomic, so it is never another command's
  // partial work.
  if (await pathExists(target)) {
    try {
      return await options.validate(target);
    } catch {
      await removeQuietly(target);
    }
  }

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
}
