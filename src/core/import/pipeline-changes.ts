import { parseFactoryYaml } from "../factory/index.js";

interface PipelineSnapshot {
  names: string[];
  stops: Map<string, string | undefined>;
}

function pipelineOf(text: string | undefined): PipelineSnapshot | undefined {
  if (text === undefined) return { names: [], stops: new Map() };
  const parsed = parseFactoryYaml(text, "factory.yaml");
  if (parsed.problems.length > 0) return undefined;
  const snapshot: PipelineSnapshot = { names: [], stops: new Map() };
  for (const entry of parsed.pipeline ?? []) {
    snapshot.names.push(entry.workflow);
    snapshot.stops.set(entry.workflow, entry.stop);
  }
  return snapshot;
}

function at(grid: number[][], row: number, column: number): number {
  return grid[row]?.[column] ?? 0;
}

/** Indices in `after` of one longest common subsequence of the two name lists. */
function lcsIndices(before: string[], after: string[]): Set<number> {
  const rows = before.length;
  const columns = after.length;
  const grid: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(columns + 1).fill(0));

  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      grid[row]![column] =
        before[row] === after[column]
          ? at(grid, row + 1, column + 1) + 1
          : Math.max(at(grid, row + 1, column), at(grid, row, column + 1));
    }
  }

  const kept = new Set<number>();
  let row = 0;
  let column = 0;
  while (row < rows && column < columns) {
    if (before[row] === after[column]) {
      kept.add(column);
      row += 1;
      column += 1;
    } else if (at(grid, row + 1, column) >= at(grid, row, column + 1)) {
      row += 1;
    } else {
      column += 1;
    }
  }
  return kept;
}

function positionIn(names: string[], index: number): string {
  const previous = index === 0 ? undefined : names[index - 1];
  return previous === undefined ? "at the start" : `after ${previous}`;
}

/**
 * Describe changes to the `pipeline` list of `factory.yaml` in words, such as
 * `pipeline: finish-slice added after review-slice`.
 *
 * Returns no descriptions when either side cannot be parsed, or when the
 * pipeline did not change; the caller then falls back to line counts.
 */
export function describePipelineChanges(before: string | undefined, after: string | undefined): string[] {
  const previous = pipelineOf(before);
  const next = pipelineOf(after);
  if (previous === undefined || next === undefined) return [];

  const beforeNames = new Set(previous.names);
  const afterNames = new Set(next.names);
  const kept = lcsIndices(previous.names, next.names);
  const descriptions: string[] = [];

  next.names.forEach((name, index) => {
    const position = positionIn(next.names, index);
    if (!beforeNames.has(name)) {
      descriptions.push(`pipeline: ${name} added ${position}`);
      return;
    }
    if (!kept.has(index)) {
      descriptions.push(
        index === 0 ? `pipeline: ${name} moved to the start` : `pipeline: ${name} moved ${position}`,
      );
      return;
    }
    if (previous.stops.get(name) !== next.stops.get(name)) {
      descriptions.push(`pipeline: ${name} stop changed`);
    }
  });

  for (const name of previous.names) {
    if (!afterNames.has(name)) descriptions.push(`pipeline: ${name} removed`);
  }

  return descriptions;
}
