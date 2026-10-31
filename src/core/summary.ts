import { diffLines } from "diff";
import { describePipelineChanges } from "./import/pipeline-changes.js";
import type { FileEntry, FileTree } from "./import/file-tree.js";
import { parseFrontmatter } from "../util/frontmatter.js";

export const SUMMARY_FOOTER = "Nothing was committed. Review the changes with git diff.";

/** How a path changed: added, modified, deleted, or in conflict. */
export type ChangeStatus = "A" | "M" | "D" | "C";

export type SummaryGroupKey =
  | "code"
  | "session"
  | "workflows"
  | "skills"
  | "preserved"
  | "conflicts"
  | "other";

export interface SummaryEntry {
  /** Absent for a preserved local edit, which did not change. */
  status?: ChangeStatus;
  path: string;
  /** Lines added and removed, for text that changed. */
  added?: number;
  removed?: number;
  binary?: boolean;
  /** The file has an executable bit, counted for the file after the change. */
  executable?: boolean;
  /** A change to the executable bit alone. */
  modeChanged?: "added" | "removed";
  /** A new workflow's title, from its `SKILL.md`. */
  title?: string;
  /** Text shown instead of line counts: a pipeline description or a conflict instruction. */
  description?: string;
  /** Extra notes shown after the counts, such as `allowed-tools changed`. */
  annotations?: string[];
}

export interface SummaryGroup {
  key: SummaryGroupKey;
  heading: string;
  entries: SummaryEntry[];
}

export interface SummaryContext {
  /** First line of the summary, such as `@seasb/fab-mark4 1.2.0 -> 1.3.0`. */
  title: string;
  /** Paths whose local edits a merge preserved (`update` only). */
  preserved?: string[];
  /** Paths that contain conflict markers (`update` only). */
  conflicts?: string[];
  /** Extra lines shown before the footer. */
  notes?: string[];
}

export interface Summary {
  title: string;
  groups: SummaryGroup[];
  notes: string[];
  footer: string;
}

export const CONFLICT_INSTRUCTION = "Resolve markers, then run metafab build and metafab check";

const INDENT = 2;
const PATH_GAP = 8;

function isExecutable(entry: FileEntry | undefined): boolean {
  return entry !== undefined && (entry.mode & 0o111) !== 0;
}

function baseName(relativePath: string): string {
  const index = relativePath.lastIndexOf("/");
  return index === -1 ? relativePath : relativePath.slice(index + 1);
}

function parentDir(relativePath: string): string {
  const index = relativePath.lastIndexOf("/");
  return index === -1 ? "" : relativePath.slice(0, index);
}

function skillDirectories(...trees: FileTree[]): Set<string> {
  const directories = new Set<string>();
  for (const tree of trees) {
    for (const relativePath of Object.keys(tree)) {
      if (baseName(relativePath) === "SKILL.md") directories.add(parentDir(relativePath));
    }
  }
  return directories;
}

function isInSkillDirectory(relativePath: string, directories: Set<string>): boolean {
  let directory = parentDir(relativePath);
  while (true) {
    if (directories.has(directory)) return true;
    if (directory === "") return false;
    directory = parentDir(directory);
  }
}

function firstHeading(body: string): string | undefined {
  let fence: { marker: string; length: number } | undefined;
  for (const line of body.split("\n")) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch !== null) {
      const marker = fenceMatch[1]!;
      if (fence === undefined) {
        fence = { marker: marker[0]!, length: marker.length };
      } else if (marker[0] === fence.marker && marker.length >= fence.length) {
        fence = undefined;
      }
      continue;
    }
    if (fence !== undefined) continue;
    const match = /^# (.+)$/.exec(line);
    if (match) return match[1]?.trim();
  }
  return undefined;
}

function skillTitle(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const parsed = parseFrontmatter(text);
  return parsed.ok ? firstHeading(parsed.body) : undefined;
}

function allowedTools(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const parsed = parseFrontmatter(text);
  if (!parsed.ok) return undefined;
  const value = parsed.value["allowed-tools"];
  // An absent field and an empty one both compare as the empty string, so a
  // field that was added or removed still reads as a change.
  return value === undefined || value === null ? "" : JSON.stringify(value);
}

function countLines(beforeText: string, afterText: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const part of diffLines(beforeText, afterText)) {
    if (part.added === true) added += part.count ?? 0;
    if (part.removed === true) removed += part.count ?? 0;
  }
  return { added, removed };
}

function annotationsFor(
  path: string,
  before: FileEntry | undefined,
  after: FileEntry | undefined,
): string[] {
  if (baseName(path) !== "SKILL.md" || before === undefined || after === undefined) return [];
  if (before.hash === after.hash) return [];
  const annotations: string[] = [];
  const previous = allowedTools(before.text);
  const next = allowedTools(after.text);
  if (previous !== next) annotations.push("allowed-tools changed");
  return annotations;
}

interface Change {
  path: string;
  status: "A" | "M" | "D";
  before?: FileEntry;
  after?: FileEntry;
}

function changesOf(before: FileTree, after: FileTree): Change[] {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const changes: Change[] = [];
  for (const relativePath of paths) {
    const previous = before[relativePath];
    const next = after[relativePath];
    if (previous === undefined && next === undefined) continue;
    if (previous === undefined) {
      changes.push({ path: relativePath, status: "A", after: next! });
    } else if (next === undefined) {
      changes.push({ path: relativePath, status: "D", before: previous });
    } else if (previous.hash !== next.hash || previous.mode !== next.mode) {
      changes.push({ path: relativePath, status: "M", before: previous, after: next });
    }
  }
  return changes;
}

function entryFor(change: Change): SummaryEntry {
  const { before, after } = change;
  const entry: SummaryEntry = { status: change.status, path: change.path };

  if (change.status === "A") {
    entry.added = after?.binary === true ? 0 : countLines("", after?.text ?? "").added;
    entry.removed = 0;
  } else if (change.status === "D") {
    entry.added = 0;
    entry.removed = before?.binary === true ? 0 : countLines(before?.text ?? "", "").removed;
  } else if (after?.binary === true || before?.binary === true) {
    // Binary content has no line counts.
  } else if (before!.hash === after!.hash) {
    entry.added = 0;
    entry.removed = 0;
    if (isExecutable(before) !== isExecutable(after)) {
      entry.modeChanged = isExecutable(after) ? "added" : "removed";
    }
  } else {
    const counts = countLines(before?.text ?? "", after?.text ?? "");
    entry.added = counts.added;
    entry.removed = counts.removed;
  }

  if (after?.binary === true) entry.binary = true;
  if (isExecutable(after)) entry.executable = true;
  const annotations = annotationsFor(change.path, before, after);
  if (annotations.length > 0) entry.annotations = annotations;
  return entry;
}

function sessionDetail(
  path: string,
  before: FileEntry | undefined,
  after: FileEntry | undefined,
): string | undefined {
  if (path !== "factory.yaml" || after === undefined) return undefined;
  const descriptions =
    before === undefined
      ? describePipelineChanges(undefined, after.text)
      : describePipelineChanges(before.text, after.text);
  return descriptions.length === 0 ? undefined : descriptions.join("; ");
}

function groupOf(path: string, executable: boolean, directories: Set<string>): SummaryGroupKey {
  if (path.startsWith("scripts/")) return "code";
  if (executable) return "code";
  if (isInSkillDirectory(path, directories) && !path.toLowerCase().endsWith(".md")) return "code";
  if (path === "AGENTS.md" || path === "factory.yaml") return "session";
  if (path.startsWith("workflows/")) return "workflows";
  if (path.startsWith("skills/")) return "skills";
  return "other";
}

const HEADINGS: Record<SummaryGroupKey, string> = {
  code: "Runs code on your machines: review first",
  session: "Changes every agent session",
  workflows: "Workflows",
  skills: "Skills",
  preserved: "Local edits preserved",
  conflicts: "Conflicts",
  other: "Other",
};

/**
 * Compare two factory snapshots and group the changes by the risk they carry.
 *
 * The groups follow the spec order: code, every-session files, workflows,
 * skills, preserved local edits, conflicts, and other files.
 */
export function summarise(before: FileTree, after: FileTree, ctx: SummaryContext): Summary {
  const conflicts = new Set(ctx.conflicts ?? []);
  const preserved = new Set(ctx.preserved ?? []);
  const directories = skillDirectories(before, after);
  const changes = changesOf(before, after);

  const newWorkflows = new Set<string>();
  for (const directory of directories) {
    if (!directory.startsWith("workflows/")) continue;
    if (!directory.split("/")[1] || directory.split("/").length !== 2) continue;
    const prefix = `${directory}/`;
    const existed = Object.keys(before).some((path) => path.startsWith(prefix));
    const added = after[`${directory}/SKILL.md`];
    if (!existed && added !== undefined) newWorkflows.add(directory);
  }

  const entries: Record<SummaryGroupKey, SummaryEntry[]> = {
    code: [],
    session: [],
    workflows: [],
    skills: [],
    preserved: [],
    conflicts: [],
    other: [],
  };
  const reportedWorkflows = new Set<string>();

  for (const change of changes) {
    if (conflicts.has(change.path)) continue;
    if (preserved.has(change.path)) continue;

    const directory = parentDir(change.path);
    const key = groupOf(
      change.path,
      isExecutable(change.after) || isExecutable(change.before),
      directories,
    );

    if (key === "workflows" && newWorkflows.has(directory)) {
      if (!reportedWorkflows.has(directory)) {
        reportedWorkflows.add(directory);
        const title = skillTitle(after[`${directory}/SKILL.md`]?.text);
        entries.workflows.push({
          status: "A",
          path: directory,
          ...(title === undefined ? {} : { title }),
        });
      }
      continue;
    }

    const entry = entryFor(change);
    if (key === "session") {
      const detail = sessionDetail(change.path, change.before, change.after);
      if (detail !== undefined) entry.description = detail;
    }
    entries[key].push(entry);
  }

  for (const path of preserved) {
    entries.preserved.push({ path });
  }

  for (const path of conflicts) {
    entries.conflicts.push({
      status: "C",
      path,
      description: CONFLICT_INSTRUCTION,
    });
  }

  const order: SummaryGroupKey[] = [
    "code",
    "session",
    "workflows",
    "skills",
    "preserved",
    "conflicts",
    "other",
  ];
  const groups: SummaryGroup[] = [];
  for (const key of order) {
    const groupEntries = entries[key];
    if (groupEntries.length === 0) continue;
    groupEntries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
    groups.push({
      key,
      heading: key === "conflicts" ? `${HEADINGS.conflicts}: ${groupEntries.length}` : HEADINGS[key],
      entries: groupEntries,
    });
  }

  return {
    title: ctx.title,
    groups,
    notes: [...(ctx.notes ?? [])],
    footer: SUMMARY_FOOTER,
  };
}

function detailOf(entry: SummaryEntry): string | undefined {
  if (entry.description !== undefined) return entry.description;
  if (entry.title !== undefined) return entry.title;
  if (entry.status === undefined) return undefined;
  if (entry.executable === true && entry.status === "A") return "new, executable";
  if (entry.binary === true) return entry.status === "A" ? "new" : "binary";
  if (entry.added === undefined || entry.removed === undefined) return undefined;
  if (entry.added === 0 && entry.removed === 0) {
    if (entry.modeChanged === "added") return "executable";
    if (entry.modeChanged === "removed") return "not executable";
    return undefined;
  }
  return `+${entry.added} -${entry.removed}`;
}

/** Render a summary as the human-readable text the spec shows. */
export function renderSummary(summary: Summary): string {
  let longestPath = 0;
  for (const group of summary.groups) {
    for (const entry of group.entries) {
      if (detailOf(entry) === undefined) continue;
      longestPath = Math.max(longestPath, entry.path.length);
    }
  }
  const column = INDENT + 2 + longestPath + PATH_GAP;

  const sections: string[] = [summary.title];
  for (const group of summary.groups) {
    const lines = [group.heading];
    for (const entry of group.entries) {
      const status = entry.status === undefined ? "" : `${entry.status} `;
      const bare = `${" ".repeat(INDENT)}${status}${entry.path}`;
      const detail = detailOf(entry);
      if (detail === undefined) {
        lines.push(bare);
        continue;
      }
      const prefix = bare;
      const padded = prefix.padEnd(Math.max(column, prefix.length + 1));
      const annotations =
        entry.annotations === undefined || entry.annotations.length === 0
          ? ""
          : `${" ".repeat(4)}${entry.annotations.join(", ")}`;
      lines.push(`${padded}${detail}${annotations}`);
    }
    sections.push(lines.join("\n"));
  }
  if (summary.notes.length > 0) sections.push(summary.notes.join("\n"));
  sections.push(summary.footer);
  return sections.join("\n\n");
}
