import { mkdir } from "node:fs/promises";
import type { Stats } from "node:fs";
import * as tar from "tar";
import type { ReadEntry } from "tar";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";

export const MAX_FAB_FILE_SIZE = 1024 * 1024;

export interface ExtractTarballOptions {
  strip?: number;
  stripPrefix?: string;
  flattenSingleDirectory?: boolean;
  maxFileSize?: number;
}

const FILE_TYPES = new Set(["File", "OldFile", "ContiguousFile"]);
const DIRECTORY_TYPES = new Set(["Directory"]);
const METADATA_TYPES = new Set(["ExtendedHeader", "GlobalExtendedHeader"]);

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
  if (entry.type === "SymbolicLink" || entry.type === "Link") {
    return "links are not allowed in a fab";
  }
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

function stripSegments(entryPath: string, count: number): string {
  const parts = entryPath.split("/").filter((part) => part !== "");
  return parts.slice(count).join("/");
}

async function listEntryPaths(tarball: string): Promise<string[]> {
  const paths: string[] = [];
  await tar.t({ file: tarball, onentry: (entry) => paths.push(entry.path) });
  return paths;
}

async function singleTopDirectory(tarball: string, prefix: string | undefined, strip: number): Promise<string | undefined> {
  const paths = await listEntryPaths(tarball);
  const relative = paths
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

function tarballError(tarball: string, cause: unknown): MetafabError {
  const message = cause instanceof Error ? cause.message : String(cause);
  return new MetafabError(`Cannot extract ${tarball}: ${message}`, {
    exitCode: ExitCode.InvalidFab,
    code: "invalid-fab",
    cause,
  });
}

export async function extractTarball(
  tarball: string,
  destination: string,
  options: ExtractTarballOptions = {},
): Promise<void> {
  const maxFileSize = options.maxFileSize ?? MAX_FAB_FILE_SIZE;
  const prefix = options.stripPrefix === undefined ? undefined : normalizePrefix(options.stripPrefix);
  let strip = (options.strip ?? 0) + (prefix === undefined ? 0 : prefix.split("/").filter((part) => part !== "").length);

  if (options.flattenSingleDirectory === true) {
    try {
      if ((await singleTopDirectory(tarball, prefix, strip)) !== undefined) strip += 1;
    } catch (error) {
      throw tarballError(tarball, error);
    }
  }

  await mkdir(destination, { recursive: true });

  const problems: Problem[] = [];
  const filter = (entryPath: string, entry: ReadEntry | Stats): boolean => {
    const rawEntry = entry as ReadEntry;
    const reason = unsafePathReason(entryPath) ?? entryProblem(rawEntry, maxFileSize);
    if (reason !== undefined) {
      problems.push({ level: "error", file: entryPath, message: reason });
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
    if (prefix !== undefined && !entryPath.startsWith(prefix)) return false;
    return true;
  };

  let failure: unknown;
  try {
    await tar.x({ file: tarball, cwd: destination, strip, filter, strict: true });
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
}
