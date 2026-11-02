import { diff3Merge } from "node-diff3";
import { textContent } from "./build/skill.js";
import { toLF } from "../util/text.js";

/** One version of a path: its bytes and its permission bits. */
export interface MergeInput {
  content: Buffer;
  /** Permission bits, such as 0o644 or 0o755. */
  mode: number;
}

/** Versions printed in conflict markers. */
export interface MergeLabels {
  /** The recorded upstream version, printed after `base`. */
  base: string;
  /** The selected upstream version, printed after `upstream`. */
  upstream: string;
}

export interface MergeOptions {
  /**
   * True when the recorded base could not be fetched. Every difference between
   * yours and theirs then counts as a conflict, and a text conflict has no
   * base section.
   */
  baseUnavailable?: boolean;
}

export type MergeNote = "upstream-removed" | "upstream-changed-removed" | "base-unavailable";

/**
 * Why a conflict keeps yours and writes theirs to `<file>.upstream`: a binary
 * file that both sides changed, a new local file that differs from the new
 * upstream file, or a path only one side has while the base is unavailable.
 */
export type SideFileReason = "binary" | "new-local" | "base-unavailable";

/**
 * One outcome of the merge table.
 *
 * `keep` leaves the local file untouched. `take-theirs`, `add`, `write` and
 * `conflict` carry the content and the permission bits to write. `side-file`
 * keeps yours and writes `upstream` to `<file>.upstream`, and its reason says
 * whether that is a binary conflict or a new local file that differs from the
 * new upstream file. `remove` deletes the local path; its note reports an
 * upstream change to a file that was already removed locally.
 */
export type MergeResult =
  | { action: "keep"; note?: MergeNote }
  | { action: "remove"; note?: MergeNote }
  | { action: "take-theirs"; content: Buffer; mode: number }
  | { action: "add"; content: Buffer; mode: number }
  | { action: "write"; content: Buffer; mode: number }
  | { action: "conflict"; content: Buffer; mode: number }
  | {
      action: "side-file";
      upstream: Buffer;
      upstreamMode: number;
      reason: SideFileReason;
    };

const YOURS_MARKER = "<<<<<<< yours";
const SEPARATOR = "=======";

function modeOf(side: MergeInput): number {
  return side.mode & 0o777;
}

/**
 * Compares content with CRLF treated as LF, so a change of line endings alone
 * is not a change. Bytes that are not decodable text compare exactly.
 */
function sameContent(left: Buffer, right: Buffer): boolean {
  const leftText = textContent(left);
  const rightText = textContent(right);
  if (leftText !== undefined && rightText !== undefined) {
    return toLF(leftText) === toLF(rightText);
  }
  return left.equals(right);
}

/** True when two sides have the same content and permission bits. */
function sameInput(left: MergeInput | undefined, right: MergeInput | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return modeOf(left) === modeOf(right) && sameContent(left.content, right.content);
}

/**
 * Permission bits follow the side whose content wins: the side that changed
 * the mode. When both sides changed it differently, yours wins, because the
 * local file is the one a person reviews and a mode disagreement cannot be
 * written as conflict markers.
 */
function mergedMode(base: MergeInput, yours: MergeInput, theirs: MergeInput): number {
  const baseMode = modeOf(base);
  const yoursMode = modeOf(yours);
  const theirsMode = modeOf(theirs);

  if (yoursMode === theirsMode) return yoursMode;
  if (yoursMode === baseMode) return theirsMode;
  return yoursMode;
}

/**
 * Lines keep their terminator, so joining them restores the file exactly,
 * including whether its last line ends with a newline.
 */
function splitLines(text: string): string[] {
  return toLF(text).match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** Ends a conflict section on its own line, which a missing final newline does not. */
function section(lines: readonly string[]): string {
  const text = lines.join("");
  return text === "" || text.endsWith("\n") ? text : `${text}\n`;
}

/** Merges text line by line, adding a marker block wherever changes overlap. */
function mergeText(
  baseText: string,
  yoursText: string,
  theirsText: string,
  labels: MergeLabels,
  mode: number,
): MergeResult {
  const regions = diff3Merge(splitLines(yoursText), splitLines(baseText), splitLines(theirsText));

  let content = "";
  let conflict = false;

  for (const region of regions) {
    if (region.conflict === undefined) {
      content += (region.ok ?? []).join("");
      continue;
    }

    conflict = true;
    const overlapping = region.conflict;
    content += `${YOURS_MARKER}\n${section(overlapping.a)}`;
    content += `||||||| base ${labels.base}\n${section(overlapping.o)}`;
    content += `${SEPARATOR}\n${section(overlapping.b)}`;
    content += `>>>>>>> upstream ${labels.upstream}\n`;
  }

  return { action: conflict ? "conflict" : "write", content: Buffer.from(content), mode };
}

/** Row 5 and the binary fallback: yours and theirs both changed differently. */
function mergeChanges(
  base: MergeInput,
  yours: MergeInput,
  theirs: MergeInput,
  labels: MergeLabels,
): MergeResult {
  const mode = mergedMode(base, yours, theirs);

  // Only the mode differs, so there is no line conflict to render and no
  // reason to write a side file holding the same bytes.
  if (sameContent(yours.content, theirs.content)) {
    return { action: "write", content: yours.content, mode };
  }

  const baseText = textContent(base.content);
  const yoursText = textContent(yours.content);
  const theirsText = textContent(theirs.content);
  if (baseText === undefined || yoursText === undefined || theirsText === undefined) {
    return {
      action: "side-file",
      upstream: theirs.content,
      upstreamMode: modeOf(theirs),
      reason: "binary",
    };
  }

  return mergeText(baseText, yoursText, theirsText, labels, mode);
}

/**
 * Without a base, every difference between yours and theirs is a conflict.
 * There is nothing to compare against, so a text conflict has no base section.
 * A path only one side has is a conflict too: without a base, a local removal
 * and an upstream addition cannot be told apart, so neither is assumed.
 */
function mergeWithoutBase(
  yours: MergeInput | undefined,
  theirs: MergeInput | undefined,
  labels: MergeLabels,
): MergeResult {
  if (yours === undefined) {
    if (theirs === undefined) return { action: "remove" };
    // Keep the path absent, as the local version had it, and hand theirs to a
    // side file so nothing upstream is lost.
    return {
      action: "side-file",
      upstream: theirs.content,
      upstreamMode: modeOf(theirs),
      reason: "base-unavailable",
    };
  }
  if (theirs === undefined) {
    // Keep yours: without a base there is no way to tell an upstream removal
    // from a file only the local factory has. A removal has no content, so
    // there is nothing to write to a side file.
    return { action: "keep", note: "base-unavailable" };
  }
  if (sameInput(yours, theirs)) return { action: "keep" };

  const yoursText = textContent(yours.content);
  const theirsText = textContent(theirs.content);
  if (yoursText === undefined || theirsText === undefined) {
    return {
      action: "side-file",
      upstream: theirs.content,
      upstreamMode: modeOf(theirs),
      reason: "binary",
    };
  }

  const content =
    `${YOURS_MARKER}\n${section(splitLines(yoursText))}` +
    `${SEPARATOR}\n${section(splitLines(theirsText))}` +
    `>>>>>>> upstream ${labels.upstream}\n`;
  return { action: "conflict", content: Buffer.from(content), mode: modeOf(yours) };
}

/**
 * Applies the merge table to one path.
 *
 * `base`, `yours` and `theirs` are absent when the path does not exist on that
 * side. Text is merged line by line; a binary conflict keeps yours and returns
 * theirs for a `<file>.upstream` side file. A changed permission bit alone
 * counts as a change.
 */
export function mergePath(
  base: MergeInput | undefined,
  yours: MergeInput | undefined,
  theirs: MergeInput | undefined,
  labels: MergeLabels,
  options: MergeOptions = {},
): MergeResult {
  if (options.baseUnavailable === true) return mergeWithoutBase(yours, theirs, labels);

  // Removed locally: keep it removed, and report an upstream change.
  if (yours === undefined) {
    if (theirs === undefined) return { action: "remove" };
    if (base === undefined) return { action: "add", content: theirs.content, mode: modeOf(theirs) };
    if (sameInput(base, theirs)) return { action: "remove" };
    return { action: "remove", note: "upstream-changed-removed" };
  }

  // New locally: no upstream file to merge with.
  if (base === undefined) {
    if (theirs === undefined) return { action: "keep" };
    if (sameInput(yours, theirs)) return { action: "keep" };
    return {
      action: "side-file",
      upstream: theirs.content,
      upstreamMode: modeOf(theirs),
      reason: "new-local",
    };
  }

  // Removed upstream: an unchanged local file goes; a changed one stays.
  if (theirs === undefined) {
    if (sameInput(base, yours)) return { action: "remove" };
    return { action: "keep", note: "upstream-removed" };
  }

  const yoursChanged = !sameInput(base, yours);
  const theirsChanged = !sameInput(base, theirs);

  if (!yoursChanged) {
    if (!theirsChanged) return { action: "keep" };
    return { action: "take-theirs", content: theirs.content, mode: modeOf(theirs) };
  }
  if (!theirsChanged) return { action: "keep" };
  if (sameInput(yours, theirs)) return { action: "keep" };

  return mergeChanges(base, yours, theirs, labels);
}
