/** One field of a five-field cron, with the range the spec gives it. */
export interface CronField {
  name: string;
  min: number;
  max: number;
}

export const CRON_FIELDS: readonly CronField[] = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day of month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day of week", min: 0, max: 7 },
];

const NUMBER = /^\d+$/;
const RANGE = /^(\d+)-(\d+)$/;

function outside(value: number, field: CronField): string {
  return `${value} is outside ${field.min}-${field.max}`;
}

/**
 * Why one comma-separated part of a cron field is invalid, in the order the
 * spec lists: the step, then the shape of the part, then its numbers.
 */
function partProblem(part: string, field: CronField): string | undefined {
  const pieces = part.split("/");
  if (pieces.length > 2) return "more than one /step";

  const base = pieces[0]!;
  const step = pieces[1];
  if (step !== undefined && (!NUMBER.test(step) || Number(step) <= 0)) {
    return "the step is not a positive integer";
  }

  if (base === "*") return undefined;

  const range = RANGE.exec(base);
  if (NUMBER.test(base)) {
    const value = Number(base);
    return value < field.min || value > field.max ? outside(value, field) : undefined;
  }
  if (range === null) return "it is not *, a number or a range";

  const start = Number(range[1]);
  const end = Number(range[2]);
  if (start < field.min || start > field.max) return outside(start, field);
  if (end < field.min || end > field.max) return outside(end, field);
  if (start > end) return "the range starts after it ends";
  return undefined;
}

/**
 * The spec's cron grammar: five whitespace-separated fields, each a list of
 * `*`, a number or a range, each optionally followed by `/<positive step>`.
 * Returns the problem, or undefined when the cron is valid.
 */
export function cronProblem(cron: string): string | undefined {
  const trimmed = cron.trim();
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) return `the cron "${trimmed}" is not five fields`;

  for (const [index, field] of CRON_FIELDS.entries()) {
    for (const part of fields[index]!.split(",")) {
      const problem = partProblem(part, field);
      if (problem !== undefined) {
        return `the cron "${trimmed}" has a bad ${field.name} part "${part}": ${problem}`;
      }
    }
  }

  return undefined;
}

/** True when `Intl.DateTimeFormat` accepts `tz` as a time zone. */
export function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
