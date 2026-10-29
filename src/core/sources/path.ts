import { lstat, mkdir, mkdtemp, readdir, readlink, realpath, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { copyFileWithMode } from "../../util/fs.js";
import { MAX_FAB_ENTRIES, MAX_FAB_FILE_SIZE, MAX_FAB_TOTAL_SIZE } from "./extract.js";
import { redact } from "./redact.js";
import type { FetchedFab, Resolved } from "./types.js";
import { validateFab } from "./validate.js";

export type ResolvedPath = Extract<Resolved, { kind: "path" }>;

export interface PathOptions {
  maxEntries?: number;
  maxTotalSize?: number;
}

interface LinkTask {
  path: string;
  target: string;
}

function fetchError(message: string, cause?: unknown): MetafabError {
  return new MetafabError(redact(message), {
    exitCode: ExitCode.FetchFailed,
    code: "fetch-failed",
    cause,
  });
}

function invalidFab(sourceLabel: string, problems: Problem[]): MetafabError {
  return new MetafabError(`Invalid fab from ${redact(sourceLabel)}`, {
    exitCode: ExitCode.InvalidFab,
    code: "invalid-fab",
    problems,
  });
}

function problemFile(sourceLabel: string, relativePath: string): string {
  return `${redact(sourceLabel).replace(/\/+$/, "")}/.factory/${relativePath}`;
}

export async function locateFactoryDir(specPath: string): Promise<string> {
  const candidate = path.basename(specPath) === ".factory" ? specPath : path.join(specPath, ".factory");

  let entry;
  try {
    entry = await lstat(candidate);
  } catch {
    throw fetchError(`Cannot read local fab "${specPath}": the .factory directory does not exist`);
  }

  if (entry.isSymbolicLink()) {
    throw invalidFab(specPath, [
      {
        level: "error",
        file: problemFile(specPath, ""),
        line: 1,
        message: "links are not allowed in a fab",
      },
    ]);
  }
  if (!entry.isDirectory()) {
    throw fetchError(`Cannot read local fab "${specPath}": ${candidate} is not a directory`);
  }

  return candidate;
}

function insideOrEqual(root: string, target: string): boolean {
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

async function createSymlink(
  factoryDir: string,
  link: LinkTask,
  type: "dir" | "file",
): Promise<void> {
  const destination = path.join(factoryDir, ...link.path.split("/"));
  await mkdir(path.dirname(destination), { recursive: true });
  await rm(destination, { recursive: true, force: true });
  await symlink(link.target, destination, type);
}

async function createLinks(
  factoryDir: string,
  sourceLabel: string,
  links: LinkTask[],
): Promise<Problem[]> {
  const problems: Problem[] = [];
  let pending = links;

  while (pending.length > 0) {
    const remaining: LinkTask[] = [];
    let progress = false;

    for (const link of pending) {
      const destination = path.join(factoryDir, ...link.path.split("/"));
      const absoluteTarget = path.resolve(path.dirname(destination), link.target);
      if (!(await targetExists(absoluteTarget))) {
        remaining.push(link);
        continue;
      }
      try {
        await createSymlink(factoryDir, link, await linkTargetType(absoluteTarget));
        progress = true;
      } catch (error) {
        problems.push({
          level: "error",
          file: problemFile(sourceLabel, link.path),
          line: 1,
          message: `links could not be created: ${error instanceof Error ? error.message : String(error)}`,
        });
        progress = true;
      }
    }

    if (!progress) {
      for (const link of remaining) {
        try {
          await createSymlink(factoryDir, link, "file");
        } catch (error) {
          problems.push({
            level: "error",
            file: problemFile(sourceLabel, link.path),
            line: 1,
            message: `links could not be created: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      break;
    }
    pending = remaining;
  }

  return problems;
}

async function verifyLinks(
  factoryDir: string,
  sourceLabel: string,
  links: LinkTask[],
): Promise<Problem[]> {
  const problems: Problem[] = [];
  const root = await realpath(factoryDir).catch(() => path.resolve(factoryDir));

  for (const link of links) {
    let resolved: string;
    try {
      resolved = await realpath(path.join(factoryDir, ...link.path.split("/")));
    } catch {
      problems.push({
        level: "error",
        file: problemFile(sourceLabel, link.path),
        line: 1,
        message: "links whose target does not exist are not allowed",
      });
      continue;
    }
    if (!insideOrEqual(root, resolved)) {
      problems.push({
        level: "error",
        file: problemFile(sourceLabel, link.path),
        line: 1,
        message: "links that point outside .factory are not allowed",
      });
    }
  }

  return problems;
}

async function copyFactory(
  sourceDir: string,
  destination: string,
  sourceLabel: string,
  options: PathOptions,
): Promise<void> {
  const maxEntries = options.maxEntries ?? MAX_FAB_ENTRIES;
  const maxTotalSize = options.maxTotalSize ?? MAX_FAB_TOTAL_SIZE;
  const problems: Problem[] = [];
  const links: LinkTask[] = [];
  const factoryDir = path.join(destination, ".factory");
  const factoryRoot = path.resolve(sourceDir);
  let files = 0;
  let totalSize = 0;
  let stopped = false;
  await mkdir(factoryDir, { recursive: true });

  async function walk(directory: string, prefix: string): Promise<void> {
    if (stopped) return;
    const entries = await readdir(directory);
    entries.sort();

    for (const name of entries) {
      if (stopped) return;
      const absolute = path.join(directory, name);
      const relativePath = prefix === "" ? name : `${prefix}/${name}`;
      const entry = await lstat(absolute);

      if (entry.isSymbolicLink()) {
        const target = await readlink(absolute);
        const resolved = path.resolve(path.dirname(absolute), target);
        if (path.isAbsolute(target) || !insideOrEqual(factoryRoot, resolved)) {
          problems.push({
            level: "error",
            file: problemFile(sourceLabel, relativePath),
            line: 1,
            message: "links that point outside .factory are not allowed",
          });
          continue;
        }
        links.push({ path: relativePath, target });
        continue;
      }

      if (entry.isDirectory()) {
        await mkdir(path.join(factoryDir, ...relativePath.split("/")), { recursive: true });
        await walk(absolute, relativePath);
        continue;
      }

      if (!entry.isFile()) {
        problems.push({
          level: "error",
          file: problemFile(sourceLabel, relativePath),
          line: 1,
          message: "device files and FIFOs are not allowed in a fab",
        });
        continue;
      }

      if (entry.size > MAX_FAB_FILE_SIZE) {
        problems.push({
          level: "error",
          file: problemFile(sourceLabel, relativePath),
          line: 1,
          message: `files larger than ${MAX_FAB_FILE_SIZE} bytes are not allowed in a fab`,
        });
        continue;
      }

      files += 1;
      if (files > maxEntries) {
        problems.push({
          level: "error",
          file: problemFile(sourceLabel, relativePath),
          line: 1,
          message: `fabs with more than ${maxEntries} files are not allowed`,
        });
        stopped = true;
        return;
      }
      totalSize += entry.size;
      if (totalSize > maxTotalSize) {
        problems.push({
          level: "error",
          file: problemFile(sourceLabel, relativePath),
          line: 1,
          message: `files larger than ${maxTotalSize} bytes in total are not allowed in a fab`,
        });
        stopped = true;
        return;
      }

      await copyFileWithMode(absolute, path.join(factoryDir, ...relativePath.split("/")));
    }
  }

  await walk(sourceDir, "");

  if (problems.length === 0) {
    problems.push(...(await createLinks(factoryDir, sourceLabel, links)));
    problems.push(...(await verifyLinks(factoryDir, sourceLabel, links)));
  }

  if (problems.length > 0) throw invalidFab(sourceLabel, problems);
}

export async function fetchPath(
  source: ResolvedPath,
  options: PathOptions = {},
): Promise<FetchedFab> {
  const sourceLabel = source.spec.source;
  const factoryDir = await locateFactoryDir(source.spec.path);
  const destination = await mkdtemp(path.join(tmpdir(), "metafab-path-"));

  try {
    await copyFactory(factoryDir, destination, sourceLabel, options);
    await validateFab(destination, { sourceLabel });
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }

  return {
    factoryDir: path.join(destination, ".factory"),
    upstream: { kind: "unversioned", source: sourceLabel },
    versioned: false,
  };
}
