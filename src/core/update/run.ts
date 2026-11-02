import { chmod, lstat, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { applyBuild, planBuild } from "../build/index.js";
import type { BuildChange } from "../build/index.js";
import { scanConflictMarkers, scanUpstreamFiles } from "../check/index.js";
import { loadConfig } from "../config/load.js";
import { CONFIG_FILE } from "../config/parse.js";
import type { Config, UpstreamEntry } from "../config/types.js";
import { setUpstream } from "../config/writers.js";
import { loadFactory } from "../factory/load.js";
import { emptyTree } from "../import/file-tree.js";
import type { FileEntry, FileTree } from "../import/file-tree.js";
import { copyFactoryTree } from "../import/copy.js";
import { mergePath } from "../merge.js";
import type { MergeLabels } from "../merge.js";
import { fetchFab, resolve } from "../sources/index.js";
import type { FetchedFab, SourceOptions } from "../sources/index.js";
import { parseSource } from "../sources/parse.js";
import type { Resolved } from "../sources/types.js";
import { renderSummary, summarise } from "../summary.js";
import type { Summary } from "../summary.js";
import { fetchRecordedBase } from "./fetch.js";
import {
  recordedLabel,
  sameVersion,
  selectVersion,
  versionLabel,
} from "./select.js";
import type { VersionedUpstream } from "./select.js";
import {
  entryContent,
  entryFromContent,
  factoryPath,
  factoryTree,
  localFactoryTree,
  mergeInputOf,
  sameEntry,
} from "./trees.js";

export interface UpdateOptions {
  /** Repository root that contains `.factory/`. */
  root: string;
  /** Directory a recorded relative source resolves against; the process cwd by default. */
  cwd?: string;
  /** `--to`: a version, range, or Git ref. */
  to?: string;
  dryRun?: boolean;
  noBuild?: boolean;
  /** Let Git prompt for credentials; the command enables it for a TTY. */
  interactive?: boolean;
  /** Injected source settings, used by tests for a local registry or transport. */
  sourceOptions?: SourceOptions;
}

export type UpdateStatus = "updated" | "up-to-date" | "pinned";

export interface UpdateReport {
  root: string;
  status: UpdateStatus;
  /** The line to print for `up-to-date` and `pinned`; absent for an update. */
  message?: string;
  versioned: boolean;
  previous: UpstreamEntry;
  /** The upstream entry now recorded, or the unchanged one. */
  upstream: UpstreamEntry;
  from?: string;
  to?: string;
  /** Files the unversioned flow replaces. */
  replaced: string[];
  /** Local edits the merge kept. */
  preserved: string[];
  /** Paths left with conflict markers or a `.upstream` side file. */
  conflicts: string[];
  sideFiles: string[];
  added: string[];
  updated: string[];
  removed: string[];
  /** Human notes for the review summary. */
  notes: string[];
  problems: Problem[];
  built: boolean;
  changed: BuildChange[];
  review?: Summary;
}

type PlannedWrite =
  | { kind: "write"; path: string; entry: FileEntry }
  | { kind: "remove"; path: string }
  | { kind: "side-file"; path: string; content: Buffer; mode: number };

interface MergePlan {
  after: FileTree;
  writes: PlannedWrite[];
  preserved: string[];
  conflicts: string[];
  sideFiles: string[];
  added: string[];
  updated: string[];
  removed: string[];
  notes: string[];
}

function cliVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require("../../../package.json") as { version?: unknown };
  return typeof pkg.version === "string" ? pkg.version : "0.0.0";
}

function noUpstream(): MetafabError {
  return new MetafabError("This factory has no upstream", {
    exitCode: ExitCode.Failed,
    code: "no-upstream",
    problems: [
      {
        level: "error",
        file: CONFIG_FILE,
        message: "This factory has no upstream to update",
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

function toWithUnversionedSource(to: string): MetafabError {
  return new MetafabError("--to is not accepted for an unversioned source", {
    exitCode: ExitCode.Failed,
    code: "to-unversioned",
    problems: [
      {
        level: "error",
        file: CONFIG_FILE,
        message: `--to ${to} cannot select a version from an unversioned upstream`,
        fix: "Run metafab update without --to",
      },
    ],
  });
}

function unresolvedConflicts(problems: Problem[]): MetafabError {
  return new MetafabError("Update stopped: resolve the conflicts from an earlier update first.", {
    exitCode: ExitCode.Failed,
    code: "update-unresolved",
    problems,
  });
}

function buildConflict(result: Awaited<ReturnType<typeof planBuild>>, warnings: Problem[]): MetafabError {
  return new MetafabError(
    "Build stopped because the repository contains output that Metafab does not own.",
    {
      exitCode: ExitCode.NotOwned,
      code: "build-conflict",
      problems: [...result.conflicts, ...result.errors, ...warnings, ...result.warnings],
    },
  );
}

function buildFailed(result: Awaited<ReturnType<typeof planBuild>>, warnings: Problem[]): MetafabError {
  return new MetafabError("Build failed after update.", {
    exitCode: ExitCode.Failed,
    code: "build-failed",
    problems: [...result.errors, ...warnings, ...result.warnings],
  });
}

/** Refuses an update while a marker or `.upstream` file from the last one remains. */
async function assertResolved(root: string): Promise<void> {
  const problems = [
    ...(await scanConflictMarkers(root)),
    ...(await scanUpstreamFiles(root)),
  ];
  if (problems.length > 0) throw unresolvedConflicts(problems);
}

/** Builds the factory and returns what changed, or throws with the problems. */
async function buildFactory(
  root: string,
  factoryDir: string,
): Promise<{ changed: BuildChange[]; problems: Problem[] }> {
  const factory = await loadFactory(root);
  const config = await loadConfig(factoryDir);
  const warnings = [...factory.problems, ...config.problems].filter(
    (problem) => problem.level === "warning",
  );
  const plan = await planBuild(factory, config, cliVersion());

  if (plan.conflicts.length > 0) throw buildConflict(plan, warnings);
  if (plan.errors.length > 0) throw buildFailed(plan, warnings);

  const report = await applyBuild(plan);
  return { changed: report.changed, problems: [...warnings, ...plan.warnings] };
}

async function lstatIfExists(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeEntry(target: string, entry: FileEntry): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const existing = await lstatIfExists(target);
  if (existing !== undefined) await rm(target, { recursive: true, force: true });

  if (entry.link !== undefined) {
    await symlink(entry.link, target);
    return;
  }

  await writeFile(target, entryContent(entry), { mode: entry.mode });
  await chmod(target, entry.mode);
}

async function applyWrites(factoryDir: string, writes: readonly PlannedWrite[]): Promise<void> {
  for (const write of writes) {
    const target = factoryPath(factoryDir, write.path);
    if (write.kind === "remove") {
      await rm(target, { recursive: true, force: true });
    } else if (write.kind === "side-file") {
      await writeEntry(`${target}.upstream`, entryFromContent(write.content, write.mode));
    } else {
      await writeEntry(target, write.entry);
    }
  }
}

function conflictNote(path: string): string {
  return `Binary conflict in ${path}: upstream was written to ${path}.upstream.`;
}

/**
 * Applies the merge table to every path in base, yours, or theirs.
 *
 * The returned `after` tree is the planned state of `.factory/`: it is used for
 * the review summary whether or not the planner writes the files, so a dry run
 * reports the same plan.
 */
export function planMerge(
  base: FileTree,
  yours: FileTree,
  theirs: FileTree,
  labels: MergeLabels,
  options: { baseUnavailable?: boolean } = {},
): MergePlan {
  const baseUnavailable = options.baseUnavailable === true;
  const after: Record<string, FileEntry> = { ...yours };
  const writes: PlannedWrite[] = [];
  const preserved: string[] = [];
  const conflicts: string[] = [];
  const sideFiles: string[] = [];
  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];
  const notes: string[] = [];

  const paths = [...new Set([...Object.keys(base), ...Object.keys(yours), ...Object.keys(theirs)])]
    .sort();

  for (const relativePath of paths) {
    const baseEntry = baseUnavailable ? undefined : base[relativePath];
    const yoursEntry = yours[relativePath];
    const theirsEntry = theirs[relativePath];
    const result = mergePath(
      mergeInputOf(baseEntry),
      mergeInputOf(yoursEntry),
      mergeInputOf(theirsEntry),
      labels,
      { baseUnavailable },
    );

    switch (result.action) {
      case "keep": {
        if (result.note === "upstream-removed") {
          preserved.push(relativePath);
          notes.push(`Upstream removed ${relativePath}; your local version was kept.`);
        } else if (
          !baseUnavailable &&
          yoursEntry !== undefined &&
          !sameEntry(baseEntry, yoursEntry)
        ) {
          preserved.push(relativePath);
        }
        break;
      }
      case "remove": {
        if (yoursEntry !== undefined) {
          delete after[relativePath];
          removed.push(relativePath);
          writes.push({ kind: "remove", path: relativePath });
        }
        if (result.note === "upstream-changed-removed") {
          notes.push(`Upstream changed ${relativePath}, which you removed; it stays removed.`);
        }
        break;
      }
      case "add": {
        if (theirsEntry !== undefined) {
          after[relativePath] = theirsEntry;
          added.push(relativePath);
          writes.push({ kind: "write", path: relativePath, entry: theirsEntry });
        }
        break;
      }
      case "take-theirs": {
        if (theirsEntry !== undefined) {
          after[relativePath] = theirsEntry;
          updated.push(relativePath);
          writes.push({ kind: "write", path: relativePath, entry: theirsEntry });
        }
        break;
      }
      case "write":
      case "conflict": {
        const entry = entryFromContent(result.content, result.mode);
        after[relativePath] = entry;
        writes.push({ kind: "write", path: relativePath, entry });
        if (result.action === "conflict") {
          conflicts.push(relativePath);
        } else {
          updated.push(relativePath);
        }
        break;
      }
      case "side-file": {
        sideFiles.push(relativePath);
        conflicts.push(relativePath);
        notes.push(conflictNote(relativePath));
        writes.push({
          kind: "side-file",
          path: relativePath,
          content: result.upstream,
          mode: result.upstreamMode,
        });
        break;
      }
    }
  }

  return {
    after,
    writes,
    preserved: [...new Set(preserved)].sort(),
    conflicts: [...new Set(conflicts)].sort(),
    sideFiles: sideFiles.sort(),
    added: added.sort(),
    updated: updated.sort(),
    removed: removed.sort(),
    notes,
  };
}

function baseReport(
  root: string,
  previous: UpstreamEntry,
  versioned: boolean,
): Pick<
  UpdateReport,
  | "root"
  | "status"
  | "versioned"
  | "previous"
  | "upstream"
  | "replaced"
  | "preserved"
  | "conflicts"
  | "sideFiles"
  | "added"
  | "updated"
  | "removed"
  | "notes"
  | "problems"
  | "built"
  | "changed"
> {
  return {
    root,
    status: "updated",
    versioned,
    previous,
    upstream: previous,
    replaced: [],
    preserved: [],
    conflicts: [],
    sideFiles: [],
    added: [],
    updated: [],
    removed: [],
    notes: [],
    problems: [],
    built: false,
    changed: [],
  };
}

function deprecationWarning(upstream: VersionedUpstream, message: string): Problem {
  const version = upstream.kind === "npm" ? upstream.version : recordedLabel(upstream);
  return {
    level: "warning",
    file: CONFIG_FILE,
    message: `${version} is deprecated: ${message}`,
    fix: "Use metafab update --to to select another version",
  };
}

function sourceOptionsOf(options: UpdateOptions): SourceOptions {
  return {
    ...options.sourceOptions,
    ...(options.interactive === true ? { interactive: true } : {}),
  };
}

function titleFor(upstream: VersionedUpstream, selected: VersionedUpstream): string {
  return `${upstream.source} ${recordedLabel(upstream)} -> ${recordedLabel(selected)}`;
}

async function runVersioned(
  root: string,
  factoryDir: string,
  previous: VersionedUpstream,
  options: UpdateOptions,
  sourceOptions: SourceOptions,
): Promise<UpdateReport> {
  const cwd = options.cwd ?? process.cwd();
  const report = baseReport(root, previous, true);

  const outcome = await selectVersion(previous, {
    ...sourceOptions,
    cwd,
    ...(options.to === undefined ? {} : { to: options.to }),
  });
  if (outcome.kind === "pinned") {
    return { ...report, status: "pinned", message: `Pinned to ${outcome.ref}. Use --to.` };
  }

  const selected = outcome.resolved;
  if (sameVersion(previous, selected)) {
    return { ...report, status: "up-to-date", message: "Already up to date." };
  }

  let theirs: FetchedFab | undefined;
  let base: FetchedFab | undefined;
  try {
    theirs = await fetchFab(selected, sourceOptions);
    const selectedEntry = theirs.upstream as VersionedUpstream;

    let baseUnavailable = false;
    try {
      base = await fetchRecordedBase(previous, { ...sourceOptions, cwd });
    } catch (error) {
      if (!(error instanceof MetafabError)) throw error;
      baseUnavailable = true;
    }

    const baseTree = base === undefined ? emptyTree() : await factoryTree(base.factoryDir);
    const theirsTree = await factoryTree(theirs.factoryDir);
    const before = await localFactoryTree(root);
    const plan = planMerge(
      baseTree,
      before,
      theirsTree,
      { base: recordedLabel(previous), upstream: recordedLabel(selectedEntry) },
      { baseUnavailable },
    );

    const notes = [...plan.notes];
    const problems: Problem[] = [];
    if (baseUnavailable) {
      const label = recordedLabel(previous);
      notes.push(
        `Upstream base ${label} could not be fetched; every difference is a conflict.`,
      );
    }
    if (theirs.deprecated !== undefined) {
      problems.push(deprecationWarning(selectedEntry, theirs.deprecated));
      notes.push(`npm version ${versionLabel(selected)} is deprecated: ${theirs.deprecated}`);
    }

    const built = !options.dryRun && options.noBuild !== true && plan.conflicts.length === 0;
    let changed: BuildChange[] = [];

    if (options.dryRun === true) {
      notes.push("Dry run: nothing was written.");
    } else {
      await applyWrites(factoryDir, plan.writes);
      // The selected upstream becomes the base of the next update, even when
      // conflict markers were written: resolving them is local work against
      // this version.
      await setUpstream(factoryDir, theirs.upstream);
      if (built) {
        const build = await buildFactory(root, factoryDir);
        changed = build.changed;
        problems.push(...build.problems);
      }
    }

    const review = summarise(before, plan.after, {
      title: titleFor(previous, selectedEntry),
      ...(plan.preserved.length === 0 ? {} : { preserved: plan.preserved }),
      ...(plan.conflicts.length === 0 ? {} : { conflicts: plan.conflicts }),
      ...(notes.length === 0 ? {} : { notes }),
    });

    return {
      ...report,
      status: "updated",
      upstream: theirs.upstream,
      from: recordedLabel(previous),
      to: recordedLabel(selectedEntry),
      preserved: plan.preserved,
      conflicts: plan.conflicts,
      sideFiles: plan.sideFiles,
      added: plan.added,
      updated: plan.updated,
      removed: plan.removed,
      notes,
      problems,
      built,
      changed,
      review,
    };
  } finally {
    await theirs?.cleanup?.();
    await base?.cleanup?.();
  }
}

async function runUnversioned(
  root: string,
  factoryDir: string,
  previous: Extract<UpstreamEntry, { kind: "unversioned" }>,
  options: UpdateOptions,
  sourceOptions: SourceOptions,
): Promise<UpdateReport> {
  const cwd = options.cwd ?? process.cwd();
  const report = baseReport(root, previous, false);

  const spec = parseSource(previous.source, { cwd });
  const resolved: Resolved = await resolve(spec, sourceOptions);

  let fetched: FetchedFab | undefined;
  try {
    fetched = await fetchFab(resolved, sourceOptions);

    const before = await localFactoryTree(root);
    const theirs = await factoryTree(fetched.factoryDir);
    const replaced = Object.keys(theirs)
      .filter((relativePath) => !sameEntry(before[relativePath], theirs[relativePath]))
      .sort();
    const added = replaced.filter((relativePath) => before[relativePath] === undefined);
    const updated = replaced.filter((relativePath) => before[relativePath] !== undefined);

    const notes = ["Replaced local edits can be restored from Git."];
    let changed: BuildChange[] = [];
    const problems: Problem[] = [];
    const built = options.dryRun !== true && options.noBuild !== true;

    if (options.dryRun === true) {
      notes.push("Dry run: nothing was written.");
    } else {
      await copyFactoryTree(fetched.factoryDir, factoryDir);
      if (built) {
        const build = await buildFactory(root, factoryDir);
        changed = build.changed;
        problems.push(...build.problems);
      }
    }

    const after = options.dryRun === true ? { ...before, ...theirs } : await localFactoryTree(root);
    const review = summarise(before, after, {
      title: `${previous.source} (unversioned)`,
      notes,
    });

    return {
      ...report,
      upstream: fetched.upstream,
      replaced,
      added,
      updated,
      notes,
      problems,
      built,
      changed,
      review,
    };
  } finally {
    await fetched?.cleanup?.();
  }
}

/**
 * Runs `metafab update`.
 *
 * A versioned upstream is merged three-way: the recorded version is the base,
 * the working `.factory/` is yours, and the selected newer version is theirs.
 * An unversioned upstream is copied over the local files instead. A dry run
 * computes the same plan and writes nothing.
 */
export async function runUpdate(options: UpdateOptions): Promise<UpdateReport> {
  const root = path.resolve(options.root);
  const factoryDir = path.join(root, ".factory");
  const config: Config = await loadConfig(factoryDir);

  const configErrors = config.problems.filter((problem) => problem.level === "error");
  if (configErrors.length > 0) throw configInvalid(configErrors);

  const previous = config.upstream;
  if (previous === undefined) throw noUpstream();

  await assertResolved(root);

  const sourceOptions = sourceOptionsOf(options);
  if (previous.kind === "unversioned") {
    if (options.to !== undefined) throw toWithUnversionedSource(options.to);
    return runUnversioned(root, factoryDir, previous, options, sourceOptions);
  }

  return runVersioned(root, factoryDir, previous, options, sourceOptions);
}

/** Human-readable report for `update`. */
export function describeUpdate(report: UpdateReport): string {
  if (report.message !== undefined) return report.message;
  return report.review === undefined ? "" : renderSummary(report.review);
}
