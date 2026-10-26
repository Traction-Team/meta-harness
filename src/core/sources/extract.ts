import { link, mkdir, realpath, rm, stat, symlink } from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";
import * as tar from "tar";
import type { ReadEntry } from "tar";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";

export const MAX_FAB_FILE_SIZE = 1024 * 1024;
export const MAX_FAB_TOTAL_SIZE = 64 * 1024 * 1024;
export const MAX_FAB_ENTRIES = 10_000;

export interface ExtractTarballOptions {
  strip?: number;
  stripPrefix?: string;
  flattenSingleDirectory?: boolean;
  maxFileSize?: number;
  maxTotalSize?: number;
  maxEntries?: number;
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

async function readEntries(tarball: string): Promise<ArchiveEntry[]> {
  const entries: ArchiveEntry[] = [];
  await tar.t({
    file: tarball,
    onentry: (entry) => {
      entries.push({
        path: entry.path,
        type: entry.type,
        ...(entry.linkpath === undefined || entry.linkpath === null
          ? {}
          : { linkpath: String(entry.linkpath) }),
        size: entry.size,
      });
    },
  });
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

async function containmentRootAbsolute(finalPath: string, destination: string): Promise<string> {
  const root = containmentRoot(finalPath);
  const absolute = root === "" ? path.resolve(destination) : path.join(path.resolve(destination), root);
  return realpath(absolute).catch(() => absolute);
}

function isInsideAbsolute(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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
  await rm(target, { recursive: true, force: true });
  await symlink(task.target, target, type);
}

async function createHardLink(destination: string, task: LinkTask): Promise<void> {
  const target = linkPath(destination, task.path);
  await mkdir(path.dirname(target), { recursive: true });
  await rm(target, { recursive: true, force: true });
  await link(linkPath(destination, task.target), target);
}

async function createLinks(destination: string, tasks: LinkTask[]): Promise<Problem[]> {
  const problems: Problem[] = [];
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
        progress = true;
      }
    }

    if (!progress) {
      for (const task of remaining) {
        try {
          await createSymbolicLink(destination, task, "file");
        } catch (error) {
          problems.push(linkProblem(task, error));
        }
      }
      break;
    }
    pending = remaining;
  }

  for (const task of hard) {
    const source = linkPath(destination, task.target);
    let resolved: string;
    try {
      resolved = await realpath(source);
    } catch {
      problems.push({
        level: "error",
        file: task.path,
        message: "links whose target does not exist are not allowed",
      });
      continue;
    }
    if (!isInsideAbsolute(await containmentRootAbsolute(task.path, destination), resolved)) {
      problems.push({
        level: "error",
        file: task.path,
        message: "links that point outside the extraction root are not allowed",
      });
      continue;
    }
    try {
      await createHardLink(destination, task);
    } catch (error) {
      problems.push(linkProblem(task, error));
    }
  }

  return problems;
}

async function verifyLinks(destination: string, tasks: LinkTask[]): Promise<Problem[]> {
  const problems: Problem[] = [];

  for (const task of tasks) {
    let resolved: string;
    try {
      resolved = await realpath(linkPath(destination, task.path));
    } catch {
      problems.push({
        level: "error",
        file: task.path,
        message: "links whose target does not exist are not allowed",
      });
      continue;
    }
    if (!isInsideAbsolute(await containmentRootAbsolute(task.path, destination), resolved)) {
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
    entries = await readEntries(tarball);
    if (entries.length > maxEntries) {
      throw unsafeArchive(`archives with more than ${maxEntries} entries are not allowed in a fab`);
    }
    if (options.flattenSingleDirectory === true) {
      const top = await singleTopDirectory(entries, prefix, strip);
      if (top !== undefined) strip += 1;
    }
  } catch (error) {
    if (error instanceof MetafabError) throw error;
    throw tarballError(tarball, error);
  }

  const relevant = entries.filter(
    (entry) => prefix === undefined || cleanEntryPath(entry.path).startsWith(prefix),
  );
  const declaredBytes = relevant.reduce(
    (total, entry) => (FILE_TYPES.has(entry.type) ? total + entry.size : total),
    0,
  );
  if (declaredBytes > maxTotalSize) {
    throw unsafeArchive(`extracted files larger than ${maxTotalSize} bytes in total are not allowed in a fab`);
  }
  const linkDirectories = symlinkDirectories(relevant, strip);

  await mkdir(destination, { recursive: true });

  const problems: Problem[] = [];
  const links: LinkTask[] = [];
  const filter = (entryPath: string, entry: ReadEntry | Stats): boolean => {
    const rawEntry = entry as ReadEntry;
    const reason = unsafePathReason(entryPath);
    if (reason !== undefined) {
      problems.push({ level: "error", file: entryPath, message: reason });
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
  try {
    await tar.x({ file: tarball, cwd: destination, filter, strict: true });
  } catch (error) {
    failure = error;
  }

  if (problems.length > 0) {
    throw new MetafabError("The archive is not a safe fab", {
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
      problems,
      cause: failure,
    });
  }
  if (failure !== undefined) throw tarballError(tarball, failure);

  const linkProblems = await createLinks(destination, links);
  const verificationProblems = await verifyLinks(destination, links);
  const allLinkProblems = [...linkProblems, ...verificationProblems];
  if (allLinkProblems.length > 0) {
    throw new MetafabError("The archive is not a safe fab", {
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
      problems: allLinkProblems,
    });
  }
}
