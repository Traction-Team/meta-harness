import { lstat, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { copyFileWithMode } from "../../util/fs.js";
import { MAX_FAB_FILE_SIZE } from "./extract.js";
import type { FetchedFab, Resolved } from "./types.js";
import { validateFab } from "./validate.js";

export type ResolvedPath = Extract<Resolved, { kind: "path" }>;

function fetchError(message: string, cause?: unknown): MetafabError {
  return new MetafabError(message, {
    exitCode: ExitCode.FetchFailed,
    code: "fetch-failed",
    cause,
  });
}

function invalidFab(sourceLabel: string, problems: Problem[]): MetafabError {
  return new MetafabError(`Invalid fab from ${sourceLabel}`, {
    exitCode: ExitCode.InvalidFab,
    code: "invalid-fab",
    problems,
  });
}

function problemFile(sourceLabel: string, relativePath: string): string {
  return `${sourceLabel.replace(/\/+$/, "")}/.factory/${relativePath}`;
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

async function copyFactory(sourceDir: string, destination: string, sourceLabel: string): Promise<void> {
  const problems: Problem[] = [];
  const factoryDir = path.join(destination, ".factory");
  await mkdir(factoryDir, { recursive: true });

  async function walk(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory);
    entries.sort();

    for (const name of entries) {
      const absolute = path.join(directory, name);
      const relativePath = prefix === "" ? name : `${prefix}/${name}`;
      const entry = await lstat(absolute);

      if (entry.isSymbolicLink()) {
        problems.push({
          level: "error",
          file: problemFile(sourceLabel, relativePath),
          line: 1,
          message: "links are not allowed in a fab",
        });
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

      await copyFileWithMode(absolute, path.join(factoryDir, ...relativePath.split("/")));
    }
  }

  await walk(sourceDir, "");

  if (problems.length > 0) throw invalidFab(sourceLabel, problems);
}

export async function fetchPath(
  source: ResolvedPath,
  _options: object = {},
): Promise<FetchedFab> {
  const sourceLabel = source.spec.path;
  const factoryDir = await locateFactoryDir(sourceLabel);
  const destination = await mkdtemp(path.join(tmpdir(), "metafab-path-"));

  try {
    await copyFactory(factoryDir, destination, sourceLabel);
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
