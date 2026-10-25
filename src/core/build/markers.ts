import { toLF } from "../../util/text.js";

export interface MarkerLines {
  start: string;
  end: string;
}

export interface MarkerProblem {
  line: number;
  message: string;
  fix: string;
}

export interface MarkerRange {
  /** Zero-based index of the start marker line. */
  start: number;
  /** Zero-based index of the end marker line. */
  end: number;
}

export type MarkerFindResult =
  | { ok: true; range?: MarkerRange }
  | { ok: false; problem: MarkerProblem };

export type MarkerResult =
  | { ok: true; text: string; changed: boolean }
  | { ok: false; problem: MarkerProblem };

function problem(line: number, message: string, fix: string): { ok: false; problem: MarkerProblem } {
  return { ok: false, problem: { line, message, fix } };
}

function scan(lines: string[], markers: MarkerLines): MarkerFindResult {
  const starts: number[] = [];
  const ends: number[] = [];

  for (const [index, line] of lines.entries()) {
    if (line === markers.start) starts.push(index);
    if (line === markers.end) ends.push(index);
  }

  if (starts.length === 0 && ends.length === 0) return { ok: true };
  if (starts.length === 0) {
    const line = ends[0]!;
    return problem(
      line + 1,
      "Found an end marker without a start marker",
      `Add "${markers.start}" above it or remove the end marker`,
    );
  }
  if (ends.length === 0) {
    const line = starts[0]!;
    return problem(
      line + 1,
      "Found a start marker without an end marker",
      `Add "${markers.end}" after it or remove the start marker`,
    );
  }
  if (starts.length > 1) {
    const line = starts[1]!;
    return problem(
      line + 1,
      "Found two start markers",
      `Keep one "${markers.start}" marker and remove the other`,
    );
  }
  if (ends.length > 1) {
    const line = ends[1]!;
    return problem(
      line + 1,
      "Found two end markers",
      `Keep one "${markers.end}" marker and remove the other`,
    );
  }

  const start = starts[0]!;
  const end = ends[0]!;
  if (end < start) {
    return problem(
      end + 1,
      "The end marker comes before the start marker",
      `Move "${markers.end}" below "${markers.start}"`,
    );
  }

  return { ok: true, range: { start, end } };
}

function blockLines(markers: MarkerLines, content: string): string[] {
  const body = toLF(content).replace(/\n+$/, "");
  const bodyLines = body === "" ? [] : body.split("\n");
  return [markers.start, ...bodyLines, markers.end];
}

export function findMarkerBlock(text: string, markers: MarkerLines): MarkerFindResult {
  return scan(toLF(text).split("\n"), markers);
}

export function appendMarkerBlock(
  text: string,
  markers: MarkerLines,
  content: string,
): MarkerResult {
  const source = toLF(text);
  const found = scan(source.split("\n"), markers);
  if (!found.ok) return found;
  if (found.range !== undefined) {
    return problem(
      found.range.start + 1,
      "Found a marker block where none was expected",
      "Remove the existing block before appending a new one",
    );
  }

  const block = blockLines(markers, content).join("\n");
  const base = source.replace(/\n+$/, "");
  const next = base === "" ? `${block}\n` : `${base}\n\n${block}\n`;
  return { ok: true, text: next, changed: next !== source };
}

export function replaceMarkerBlock(
  text: string,
  markers: MarkerLines,
  content: string,
): MarkerResult {
  const source = toLF(text);
  const lines = source.split("\n");
  const found = scan(lines, markers);
  if (!found.ok) return found;
  if (found.range === undefined) {
    return problem(1, "Found no marker block to replace", `Add "${markers.start}" and "${markers.end}"`);
  }

  const nextLines = [
    ...lines.slice(0, found.range.start),
    ...blockLines(markers, content),
    ...lines.slice(found.range.end + 1),
  ];
  const next = nextLines.join("\n");
  return { ok: true, text: next, changed: next !== source };
}

function removeSeparatorBlank(lines: string[], index: number): void {
  if (lines[index] !== "") return;

  const before = lines[index - 1];
  const after = lines[index + 1];
  const joinsNonBlank =
    before !== undefined && after !== undefined && before.trim() !== "" && after.trim() !== "";
  if (!joinsNonBlank) lines.splice(index, 1);
}

export function removeMarkerBlock(text: string, markers: MarkerLines): MarkerResult {
  const source = toLF(text);
  const lines = source.split("\n");
  const found = scan(lines, markers);
  if (!found.ok) return found;
  if (found.range === undefined) {
    return { ok: true, text: source, changed: false };
  }

  const { start, end } = found.range;
  const nextLines = [...lines.slice(0, start), ...lines.slice(end + 1)];

  if (nextLines[start - 1] === "" && nextLines[start] === "") {
    removeSeparatorBlank(nextLines, start);
  }
  if (start === 0 && nextLines[0] === "") {
    removeSeparatorBlank(nextLines, 0);
  }

  const next = nextLines.every((line) => line.trim() === "") ? "" : nextLines.join("\n");
  return { ok: true, text: next, changed: next !== source };
}
