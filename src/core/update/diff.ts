import path from "node:path";
import { createTwoFilesPatch } from "diff";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { loadConfig } from "../config/load.js";
import { CONFIG_FILE } from "../config/parse.js";
import type { Config, UpstreamEntry } from "../config/types.js";
import type { FileEntry, FileTree } from "../import/file-tree.js";
import type { FetchedFab, SourceOptions } from "../sources/index.js";
import { fetchRecordedBase } from "./fetch.js";
import { factoryTree, localFactoryTree, sameEntry } from "./trees.js";

/** How a factory path differs from the recorded upstream. */
export type DiffStatus = "added" | "modified" | "removed";

export interface DiffFile {
  /** Factory-relative POSIX path. */
  path: string;
  status: DiffStatus;
  /** A unified diff for text content; absent for binary content and mode-only changes. */
  patch?: string;
  /** True when either side is binary. Not part of the JSON result. */
  binary?: boolean;
}

export interface DiffOptions {
  /** Repository root that contains `.factory/`. */
  root: string;
  /** Directory a recorded relative source resolves against; the process cwd by default. */
  cwd?: string;
  /** Limit the comparison to this file or directory, relative to the repository or `.factory/`. */
  path?: string;
  /** Let Git prompt for credentials; the command enables it for a TTY. */
  interactive?: boolean;
  /** Injected source settings, used by tests for a local registry or transport. */
  sourceOptions?: SourceOptions;
}

export interface DiffReport {
  root: string;
  upstream: UpstreamEntry;
  versioned: boolean;
  /** The normalised factory-relative prefix, when the caller limited the comparison. */
  prefix?: string;
  files: DiffFile[];
}

function noUpstream(): MetafabError {
  return new MetafabError("This factory has no upstream to compare", {
    exitCode: ExitCode.Failed,
    code: "no-upstream",
    problems: [
      {
        level: "error",
        file: CONFIG_FILE,
        message: "This factory has no upstream to compare",
        fix: "Run metafab import <source>",
      },
    ],
  });
}

function configInvalid(problems: Problem[]): MetafabError {
  return new MetafabError("The factory configuration has problems.", {
    exitCode: ExitCode.Failed,
    code: "config-invalid",
    problems,
  });
}

/**
 * Turns the command's path argument into a factory-relative prefix.
 *
 * A caller may write `skills/guide`, `.factory/skills/guide`, or an absolute
 * path inside `.factory/`; all three name the same files. An empty value, or
 * the factory root itself, means no limit.
 */
export function normalizePrefix(root: string, given: string | undefined): string | undefined {
  if (given === undefined) return undefined;

  let value = given.trim().replace(/\\/g, "/");
  if (value === "") return undefined;

  const factoryDir = path.join(path.resolve(root), ".factory");
  if (path.isAbsolute(value)) {
    value = path.relative(factoryDir, value).replace(/\\/g, "/");
  }

  value = value.replace(/^\.\//, "");
  if (value === ".factory") return undefined;
  if (value.startsWith(".factory/")) value = value.slice(".factory/".length);

  value = value.replace(/\/+$/, "");
  if (value === "" || value === ".") return undefined;
  return value;
}

function isUnder(relativePath: string, prefix: string | undefined): boolean {
  if (prefix === undefined) return true;
  return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
}

/** The text a text file or a symbolic link contributes to a patch. */
function textOf(entry: FileEntry): string {
  if (entry.link !== undefined) return entry.link;
  return entry.text ?? "";
}

function isBinaryEntry(entry: FileEntry | undefined): boolean {
  return entry?.binary === true;
}

function statusOf(upstream: FileEntry | undefined, local: FileEntry | undefined): DiffStatus {
  if (upstream === undefined) return "added";
  if (local === undefined) return "removed";
  return "modified";
}

/**
 * Compares the factory with the recorded upstream (or the current source for an
 * unversioned upstream). Content is compared as a snapshot does: text with LF
 * line endings, links by target, and the permission bits as part of the entry.
 */
export async function runDiff(options: DiffOptions): Promise<DiffReport> {
  const root = path.resolve(options.root);
  const factoryDir = path.join(root, ".factory");
  const config: Config = await loadConfig(factoryDir);

  const configErrors = config.problems.filter((problem) => problem.level === "error");
  if (configErrors.length > 0) throw configInvalid(configErrors);

  const upstream = config.upstream;
  if (upstream === undefined) throw noUpstream();

  const cwd = options.cwd ?? process.cwd();
  const prefix = normalizePrefix(root, options.path);
  const sourceOptions: SourceOptions = {
    ...options.sourceOptions,
    ...(options.interactive === true ? { interactive: true } : {}),
  };

  let base: FetchedFab | undefined;
  try {
    base = await fetchRecordedBase(upstream, { ...sourceOptions, cwd });
    const upstreamTree: FileTree = await factoryTree(base.factoryDir);
    const localTree = await localFactoryTree(root);

    const paths = [...new Set([...Object.keys(upstreamTree), ...Object.keys(localTree)])]
      .filter((relativePath) => isUnder(relativePath, prefix))
      .sort();

    const files: DiffFile[] = [];
    for (const relativePath of paths) {
      const theirs = upstreamTree[relativePath];
      const yours = localTree[relativePath];
      if (sameEntry(theirs, yours)) continue;

      const file: DiffFile = {
        path: relativePath,
        status: statusOf(theirs, yours),
      };

      if (isBinaryEntry(theirs) || isBinaryEntry(yours)) {
        file.binary = true;
        files.push(file);
        continue;
      }

      const before = theirs === undefined ? "" : textOf(theirs);
      const after = yours === undefined ? "" : textOf(yours);
      if (before !== after) {
        file.patch = createTwoFilesPatch(
          `a/upstream/${relativePath}`,
          `b/local/${relativePath}`,
          before,
          after,
        );
      }
      files.push(file);
    }

    return {
      root,
      upstream,
      versioned: upstream.kind !== "unversioned",
      ...(prefix === undefined ? {} : { prefix }),
      files,
    };
  } finally {
    await base?.cleanup?.();
  }
}

function binaryLine(relativePath: string): string {
  return `Binary files a/upstream/${relativePath} and b/local/${relativePath} differ`;
}

function describeFile(file: DiffFile): string {
  if (file.patch !== undefined) return file.patch.trimEnd();
  if (file.binary === true) return binaryLine(file.path);
  return `File mode of ${file.path} changed.`;
}

/**
 * Human-readable report for `diff`.
 *
 * With nothing to show the summary is a blank line: an empty summary would be
 * replaced by the generic `diff: ok` status line, and `diff` prints no diff
 * when the factory matches its upstream.
 */
export function describeDiff(report: DiffReport): string {
  if (report.files.length === 0) return "\n";
  return report.files.map(describeFile).join("\n");
}

/** The JSON shape of one compared file: `{ path, status, patch? }`. */
export function jsonFile(file: DiffFile): { path: string; status: DiffStatus; patch?: string } {
  return {
    path: file.path,
    status: file.status,
    ...(file.patch === undefined ? {} : { patch: file.patch }),
  };
}
