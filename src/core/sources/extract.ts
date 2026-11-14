import { createReadStream } from "node:fs";
import { link, mkdir, realpath, rm, stat, symlink } from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";
import * as tar from "tar";
import type { ReadEntry } from "tar";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { containmentRootAbsolute, isInsideAbsolute } from "./containment.js";

export const MAX_FAB_FILE_SIZE = 1024 * 1024;
export const MAX_FAB_TOTAL_SIZE = 64 * 1024 * 1024;
export const MAX_FAB_ENTRIES = 10_000;

const BLOCK_SIZE = 512;
const FACTORY_DIRECTORY = ".factory";

export interface ExtractTarballOptions {
  strip?: number;
  stripPrefix?: string;
  flattenSingleDirectory?: boolean;
  maxFileSize?: number;
  maxTotalSize?: number;
  maxEntries?: number;
  /**
   * Turns a failure to write the destination into the caller's own error, such
   * as a cache write failure. Without it, every destination failure is a
   * tarball problem (exit 4), as it always was.
   */
  writeError?: (target: string, error: unknown) => MetafabError;
}

const CACHE_WRITE_CODES = new Set(["EACCES", "EPERM", "ENOSPC", "EROFS", "EDQUOT"]);

/**
 * True when a filesystem failure means the destination could not be written,
 * rather than the archive being bad: permissions, a full disk or a read-only
 * filesystem.
 */
export function isCacheWriteFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && CACHE_WRITE_CODES.has(code);
}

interface ArchiveEntry {
  path: string;
  type: string;
  linkpath?: string;
  size: number;
}

interface LinkTask {
  kind: "symbolic" | "hard";
  target: string;
  path: string;
}

const FILE_TYPES = new Set(["File", "OldFile", "ContiguousFile"]);
const DIRECTORY_TYPES = new Set(["Directory"]);
const METADATA_TYPES = new Set(["ExtendedHeader", "GlobalExtendedHeader"]);
const LINK_TYPES = new Set(["SymbolicLink", "Link"]);
// Every file, directory and link is one entry. Metadata headers and unsupported
// entry types are not, so the cap counts the same things as a local-path copy.
const COUNTED_TYPES = new Set([...FILE_TYPES, ...DIRECTORY_TYPES, ...LINK_TYPES]);

function unsafePathReason(entryPath: string): string | undefined {
  if (entryPath === "") return "the entry has an empty path";
  const normalized = entryPath.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    entryPath.startsWith("\\")
  ) {
    return "absolute paths are not allowed";
  }
  if (normalized.split("/").includes("..")) return "paths that contain .. are not allowed";
  return undefined;
}

function collidesWithFactory(segment: string): boolean {
  if (segment === FACTORY_DIRECTORY) return false;
  return segment.replace(/[. ]+$/g, "").toLowerCase() === FACTORY_DIRECTORY;
}

function factoryCollisionReason(entryPath: string): string | undefined {
  for (const segment of entryPath.replace(/\\/g, "/").split("/")) {
    if (collidesWithFactory(segment)) {
      return "paths that collide with .factory are not allowed in a fab";
    }
  }
  return undefined;
}

function entryProblem(entry: ReadEntry, maxFileSize: number): string | undefined {
  if (entry.type === "BlockDevice" || entry.type === "CharacterDevice" || entry.type === "FIFO") {
    return "device files and FIFOs are not allowed in a fab";
  }
  if (FILE_TYPES.has(entry.type) && entry.size > maxFileSize) {
    return `files larger than ${maxFileSize} bytes are not allowed in a fab`;
  }
  return undefined;
}

function isAllowedType(entry: ReadEntry): boolean {
  return FILE_TYPES.has(entry.type) || DIRECTORY_TYPES.has(entry.type) || METADATA_TYPES.has(entry.type);
}

function normalizePrefix(prefix: string): string {
  const normalized = prefix.replace(/\\/g, "/").replace(/^\.\//, "");
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function cleanEntryPath(entryPath: string): string {
  const parts = entryPath.replace(/\\/g, "/").split("/");
  let index = 0;
  while (index < parts.length && parts[index] === ".") index += 1;
  return parts.slice(index).join("/");
}

function stripSegments(entryPath: string, count: number): string {
  const parts = entryPath.replace(/\\/g, "/").split("/").filter((part) => part !== "");
  return parts.slice(count).join("/");
}

function stripEntryPath(entryPath: string, count: number): string {
  const parts = cleanEntryPath(entryPath).split("/");
  if (parts.length < count) return "";
  return parts.slice(count).join("/");
}

interface ListingLimits {
  maxEntries: number;
  maxTotalSize: number;
}

/**
 * Header and padding blocks are read for every entry too, so a tar full of
 * padding or metadata cannot hide behind the declared file sizes.
 */
function blockBytes(size: number): number {
  return BLOCK_SIZE + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
}

function listingReadCap(limits: ListingLimits): number {
  return limits.maxTotalSize + limits.maxEntries * 2 * BLOCK_SIZE + 2 * BLOCK_SIZE;
}

function listingProblem(
  entries: number,
  declaredBytes: number,
  readBytes: number,
  limits: ListingLimits,
): string | undefined {
  if (entries > limits.maxEntries) {
    return `archives with more than ${limits.maxEntries} entries are not allowed in a fab`;
  }
  if (declaredBytes > limits.maxTotalSize) {
    return `extracted files larger than ${limits.maxTotalSize} bytes in total are not allowed in a fab`;
  }
  if (readBytes > listingReadCap(limits)) {
    return `archives that expand to more than ${listingReadCap(limits)} bytes are not allowed in a fab`;
  }
  return undefined;
}

async function readEntries(tarball: string, limits: ListingLimits): Promise<ArchiveEntry[]> {
  const entries: ArchiveEntry[] = [];
  let countedEntries = 0;
  let declaredBytes = 0;
  let readBytes = 0;
  let failure: MetafabError | undefined;

  const parser = tar.list({
    onentry: (entry) => {
      entries.push({
        path: entry.path,
        type: entry.type,
        ...(entry.linkpath === undefined || entry.linkpath === null
          ? {}
          : { linkpath: String(entry.linkpath) }),
        size: entry.size,
      });
      readBytes += blockBytes(entry.size);
      if (FILE_TYPES.has(entry.type)) declaredBytes += entry.size;
      if (COUNTED_TYPES.has(entry.type)) countedEntries += 1;

      const problem = listingProblem(countedEntries, declaredBytes, readBytes, limits);
      if (problem === undefined) {
        entry.resume();
        return;
      }
      failure = unsafeArchive(problem);
      parser.abort(failure);
    },
  });

  const stream = createReadStream(tarball);
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        stream.destroy();
        reject(error);
      };
      parser.on("end", () => {
        if (settled) return;
        settled = true;
        resolve();
      });
      parser.on("error", fail);
      stream.on("error", fail);
      stream.pipe(parser);
    });
  } catch (error) {
    if (failure !== undefined) throw failure;
    throw error;
  } finally {
    // An aborted listing stops at a header, so the rest of the archive is never
    // read. Closing the descriptor here keeps a rejected archive from leaving a
    // stream running (and erroring) after the promise has settled.
    stream.destroy();
  }
  if (failure !== undefined) throw failure;
  return entries;
}

async function singleTopDirectory(
  entries: ArchiveEntry[],
  prefix: string | undefined,
  strip: number,
): Promise<string | undefined> {
  const cleaned = entries.map((entry) => cleanEntryPath(entry.path));
  const relative = cleaned
    .filter((entryPath) => prefix === undefined || entryPath.startsWith(prefix))
    .map((entryPath) => stripSegments(prefixedPath(entryPath, prefix), strip))
    .filter((entryPath) => entryPath !== "");

  const segments = relative.map((entryPath) => entryPath.split("/").filter((part) => part !== ""));
  if (segments.length === 0) return undefined;

  const first = segments[0]?.[0];
  if (first === undefined || first === ".factory") return undefined;
  if (!segments.every((parts) => parts[0] === first)) return undefined;
  if (!segments.some((parts) => parts.length >= 2)) return undefined;
  return first;
}

function prefixedPath(entryPath: string, prefix: string | undefined): string {
  return prefix === undefined ? entryPath : entryPath.slice(prefix.length);
}

function isAbsoluteLinkTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, "/");
  return normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized);
}

function containmentRoot(finalPath: string): string {
  return finalPath === ".factory" || finalPath.startsWith(".factory/") ? ".factory" : "";
}

function isWithin(root: string, target: string): boolean {
  if (target === "" || target === ".." || target.startsWith("../")) return false;
  if (root === "") return true;
  return target === root || target.startsWith(`${root}/`);
}

function symlinkTarget(finalPath: string, linkpath: string): string | undefined {
  if (linkpath === "" || isAbsoluteLinkTarget(linkpath)) return undefined;
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(finalPath), linkpath.replace(/\\/g, "/")),
  );
  const root = containmentRoot(finalPath);
  if (!isWithin(root, resolved)) return undefined;
  return resolved;
}

function hardLinkTarget(finalPath: string, linkpath: string, strip: number): string | undefined {
  if (linkpath === "" || isAbsoluteLinkTarget(linkpath)) return undefined;
  if (linkpath.replace(/\\/g, "/").split("/").includes("..")) return undefined;
  const resolved = path.posix.normalize(stripEntryPath(linkpath, strip));
  const root = containmentRoot(finalPath);
  if (!isWithin(root, resolved)) return undefined;
  return resolved;
}

function finalPath(entryPath: string, strip: number): string {
  return path.posix.normalize(stripEntryPath(entryPath, strip));
}

/**
 * Reject an archive that would overwrite earlier content or turn a directory
 * into a file or link. Extraction must never have to delete a path to make
 * room: `..notes.md` is a harmless file name, but `.factory/dir` as both a
 * directory and a link is not.
 */
function pathCollisionProblems(
  entries: ArchiveEntry[],
  strip: number,
  linkDirectories: Set<string>,
): Problem[] {
  const problems: Problem[] = [];
  const categories = new Map<string, "directory" | "file" | "link">();
  const directories = new Set<string>();

  for (const entry of entries) {
    if (!COUNTED_TYPES.has(entry.type)) continue;
    if (unsafePathReason(entry.path) !== undefined) continue;
    if (factoryCollisionReason(entry.path) !== undefined) continue;

    const entryPath = finalPath(cleanEntryPath(entry.path), strip);
    if (entryPath === "" || entryPath === ".") continue;
    // A symlink and everything below it is rejected by the filter with its own
    // message; do not report the same entries as a directory collision here.
    if (linkDirectories.has(entryPath) || writtenThroughLink(entryPath, linkDirectories)) continue;

    const category = DIRECTORY_TYPES.has(entry.type)
      ? "directory"
      : LINK_TYPES.has(entry.type)
        ? "link"
        : "file";
    const previous = categories.get(entryPath);
    if (previous !== undefined && !(previous === "directory" && category === "directory")) {
      problems.push({
        level: "error",
        file: entry.path,
        message: `duplicate archive entry "${entryPath}" would replace earlier content`,
      });
      continue;
    }
    if (previous === undefined) categories.set(entryPath, category);

    let parent = path.posix.dirname(entryPath);
    while (parent !== "." && parent !== "/" && parent !== "") {
      directories.add(parent);
      const next = path.posix.dirname(parent);
      if (next === parent) break;
      parent = next;
    }
    if (category === "directory") directories.add(entryPath);
  }

  for (const [entryPath, category] of categories) {
    if (category === "directory") continue;
    if (directories.has(entryPath)) {
      problems.push({
        level: "error",
        file: entryPath,
        message: "an entry whose path is an existing directory is not allowed",
      });
    }
  }

  return problems;
}

function symlinkDirectories(entries: ArchiveEntry[], strip: number): Set<string> {
  const directories = new Set<string>();
  for (const entry of entries) {
    if (entry.type !== "SymbolicLink") continue;
    if (unsafePathReason(entry.path) !== undefined) continue;
    const entryPath = finalPath(entry.path, strip);
    if (entryPath === "") continue;
    directories.add(entryPath);
  }
  return directories;
}

function writtenThroughLink(entryPath: string, directories: Set<string>): boolean {
  let current = path.posix.dirname(entryPath);
  while (current !== "." && current !== "/" && current !== "") {
    if (directories.has(current)) return true;
    current = path.posix.dirname(current);
  }
  return false;
}

function linkPath(destination: string, relativePath: string): string {
  return path.join(destination, ...relativePath.split("/"));
}

async function targetExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function linkTargetType(target: string): Promise<"dir" | "file"> {
  try {
    return (await stat(target)).isDirectory() ? "dir" : "file";
  } catch {
    return "file";
  }
}

function linkProblem(task: LinkTask, error: unknown): Problem {
  const message = error instanceof Error ? error.message : String(error);
  return {
    level: "error",
    file: task.path,
    message: `links could not be created: ${message}`,
  };
}

async function createSymbolicLink(
  destination: string,
  task: LinkTask,
  type: "dir" | "file",
): Promise<void> {
  const target = linkPath(destination, task.path);
  await mkdir(path.dirname(target), { recursive: true });
  await symlink(task.target, target, type);
}

async function createHardLink(destination: string, task: LinkTask): Promise<void> {
  const target = linkPath(destination, task.path);
  await mkdir(path.dirname(target), { recursive: true });
  // Never remove whatever is already at the path: a directory here holds files
  // that earlier entries extracted. A collision is rejected before extraction.
  await link(linkPath(destination, task.target), target);
}

interface LinkProblems {
  problems: Problem[];
  /** Paths whose creation already failed, so verification does not repeat them. */
  failed: Set<string>;
}

async function createLinks(destination: string, tasks: LinkTask[]): Promise<LinkProblems> {
  const problems: Problem[] = [];
  const failed = new Set<string>();
  const symbolic = tasks.filter((task) => task.kind === "symbolic");
  const hard = tasks.filter((task) => task.kind === "hard");

  let pending = symbolic;
  while (pending.length > 0) {
    const remaining: LinkTask[] = [];
    let progress = false;

    for (const task of pending) {
      const target = linkPath(destination, task.path);
      const absoluteTarget = path.resolve(path.dirname(target), task.target);
      if (!(await targetExists(absoluteTarget))) {
        remaining.push(task);
        continue;
      }
      try {
        await createSymbolicLink(destination, task, await linkTargetType(absoluteTarget));
        progress = true;
      } catch (error) {
        problems.push(linkProblem(task, error));
        failed.add(task.path);
        progress = true;
      }
    }

    if (!progress) {
      for (const task of remaining) {
        try {
          await createSymbolicLink(destination, task, "file");
        } catch (error) {
          problems.push(linkProblem(task, error));
          failed.add(task.path);
        }
      }
      break;
    }
    pending = remaining;
  }

  for (const task of hard) {
    const source = linkPath(destination, task.target);
    const target = linkPath(destination, task.path);
    await mkdir(path.dirname(target), { recursive: true });
    let resolved: string;
    try {
      resolved = await realpath(source);
    } catch {
      problems.push({
        level: "error",
        file: task.path,
        message: "links whose target does not exist are not allowed",
      });
      failed.add(task.path);
      continue;
    }
    if (!isInsideAbsolute(await containmentRootAbsolute(target, destination), resolved)) {
      problems.push({
        level: "error",
        file: task.path,
        message: "links that point outside the extraction root are not allowed",
      });
      failed.add(task.path);
      continue;
    }
    try {
      await createHardLink(destination, task);
    } catch (error) {
      problems.push(linkProblem(task, error));
      failed.add(task.path);
    }
  }

  return { problems, failed };
}

async function verifyLinks(destination: string, tasks: LinkTask[]): Promise<Problem[]> {
  const problems: Problem[] = [];

  for (const task of tasks) {
    const target = linkPath(destination, task.path);
    let resolved: string;
    try {
      resolved = await realpath(target);
    } catch {
      problems.push({
        level: "error",
        file: task.path,
        message: "links whose target does not exist are not allowed",
      });
      continue;
    }
    if (!isInsideAbsolute(await containmentRootAbsolute(target, destination), resolved)) {
      problems.push({
        level: "error",
        file: task.path,
        message: "links that point outside the extraction root are not allowed",
      });
    }
  }

  return problems;
}

function tarballError(tarball: string, cause: unknown): MetafabError {
  const message = cause instanceof Error ? cause.message : String(cause);
  return new MetafabError(`Cannot extract ${tarball}: ${message}`, {
    exitCode: ExitCode.InvalidFab,
    code: "invalid-fab",
    cause,
  });
}

function unsafeArchive(message: string, cause?: unknown): MetafabError {
  return new MetafabError("The archive is not a safe fab", {
    exitCode: ExitCode.InvalidFab,
    code: "invalid-fab",
    problems: [{ level: "error", file: ".", message }],
    ...(cause === undefined ? {} : { cause }),
  });
}

export async function extractTarball(
  tarball: string,
  destination: string,
  options: ExtractTarballOptions = {},
): Promise<void> {
  const maxFileSize = options.maxFileSize ?? MAX_FAB_FILE_SIZE;
  const maxTotalSize = options.maxTotalSize ?? MAX_FAB_TOTAL_SIZE;
  const maxEntries = options.maxEntries ?? MAX_FAB_ENTRIES;
  const prefix = options.stripPrefix === undefined ? undefined : normalizePrefix(options.stripPrefix);
  let strip = (options.strip ?? 0) + (prefix === undefined ? 0 : prefix.split("/").filter((part) => part !== "").length);

  let entries: ArchiveEntry[];
  try {
    entries = await readEntries(tarball, { maxEntries, maxTotalSize });
    if (options.flattenSingleDirectory === true) {
      // `singleTopDirectory` strips the prefix itself, and `strip` already
      // counts the prefix segments, so only the caller's own count goes in.
      const top = await singleTopDirectory(entries, prefix, options.strip ?? 0);
      if (top !== undefined) strip += 1;
    }
  } catch (error) {
    if (error instanceof MetafabError) throw error;
    throw tarballError(tarball, error);
  }

  const relevant = entries.filter(
    (entry) => prefix === undefined || cleanEntryPath(entry.path).startsWith(prefix),
  );
  const linkDirectories = symlinkDirectories(relevant, strip);

  const collisions = pathCollisionProblems(relevant, strip, linkDirectories);
  if (collisions.length > 0) {
    throw new MetafabError("The archive is not a safe fab", {
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
      problems: collisions,
    });
  }

  try {
    await mkdir(destination, { recursive: true });
  } catch (error) {
    if (options.writeError !== undefined) throw options.writeError(destination, error);
    throw tarballError(tarball, error);
  }

  const problems: Problem[] = [];
  const links: LinkTask[] = [];
  const filter = (entryPath: string, entry: ReadEntry | Stats): boolean => {
    const rawEntry = entry as ReadEntry;
    const reason = unsafePathReason(entryPath);
    if (reason !== undefined) {
      problems.push({ level: "error", file: entryPath, message: reason });
      return false;
    }
    const collision = factoryCollisionReason(entryPath);
    if (collision !== undefined) {
      problems.push({ level: "error", file: entryPath, message: collision });
      return false;
    }

    const normalizedEntryPath = cleanEntryPath(entryPath);
    if (prefix !== undefined && !normalizedEntryPath.startsWith(prefix)) return false;

    const entryFinalPath = finalPath(normalizedEntryPath, strip);

    if (LINK_TYPES.has(rawEntry.type)) {
      const linkpath = rawEntry.linkpath === undefined || rawEntry.linkpath === null
        ? ""
        : String(rawEntry.linkpath);
      if (entryFinalPath === "" || entryFinalPath === "." || entryFinalPath.startsWith("../")) {
        problems.push({
          level: "error",
          file: entryPath,
          message: "links are not allowed at the extraction root",
        });
        return false;
      }
      if (writtenThroughLink(entryFinalPath, linkDirectories)) {
        problems.push({
          level: "error",
          file: entryPath,
          message: "entries written through a symbolic link are not allowed",
        });
        return false;
      }
      if (rawEntry.type === "SymbolicLink") {
        const target = symlinkTarget(entryFinalPath, linkpath);
        if (target === undefined) {
          problems.push({
            level: "error",
            file: entryPath,
            message: "links that point outside the extraction root are not allowed",
          });
          return false;
        }
        links.push({ kind: "symbolic", target: linkpath, path: entryFinalPath });
        return false;
      }
      const target = hardLinkTarget(entryFinalPath, linkpath, strip);
      if (target === undefined) {
        problems.push({
          level: "error",
          file: entryPath,
          message: "links that point outside the extraction root are not allowed",
        });
        return false;
      }
      links.push({ kind: "hard", target, path: entryFinalPath });
      return false;
    }

    const problem = entryProblem(rawEntry, maxFileSize);
    if (problem !== undefined) {
      problems.push({ level: "error", file: entryPath, message: problem });
      return false;
    }
    if (!isAllowedType(rawEntry)) {
      problems.push({
        level: "error",
        file: entryPath,
        message: `unsupported archive entry type "${rawEntry.type}"`,
      });
      return false;
    }
    if (writtenThroughLink(entryFinalPath, linkDirectories)) {
      problems.push({
        level: "error",
        file: entryPath,
        message: "entries written through a symbolic link are not allowed",
      });
      return false;
    }
    if (entryFinalPath === "" || entryFinalPath === ".") return false;

    rawEntry.path = entryFinalPath;
    return true;
  };

  let failure: unknown;
  const unpack = tar.x({ cwd: destination, filter, strict: true });
  const stream = createReadStream(tarball);
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        stream.destroy();
        reject(error);
      };
      unpack.on("end", () => {
        if (settled) return;
        settled = true;
        resolve();
      });
      unpack.on("error", fail);
      stream.on("error", fail);
      stream.pipe(unpack);
    });
  } catch (error) {
    failure = error;
  } finally {
    // A failed extraction aborts before the end of the archive. Tear both
    // streams down so nothing writes into a finished stream and no descriptor
    // or zlib handle outlives this call. `abort` is tar's own way to stop a
    // parser: it closes the decompressor it opened.
    stream.destroy();
    if (failure !== undefined) {
      unpack.abort(failure instanceof Error ? failure : new Error(String(failure)));
    }
  }

  if (problems.length > 0) {
    throw new MetafabError("The archive is not a safe fab", {
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
      problems,
      cause: failure,
    });
  }
  if (failure !== undefined) {
    if (options.writeError !== undefined && isCacheWriteFailure(failure)) {
      throw options.writeError(destination, failure);
    }
    throw tarballError(tarball, failure);
  }

  const created = await createLinks(destination, links);
  // A link whose creation already failed keeps its creation message: the
  // realpath check would only repeat it as "target does not exist".
  const stillValid = links.filter((task) => !created.failed.has(task.path));
  const verificationProblems = await verifyLinks(destination, stillValid);
  const allLinkProblems = [...created.problems, ...verificationProblems];
  if (allLinkProblems.length > 0) {
    throw new MetafabError("The archive is not a safe fab", {
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
      problems: allLinkProblems,
    });
  }
}
