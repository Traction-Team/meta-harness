import { chmod, lstat, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { readdirTyped } from "../../util/fs.js";
import { cliVersion } from "../../util/version.js";
import { toLF } from "../../util/text.js";
import { applyBuild, planBuild } from "../build/index.js";
import type { BuildChange } from "../build/index.js";
import { scanFactoryFiles } from "../check/index.js";
import { loadConfig } from "../config/load.js";
import { CONFIG_FILE } from "../config/parse.js";
import type { Config, UpstreamEntry } from "../config/types.js";
import { setUpstream } from "../config/writers.js";
import { loadFactory } from "../factory/load.js";
import { localFilesForImport } from "../import/conflicts.js";
import { emptyTree, snapshotDirectories } from "../import/file-tree.js";
import type { FileEntry, FileTree } from "../import/file-tree.js";
import { copyFactoryTree } from "../import/copy.js";
import { mergePath } from "../merge.js";
import type { MergeLabels, MergeResult } from "../merge.js";
import { fetchFab, resolve } from "../sources/index.js";
import type { FetchedFab, SourceOptions } from "../sources/index.js";
import { parseSource } from "../sources/parse.js";
import type { Resolved } from "../sources/types.js";
import { renderSummary, summarise, modeMatters } from "../summary.js";
import type { Summary } from "../summary.js";
import { findPathClashes } from "./clashes.js";
import { fetchRecordedBase, recordedBaseGone } from "./fetch.js";
import { captureFactory } from "./restore.js";
import type { FactoryCapture } from "./restore.js";
import { alignFactorySpelling, alignPathSpelling, alignTreeSpelling } from "./spelling.js";
import {
  recordedLabel,
  sameVersion,
  selectVersion,
  versionLabel,
} from "./select.js";
import type { VersionedResolved, VersionedUpstream } from "./select.js";
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
  /** The `--to` range now recorded in the upstream entry, when no update ran. */
  requested?: string;
  /** Local edits the merge kept. */
  preserved: string[];
  /** Paths whose content matches upstream but whose executable bit differs. */
  modeOnly: string[];
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
  modeOnly: string[];
  conflicts: string[];
  sideFiles: string[];
  notes: string[];
  /**
   * Paths upstream renamed while changing only their case. The update realigns
   * the filesystem and the review to one spelling for them, even when the merge
   * writes nothing, so they must reach the spelling realignment too.
   */
  realigned: string[];
}

/** Paths an update changed, as the review groups and the JSON report show them. */
interface TreeChanges {
  added: string[];
  updated: string[];
  removed: string[];
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

/**
 * The error an update that failed while writing reports. The original message
 * is kept, so the cause of the failure is not lost, and the summary says
 * whether `.factory/` was put back. When the restore itself failed, the fix
 * points at Git: the files on disk are the only reliable record of what
 * changed.
 */
function updateWriteFailed(error: unknown, restored: boolean): MetafabError {
  const original = error instanceof Error && error.message !== "" ? error.message : String(error);
  const stopped = `Update stopped: ${original.replace(/\.$/, "")}.`;
  const state = restored ? ".factory/ was restored." : ".factory/ may be partly updated.";
  return new MetafabError(`${stopped} ${state}`, {
    exitCode: ExitCode.Failed,
    code: "update-write-failed",
    cause: error,
    ...(restored
      ? {}
      : {
          problems: [
            {
              level: "error" as const,
              file: ".factory",
              message: "The update stopped before it finished and could not restore .factory/",
              fix: "Restore .factory/ from Git (git status shows what changed), then run metafab update again",
            },
          ],
        }),
  });
}

/** Restores the capture, reporting whether the directory is known to be back. */
async function restoreCapture(capture: FactoryCapture): Promise<boolean> {
  try {
    await capture.restore();
    return true;
  } catch {
    return false;
  }
}

/**
 * Refuses an update whose incoming paths would replace local content rather
 * than merge with it. The refusal happens before anything is written, for a dry
 * run too, so the reported plan can never claim a file was preserved after it
 * was deleted.
 */
function pathClashes(problems: Problem[]): MetafabError {
  return new MetafabError(
    "Update stopped because the incoming fab would replace local content.",
    {
      exitCode: ExitCode.Failed,
      code: "update-path-conflict",
      problems,
    },
  );
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

/**
 * Refuses an update while a marker or `.upstream` file from the last one
 * remains. It reuses the `metafab check` scanner, so update and check can never
 * disagree about what counts as unresolved: markers are found in any encoding
 * the check scanner reads, and `.upstream` files are found the same way.
 */
async function assertResolved(root: string): Promise<void> {
  const problems = await scanFactoryFiles(root);
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
  return {
    changed: report.changed,
    problems: [...warnings, ...plan.warnings, ...report.hookWarnings],
  };
}

async function lstatIfExists(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** True when anything beneath `directory` is not itself a directory. */
async function containsFile(directory: string): Promise<boolean> {
  for (const entry of await readdirTyped(directory)) {
    if (!entry.isDirectory()) return true;
    if (await containsFile(path.join(directory, entry.name))) return true;
  }
  return false;
}

/**
 * Resolves the target of a planned write, removing a file, link, or emptied
 * directory in its way.
 *
 * The clash preflight refuses a write over a directory that still holds local
 * content, so the directory branch below is a defensive invariant: it fires
 * only if the preflight and this write disagree, and it leaves the repository
 * untouched rather than deleting content the summary called preserved. A
 * directory the plan emptied is removed and replaced, which is how an upstream
 * directory collapses into a file.
 */
async function prepareWrite(factoryDir: string, relativePath: string): Promise<string> {
  const target = factoryPath(factoryDir, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  const existing = await lstatIfExists(target);
  if (existing?.isDirectory() === true) {
    if (!(await containsFile(target))) {
      await rm(target, { recursive: true, force: true });
    } else {
      const file = `.factory/${relativePath}`;
      throw new MetafabError(`Refusing to replace the directory ${file} with a file`, {
        exitCode: ExitCode.Failed,
        code: "update-path-conflict",
        problems: [
          {
            level: "error",
            file,
            message: `Refusing to replace the directory ${file} with a file`,
            fix: "Move the local directory away, then run metafab update again",
          },
        ],
      });
    }
  } else if (existing !== undefined) {
    await rm(target, { force: true });
  }
  return target;
}

/**
 * The bytes a planned write puts on disk.
 *
 * A merged file keeps the line ending its local copy had, so a CRLF file stays
 * CRLF. An added file is written as upstream had it, original bytes included.
 * A binary file is never converted.
 */
function writeContentFor(entry: FileEntry): Buffer {
  if (entry.link !== undefined || entry.binary) return entryContent(entry);
  if (entry.crlf === true) {
    return Buffer.from(toLF(entry.text ?? "").replace(/\n/g, "\r\n"), "utf8");
  }
  return entry.raw ?? entryContent(entry);
}

/** Writes one planned path, replacing whatever local file or link it lands on. */
async function writeEntry(
  factoryDir: string,
  relativePath: string,
  entry: FileEntry,
): Promise<void> {
  const target = await prepareWrite(factoryDir, relativePath);

  if (entry.link !== undefined) {
    await symlink(entry.link, target);
    return;
  }

  await writeFile(target, writeContentFor(entry), { mode: entry.mode });
  await chmod(target, entry.mode);
}

/** Writes a side file from upstream's bytes, which are already final. */
async function writeRawEntry(
  factoryDir: string,
  relativePath: string,
  content: Buffer,
  mode: number,
): Promise<void> {
  const target = await prepareWrite(factoryDir, relativePath);
  await writeFile(target, content, { mode });
  await chmod(target, mode);
}

async function applyWrites(factoryDir: string, writes: readonly PlannedWrite[]): Promise<void> {
  for (const write of writes) {
    if (write.kind === "remove") {
      // A planned removal names a local file or link, never a directory.
      await rm(factoryPath(factoryDir, write.path), { force: true });
    } else if (write.kind === "side-file") {
      await writeRawEntry(factoryDir, `${write.path}.upstream`, write.content, write.mode);
    } else {
      await writeEntry(factoryDir, write.path, write.entry);
    }
  }
}

/** Every path in a tree, keyed by its lowercase spelling. */
function foldedPaths(tree: FileTree): Map<string, string[]> {
  const folded = new Map<string, string[]>();
  for (const relativePath of Object.keys(tree)) {
    const key = relativePath.toLowerCase();
    const paths = folded.get(key);
    if (paths === undefined) folded.set(key, [relativePath]);
    else paths.push(relativePath);
  }
  return folded;
}

/**
 * The path a kept local entry has after realignment.
 *
 * Realignment only changes the case of path components, so a preserved path
 * that no longer exists at its old spelling moved to the single path that folds
 * to it. Without this the summary names a directory the update just renamed
 * away. Any other path keeps its spelling.
 */
function movedSpelling(
  after: FileTree,
  folded: ReadonlyMap<string, string[]>,
  relativePath: string,
): string {
  if (after[relativePath] !== undefined) return relativePath;
  const matches = folded.get(relativePath.toLowerCase());
  return matches !== undefined && matches.length === 1 ? matches[0]! : relativePath;
}

/** True when two entries describe different content or executable bit. */
function entriesDiffer(left: FileEntry | undefined, right: FileEntry | undefined): boolean {
  if (left === undefined || right === undefined) return left !== right;
  if (left.hash !== right.hash) return true;
  return modeMatters(left, right);
}

/**
 * The files the update changed, comparing the realigned before tree with the
 * tree it leaves behind.
 *
 * Both trees use the spelling the update leaves on disk, so a path renamed only
 * by case is compared with itself: a file that still exists is never reported
 * as removed, and its content change is reported at its new spelling. A path
 * with conflict markers is listed under `conflicts` and is not repeated here,
 * which keeps these lists and the review groups complementary.
 */
function changedPaths(before: FileTree, after: FileTree, conflicts: readonly string[]): TreeChanges {
  const conflicted = new Set(conflicts);
  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();

  for (const relativePath of paths) {
    if (conflicted.has(relativePath)) continue;
    const previous = before[relativePath];
    const next = after[relativePath];
    if (previous === undefined && next === undefined) continue;
    if (previous === undefined) added.push(relativePath);
    else if (next === undefined) removed.push(relativePath);
    else if (entriesDiffer(previous, next)) updated.push(relativePath);
  }

  return { added, updated, removed };
}

/**
 * The shared sentence for a path the merge cannot place without a base.
 * `difference` names the two cases Metafab cannot tell apart; the caller says
 * what it did with the path.
 */
function withoutBase(difference: string): string {
  return `the base is unavailable, so Metafab cannot tell ${difference}`;
}

function conflictNote(path: string, result: Extract<MergeResult, { action: "side-file" }>): string {
  if (result.reason === "link") {
    if (result.upstreamLink !== undefined) {
      return `Conflict in ${path}: upstream is a link to ${result.upstreamLink}; its target is in ${path}.upstream.`;
    }
    return `Conflict in ${path}: your entry is a link to ${result.yoursLink ?? ""}; upstream's file is in ${path}.upstream.`;
  }
  if (result.reason === "new-local") {
    return `Conflict in ${path}: the local entry differs from the new upstream file, which was written to ${path}.upstream.`;
  }
  if (result.reason === "base-unavailable") {
    return `Conflict in ${path}: ${withoutBase("a local removal from an upstream addition")}. The path stays absent, and upstream was written to ${path}.upstream.`;
  }
  return `Binary conflict in ${path}: upstream was written to ${path}.upstream.`;
}

/**
 * Upstream's bytes as a side file holds them: a link's target, or a file's
 * original bytes when they differ from its LF text.
 */
function sideFileContent(entry: FileEntry): Buffer {
  if (entry.link !== undefined) return Buffer.from(entry.link, "utf8");
  if (entry.binary) return Buffer.from(entry.data ?? new Uint8Array());
  return entry.raw ?? Buffer.from(entry.text ?? "", "utf8");
}

/** One base path upstream renamed while changing only the case of its spelling. */
interface CaseRename {
  from: string;
  to: string;
}

/**
 * Base paths that upstream renamed by case alone: base has `from`, theirs has
 * `to` with the same folded spelling, and neither base has `to` nor theirs has
 * `from`. The two spellings name one logical file, so the merge compares the
 * three sides at `to`. Without this the rename reads as a removal plus an
 * addition, and a local edit inside the renamed path refuses the update as a
 * case-only clash.
 *
 * Every other case-only pair — both spellings on one side, or several folded
 * candidates — is left alone, so the clash preflight still refuses it.
 */
function caseOnlyRenames(base: FileTree, theirs: FileTree): CaseRename[] {
  const theirsByFold = foldedPaths(theirs);
  const renames: CaseRename[] = [];

  for (const from of Object.keys(base)) {
    if (theirs[from] !== undefined) continue;
    const matches = theirsByFold.get(from.toLowerCase()) ?? [];
    if (matches.length !== 1) continue;
    const to = matches[0]!;
    if (to === from || base[to] !== undefined) continue;
    renames.push({ from, to });
  }

  return renames;
}

/**
 * Renames one side's paths to the spelling upstream now uses, matching a local
 * entry by its folded path so a file the user re-cased still merges.
 *
 * A path that already exists at the new spelling, or a folded group with more
 * than one local entry, is left where it is: the merge does not guess, and the
 * clash preflight refuses the update. Every path moved here must also reach the
 * realignment in `runVersioned`, so the file on disk moves even when the merge
 * keeps its content.
 */
function realignRenames(
  tree: FileTree,
  renames: readonly CaseRename[],
): { tree: FileTree; moved: string[] } {
  const byFold = foldedPaths(tree);
  const realigned: Record<string, FileEntry> = { ...tree };
  const moved: string[] = [];

  for (const { from, to } of renames) {
    const candidates = byFold.get(from.toLowerCase()) ?? [];
    if (candidates.length !== 1) continue;
    const current = candidates[0]!;
    const entry = realigned[current];
    if (entry === undefined || realigned[to] !== undefined) continue;
    delete realigned[current];
    realigned[to] = entry;
    moved.push(to);
  }

  return { tree: realigned, moved };
}

/**
 * True when yours and theirs made the same change to a path that exists in all
 * three versions. The shared result needs no local maintenance, so it is not a
 * preserved local edit: the file now matches upstream.
 */
function sameChangeAsYours(
  base: FileEntry | undefined,
  yours: FileEntry | undefined,
  theirs: FileEntry | undefined,
  baseUnavailable: boolean,
): boolean {
  if (baseUnavailable || base === undefined || yours === undefined || theirs === undefined) {
    return false;
  }
  return !sameEntry(base, yours) && sameEntry(yours, theirs);
}

/**
 * Applies the merge table to every path in base, yours, or theirs.
 *
 * The returned `after` tree is the planned state of `.factory/` before the
 * spelling realignment: the caller aligns it the way the writes realign the
 * filesystem, so the review matches the files a real run leaves behind.
 */
export function planMerge(
  base: FileTree,
  yours: FileTree,
  theirs: FileTree,
  labels: MergeLabels,
  options: { baseUnavailable?: boolean } = {},
): MergePlan {
  const baseUnavailable = options.baseUnavailable === true;
  // Upstream renames that change only case are one logical path per file, so
  // the three sides are compared at the new spelling instead of reading the
  // rename as a removal plus an addition.
  const renames = caseOnlyRenames(base, theirs);
  const mergedBase = renames.length === 0 ? base : realignRenames(base, renames).tree;
  const mergedYours =
    renames.length === 0 ? { tree: yours, moved: [] } : realignRenames(yours, renames);
  const after: Record<string, FileEntry> = { ...mergedYours.tree };
  const writes: PlannedWrite[] = [];
  const preserved: string[] = [];
  const modeOnly: string[] = [];
  const conflicts: string[] = [];
  const sideFiles: string[] = [];
  const notes: string[] = [];

  const paths = [
    ...new Set([
      ...Object.keys(mergedBase),
      ...Object.keys(mergedYours.tree),
      ...Object.keys(theirs),
    ]),
  ].sort();

  for (const relativePath of paths) {
    const baseEntry = baseUnavailable ? undefined : mergedBase[relativePath];
    const yoursEntry = mergedYours.tree[relativePath];
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
        if (result.note === "base-unavailable") {
          // Without a base, a path upstream no longer has may be a local
          // addition rather than an upstream removal. Keeping it is the only
          // safe outcome, but it is not a conflict: nothing is left to resolve,
          // so it is reported like the upstream-removed row.
          preserved.push(relativePath);
          notes.push(
            `${relativePath}: ${withoutBase("a local addition from an upstream removal")}; kept your file.`,
          );
        } else if (result.note === "base-unavailable-mode") {
          // Same content, different executable bit: yours stays as it is and
          // the difference is reported, but it is not a local edit to keep.
          // Without a base there is no way to tell which side changed the mode,
          // and a mode is not a conflict.
          modeOnly.push(relativePath);
          notes.push(
            `${relativePath}: ${withoutBase("which side changed the permission bits")}; kept your permission bits.`,
          );
        } else if (result.note === "upstream-removed") {
          preserved.push(relativePath);
          notes.push(`Upstream removed ${relativePath}; your local version was kept.`);
        } else if (sameChangeAsYours(baseEntry, yoursEntry, theirsEntry, baseUnavailable)) {
          // Row 4: the local edit and the upstream change agree, so the path
          // needs no local maintenance. Reporting it as preserved would imply
          // an edit to keep; the note says upstream caught up instead.
          notes.push(
            `Upstream made the same change as your local edit to ${relativePath}; the file now matches upstream.`,
          );
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
          writes.push({ kind: "write", path: relativePath, entry: theirsEntry });
        }
        break;
      }
      case "take-theirs": {
        if (theirsEntry !== undefined) {
          // The write follows the local copy's line endings, so drop upstream's
          // CRLF flag and original bytes and let the local `crlf` decide for a
          // file both sides have. The mode is the one the merge chose, which is
          // the local mode when only non-executable bits differ.
          const entry: FileEntry = {
            ...theirsEntry,
            mode: result.mode,
            raw: undefined,
          };
          delete entry.crlf;
          if (yoursEntry?.crlf === true) entry.crlf = true;
          after[relativePath] = entry;
          writes.push({ kind: "write", path: relativePath, entry });
        }
        break;
      }
      case "write":
      case "conflict": {
        const entry = entryFromContent(result.content, result.mode);
        if (yoursEntry?.crlf === true) entry.crlf = true;
        after[relativePath] = entry;
        writes.push({ kind: "write", path: relativePath, entry });
        if (result.action === "conflict") conflicts.push(relativePath);
        break;
      }
      case "side-file": {
        sideFiles.push(relativePath);
        conflicts.push(relativePath);
        notes.push(conflictNote(relativePath, result));
        writes.push({
          kind: "side-file",
          path: relativePath,
          content: theirsEntry === undefined ? result.upstream : sideFileContent(theirsEntry),
          mode: result.upstreamMode,
        });
        break;
      }
    }
  }

  return {
    after,
    // Removals first: a case-only rename, or a directory turned into a file,
    // writes a path that a removal frees. The clash preflight and applyWrites
    // both rely on the freed path being gone before the write lands.
    writes: [
      ...writes.filter((write) => write.kind === "remove"),
      ...writes.filter((write) => write.kind !== "remove"),
    ],
    preserved: [...new Set(preserved)].sort(),
    modeOnly: [...new Set(modeOnly)].sort(),
    conflicts: [...new Set(conflicts)].sort(),
    sideFiles: sideFiles.sort(),
    notes,
    realigned: [...new Set(mergedYours.moved)].sort(),
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
  | "modeOnly"
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
    modeOnly: [],
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

function requestLabel(upstream: VersionedUpstream): string {
  if (upstream.kind === "npm") return upstream.requested;
  return upstream.requested ?? upstream.commit.slice(0, 7);
}

/** True when two upstream entries record the same request and revision. */
function sameUpstream(left: VersionedUpstream, right: VersionedUpstream): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * The upstream entry that records a selected version. It keeps the source as
 * recorded and writes the request the selection resolved, so a later update
 * follows a new `--to` range even when it selected the version already
 * installed.
 *
 * `upstreamEntry` in `src/core/sources/git.ts` and `npm.ts` rebuilds the
 * recorded source from the source spec instead. This function must not use it:
 * it keeps the recorded `source` spelling, which a rebuilt entry would change.
 */
function upstreamFor(
  previous: VersionedUpstream,
  selected: VersionedResolved,
): VersionedUpstream {
  if (previous.kind === "npm") {
    return selected.kind === "npm"
      ? {
          kind: "npm",
          source: previous.source,
          requested: selected.requested,
          version: selected.version,
        }
      : previous;
  }

  if (selected.kind === "npm") return previous;
  return {
    kind: "git",
    source: previous.source,
    ...(selected.requested === undefined ? {} : { requested: selected.requested }),
    ...(selected.version === undefined ? {} : { version: selected.version }),
    commit: selected.commit,
  };
}

async function runVersioned(
  root: string,
  factoryDir: string,
  previous: VersionedUpstream,
  options: UpdateOptions,
  sourceOptions: SourceOptions,
): Promise<UpdateReport> {
  const report = baseReport(root, previous, true);

  const outcome = await selectVersion(previous, {
    ...sourceOptions,
    cwd: root,
    ...(options.to === undefined ? {} : { to: options.to }),
  });
  if (outcome.kind === "pinned") {
    return { ...report, status: "pinned", message: `Pinned to ${outcome.ref}. Use --to.` };
  }

  const selected = outcome.resolved;
  if (sameVersion(previous, selected)) {
    if (options.to === undefined) {
      return { ...report, status: "up-to-date", message: "Already up to date." };
    }
    // `--to` can select the installed version and still change the recorded
    // request, so record it: the next update follows the new range. Nothing
    // else changes, and the summary says what was recorded.
    const upstream = upstreamFor(previous, selected);
    if (sameUpstream(previous, upstream)) {
      return { ...report, status: "up-to-date", message: "Already up to date." };
    }
    const range = requestLabel(upstream);
    if (options.dryRun === true) {
      return {
        ...report,
        status: "up-to-date",
        message: `Already up to date. Dry run: would record requested range ${range}.`,
        requested: range,
      };
    }
    await setUpstream(factoryDir, upstream);
    return {
      ...report,
      status: "up-to-date",
      message: `Already up to date. Recorded requested range ${range}.`,
      upstream,
      requested: range,
    };
  }

  let theirs: FetchedFab | undefined;
  let base: FetchedFab | undefined;
  try {
    theirs = await fetchFab(selected, sourceOptions);
    const selectedEntry = theirs.upstream as VersionedUpstream;

    let baseUnavailable = false;
    try {
      base = await fetchRecordedBase(previous, { ...sourceOptions, cwd: root });
    } catch (error) {
      // Merging without a base is only correct when the base is gone: a force
      // push removed its commit, or npm unpublished its version. Any other
      // failure (network, credentials, cache or filesystem) must abort the
      // update before it writes, with its own problem and exit code.
      if (!(error instanceof MetafabError) || !recordedBaseGone(error)) throw error;
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

    // Check before writing anything, and before a dry run reports the plan: a
    // write at a path a local directory or case variant occupies would delete
    // local content, which the summary would then wrongly call preserved.
    // Paths the plan removes are not obstacles: a rename or a restructure
    // removes a local path and writes its replacement.
    const local = await localFilesForImport(root, factoryDir, [], true);
    const clashes = findPathClashes(local, {
      files: [
        ...plan.writes.flatMap((write) =>
          write.kind === "remove"
            ? []
            : [write.kind === "side-file" ? `${write.path}.upstream` : write.path],
        ),
        // A case-only rename the merge resolved moves its file even when it
        // writes nothing, and the realignment still walks every ancestor of the
        // new spelling. Feed those paths to the preflight too, so a refusal
        // happens before the removals that run ahead of the realignment.
        ...plan.realigned,
      ],
      directories: [],
      removed: plan.writes.flatMap((write) => (write.kind === "remove" ? [write.path] : [])),
      renameCaseOnlyDirectories: true,
      mergedCaseOnlyFiles: plan.realigned,
    });
    if (clashes.length > 0) throw pathClashes(clashes);

    const notes = [...plan.notes];
    const problems: Problem[] = [];
    if (baseUnavailable) {
      const label = recordedLabel(previous);
      notes.push(
        `Recorded base ${label} no longer exists upstream, so every path where yours and theirs differ is treated as a conflict.`,
      );
    }
    if (theirs.deprecated !== undefined) {
      problems.push(deprecationWarning(selectedEntry, theirs.deprecated));
      notes.push(`npm version ${versionLabel(selected)} is deprecated: ${theirs.deprecated}`);
    }

    const built = !options.dryRun && options.noBuild !== true && plan.conflicts.length === 0;
    let changed: BuildChange[] = [];

    // The paths the update writes, in the source's spelling. The realignment
    // uses them on disk and the review uses them on the planned tree. A side
    // file holds local content, so its own name stays local: only the
    // directories above it follow the source, and `targets` realigns them.
    // A case-only rename the merge resolved moves its file even when it writes
    // nothing, so its new spelling realigns the directory and the review too.
    const writes = plan.writes.filter((write) => write.kind !== "remove");
    const incoming = {
      files: [
        ...writes.flatMap((write) => (write.kind === "write" ? [write.path] : [])),
        ...plan.realigned,
      ],
      directories: [],
    };
    const targets = writes.map((write) =>
      write.kind === "side-file"
        ? { ...write, path: alignPathSpelling(write.path, incoming) }
        : write,
    );

    if (options.dryRun === true) {
      notes.push("Dry run: nothing was written.");
    } else {
      // planMerge already orders removals before writes. The split here exists
      // only to run the realignment between them: the removals free an old
      // spelling, then alignFactorySpelling moves a directory renamed only in
      // case (and any local-only files inside it), so the writes land at the
      // source's spelling instead of recreating the old directory.
      //
      // The capture above the first write makes the block atomic in practice: a
      // failure partway puts `.factory/` back, so the old version stays the base
      // of the next update instead of half-applied upstream content.
      const capture = await captureFactory(factoryDir);
      try {
        await applyWrites(
          factoryDir,
          plan.writes.filter((write) => write.kind === "remove"),
        );
        await alignFactorySpelling(factoryDir, incoming);
        await applyWrites(factoryDir, targets);
        // The selected upstream becomes the base of the next update, even when
        // conflict markers were written: resolving them is local work against
        // this version.
        await setUpstream(factoryDir, theirs.upstream);
      } catch (error) {
        throw updateWriteFailed(error, await restoreCapture(capture));
      } finally {
        await capture.discard();
      }
    }

    // The build runs outside the captured block: a build failure never rolls
    // back an update that is already complete.
    if (built) {
      const build = await buildFactory(root, factoryDir);
      changed = build.changed;
      problems.push(...build.problems);
    }

    // The realignment moves a local-only file that lives inside a case-only
    // renamed directory, so the reviewed tree and the preserved paths must move
    // with it. Mirror the writes on disk: take the source's entries out of the
    // planned tree, realign what is left, then put them back at the source's
    // spelling. Aligning the tree as planned would already hold both spellings
    // and prefer the exact one the write added, leaving the local-only file at
    // the old spelling. A side file is local content and is not put back: the
    // realignment already moved it with its directory, as the write does. A dry
    // run computes the same tree, so both report what a real run writes.
    const written = new Map<string, FileEntry>();
    for (const write of writes) {
      if (write.kind !== "write") continue;
      const entry = plan.after[write.path];
      if (entry !== undefined) written.set(write.path, entry);
    }
    const unaligned = Object.fromEntries(
      Object.entries(plan.after).filter(([relativePath]) => !written.has(relativePath)),
    );
    const after: Record<string, FileEntry> = { ...alignTreeSpelling(unaligned, incoming) };
    for (const [relativePath, entry] of written) after[relativePath] = entry;

    // The before tree realigns the same way, so the report compares the same
    // files: a path renamed only by case is not a change, and a removal is
    // never reported for a file the update leaves on disk.
    const alignedBefore = alignTreeSpelling(before, incoming);
    const folded = foldedPaths(after);
    const preserved = [
      ...new Set(plan.preserved.map((relativePath) => movedSpelling(after, folded, relativePath))),
    ].sort();
    const changes = changedPaths(alignedBefore, after, plan.conflicts);

    const review = summarise(alignedBefore, after, {
      title: titleFor(previous, selectedEntry),
      ...(preserved.length === 0 ? {} : { preserved }),
      ...(plan.conflicts.length === 0 ? {} : { conflicts: plan.conflicts }),
      ...(notes.length === 0 ? {} : { notes }),
    });

    return {
      ...report,
      status: "updated",
      upstream: theirs.upstream,
      from: recordedLabel(previous),
      to: recordedLabel(selectedEntry),
      preserved,
      modeOnly: plan.modeOnly,
      conflicts: plan.conflicts,
      sideFiles: plan.sideFiles,
      added: changes.added,
      updated: changes.updated,
      removed: changes.removed,
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
  const report = baseReport(root, previous, false);

  // A recorded source is relative to the project root, not to the directory the
  // command was run from: `update` also runs from a subdirectory.
  const spec = parseSource(previous.source, { cwd: root });
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

    // The copy replaces upstream-owned paths and keeps the rest. Refuse a path
    // where it would delete a local directory or collide with a case variant,
    // before anything is written and for a dry run too. A file the source
    // replaces may differ only in case: the copy writes it with the source's
    // spelling, so the path on disk matches the fab.
    const [local, incomingDirectories] = await Promise.all([
      localFilesForImport(root, factoryDir, [], true),
      snapshotDirectories(fetched.factoryDir),
    ]);
    const clashes = findPathClashes(local, {
      files: Object.keys(theirs),
      directories: incomingDirectories,
      replaceCaseOnlyFiles: true,
    });
    if (clashes.length > 0) throw pathClashes(clashes);

    const notes = ["Replaced local edits can be restored from Git."];
    let changed: BuildChange[] = [];
    const problems: Problem[] = [];
    const built = options.dryRun !== true && options.noBuild !== true;

    if (options.dryRun === true) {
      notes.push("Dry run: nothing was written.");
    } else {
      // The copy replaces upstream-owned paths and keeps the rest; a failure
      // partway puts `.factory/` back rather than leaving a mixed tree.
      const capture = await captureFactory(factoryDir);
      try {
        await alignFactorySpelling(factoryDir, {
          files: Object.keys(theirs),
          directories: incomingDirectories,
        });
        await copyFactoryTree(fetched.factoryDir, factoryDir);
      } catch (error) {
        throw updateWriteFailed(error, await restoreCapture(capture));
      } finally {
        await capture.discard();
      }
    }

    // The build runs outside the captured block: a build failure never rolls
    // back an update that is already complete.
    if (built) {
      const build = await buildFactory(root, factoryDir);
      changed = build.changed;
      problems.push(...build.problems);
    }

    // A dry run cannot write, so it aligns the snapshot the same way the copy
    // will align the filesystem: a case-only replacement removes the old
    // spelling and adds the new one, so the summary matches the real run.
    const after =
      options.dryRun === true
        ? {
            ...alignTreeSpelling(before, {
              files: Object.keys(theirs),
              directories: incomingDirectories,
            }),
            ...theirs,
          }
        : await localFactoryTree(root);
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
