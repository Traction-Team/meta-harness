import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { validTimeZone } from "./cron.js";
import type { DesiredEntry } from "./desired.js";

/** A wall-clock time in a zone, without an offset. */
export interface WallClock {
  year: number;
  /** 1-12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** What one automation's cron becomes in Amp. */
export interface AmpSchedule {
  /** The `DTSTART` line, a newline, and the `RRULE` line. */
  schedule: string;
  /** The days and times in words, ending with the zone. */
  label: string;
}

/** One entry of the set `plan amp` prints, as the `metafab-automations` skill applies it. */
export interface AmpEntry {
  name: string;
  title: string;
  schedule: string;
  schedule_label: string;
  run_mode: "fresh";
  prompt: string;
}

/** Amp's day codes, indexed by a cron day number mod 7: 0 is Sunday. */
const DAY_CODES: readonly string[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Every day code, in the order an `RRULE` and a label list them. */
const DAY_ORDER: readonly string[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

const DAY_NAMES: Record<string, string> = {
  MO: "Mondays",
  TU: "Tuesdays",
  WE: "Wednesdays",
  TH: "Thursdays",
  FR: "Fridays",
  SA: "Saturdays",
  SU: "Sundays",
};

const DAY_MS = 24 * 60 * 60 * 1000;

type Parsed<T> = { value: T } | { reason: string };

function clock(tz: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function part(parts: Intl.DateTimeFormatPart[], type: string): number {
  return Number(parts.find((candidate) => candidate.type === type)?.value ?? "0");
}

/** What the zone's clock reads at `instant`. */
function wallClockAt(instant: number, format: Intl.DateTimeFormat): WallClock & { second: number } {
  const parts = format.formatToParts(new Date(instant));
  return {
    year: part(parts, "year"),
    month: part(parts, "month"),
    day: part(parts, "day"),
    hour: part(parts, "hour"),
    minute: part(parts, "minute"),
    second: part(parts, "second"),
  };
}

function sameWallClock(left: WallClock, right: WallClock): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

/** The zone's offset from UTC at `instant`, in milliseconds. */
function offsetAt(instant: number, format: Intl.DateTimeFormat): number {
  const at = Math.floor(instant / 1000) * 1000;
  const wall = wallClockAt(at, format);
  return (
    Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) - at
  );
}

/**
 * The earliest instant whose zone clock reads `wall`, or undefined when the
 * zone skips that wall clock. It is the reading RFC 5545 gives a `TZID` time
 * that a fall-back change repeats: the first occurrence.
 *
 * It tries the zone's offsets a day before and a day after the time, keeps
 * those that read back exactly, and returns the smallest.
 */
export function firstInstant(wall: WallClock, tz: string): number | undefined {
  const format = clock(tz);
  const base = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);
  const offsets = new Set<number>();
  for (const delta of [-DAY_MS, DAY_MS]) offsets.add(offsetAt(base + delta, format));

  let earliest: number | undefined;
  for (const offset of offsets) {
    const instant = base - offset;
    if (!sameWallClock(wallClockAt(instant, format), wall)) continue;
    if (earliest === undefined || instant < earliest) earliest = instant;
  }
  return earliest;
}

/** One number or a comma list of numbers inside the field's range, deduplicated and sorted. */
function plainNumbers(
  text: string,
  field: "minute" | "hour",
  min: number,
  max: number,
): Parsed<number[]> {
  const values = new Set<number>();
  for (const part of text.split(",")) {
    if (!/^\d+$/.test(part)) {
      return { reason: `its ${field} "${text}" is not a single number or a comma list of numbers` };
    }
    const value = Number(part);
    if (value < min || value > max) {
      return { reason: `its ${field} "${text}" has ${value}, which is outside ${min}-${max}` };
    }
    values.add(value);
  }
  return { value: [...values].sort((left, right) => left - right) };
}

/**
 * The day codes a cron day-of-week field names, in `MO TU WE TH FR SA SU`
 * order: `*` is every day, and a part is a day or a range of days.
 */
function dayCodes(text: string): Parsed<string[]> {
  if (text === "*") return { value: [...DAY_ORDER] };

  const days = new Set<number>();
  for (const part of text.split(",")) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range !== null) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > 7 || end > 7) {
        return {
          reason: `its day of week "${text}" has a day outside 0-7, where 0 and 7 are both Sunday`,
        };
      }
      if (start > end) {
        return {
          reason: `its day of week "${text}" has the range "${part}", which starts after it ends`,
        };
      }
      for (let day = start; day <= end; day += 1) days.add(day % 7);
      continue;
    }

    if (!/^\d+$/.test(part)) {
      return {
        reason: `its day of week "${text}" has "${part}", which is not a day or a range of days`,
      };
    }
    const day = Number(part);
    if (day > 7) {
      return {
        reason: `its day of week "${text}" has a day outside 0-7, where 0 and 7 are both Sunday`,
      };
    }
    days.add(day % 7);
  }

  return {
    value: DAY_ORDER.filter((code) => days.has(DAY_CODES.indexOf(code))),
  };
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function timeOf(hour: number, minute: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function daysOf(codes: readonly string[]): string {
  if (codes.length === DAY_ORDER.length) return "Every day";
  const set = new Set(codes);
  if (codes.length === 5 && ["MO", "TU", "WE", "TH", "FR"].every((code) => set.has(code))) {
    return "Weekdays";
  }
  if (codes.length === 2 && set.has("SA") && set.has("SU")) return "Weekends";
  return joinList(codes.map((code) => DAY_NAMES[code]!));
}

function labelOf(codes: readonly string[], hours: number[], minutes: number[], tz: string): string {
  const times: string[] = [];
  for (const hour of hours) for (const minute of minutes) times.push(timeOf(hour, minute));
  return `${daysOf(codes)}, ${joinList(times)} ${tz}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/**
 * The schedule Amp holds for one cron in one zone, or the reason it cannot
 * express it. `now` decides which firing `DTSTART` names: the first one at or
 * after now, looking 15 days ahead so a weekly time that a spring-forward
 * change skips fires a week later.
 */
export function ampSchedule(cron: string, tz: string, now: Date): AmpSchedule | { reason: string } {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return { reason: "it is not five cron fields" };
  const [minuteText, hourText, dayOfMonth, month, dayOfWeek] = fields as [
    string,
    string,
    string,
    string,
    string,
  ];

  const minutes = plainNumbers(minuteText, "minute", 0, 59);
  if ("reason" in minutes) return minutes;
  const hours = plainNumbers(hourText, "hour", 0, 23);
  if ("reason" in hours) return hours;

  if (dayOfMonth !== "*") {
    return {
      reason: `its day of month "${dayOfMonth}" must be *, because an Amp schedule repeats by day of the week, not by date`,
    };
  }
  if (month !== "*") {
    return { reason: `its month "${month}" must be *, because an Amp schedule repeats all year` };
  }

  const codes = dayCodes(dayOfWeek);
  if ("reason" in codes) return codes;

  const rule =
    codes.value.length === DAY_ORDER.length
      ? `FREQ=DAILY;BYHOUR=${hours.value.join(",")};BYMINUTE=${minutes.value.join(",")}`
      : `FREQ=WEEKLY;BYDAY=${codes.value.join(",")};BYHOUR=${hours.value.join(",")};BYMINUTE=${minutes.value.join(",")}`;

  if (!validTimeZone(tz)) return { reason: `"${tz}" is not an IANA time zone` };

  const format = clock(tz);
  const today = wallClockAt(now.getTime(), format);
  const allowed = new Set(codes.value.map((code) => DAY_CODES.indexOf(code)));

  for (let ahead = 0; ahead <= 14; ahead += 1) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + ahead));
    if (!allowed.has(date.getUTCDay())) continue;

    for (const hour of hours.value) {
      for (const minute of minutes.value) {
        const wall = {
          year: date.getUTCFullYear(),
          month: date.getUTCMonth() + 1,
          day: date.getUTCDate(),
          hour,
          minute,
        };
        const instant = firstInstant(wall, tz);
        if (instant === undefined || instant < now.getTime()) continue;

        const stamp = `${pad(wall.year, 4)}${pad(wall.month, 2)}${pad(wall.day, 2)}T${pad(hour, 2)}${pad(minute, 2)}00`;
        return {
          schedule: `DTSTART;TZID=${tz}:${stamp}\nRRULE:${rule}`,
          label: labelOf(codes.value, hours.value, minutes.value, tz),
        };
      }
    }
  }

  return { reason: "no allowed day, hour and minute falls in the fortnight after now" };
}

/**
 * The set `plan amp` prints, one entry per desired automation in name order.
 * One automation Amp cannot express refuses the whole set, naming each one and
 * its reason.
 */
export function planAmp(desired: readonly DesiredEntry[], now: Date): AmpEntry[] {
  const entries: AmpEntry[] = [];
  const problems: Problem[] = [];

  for (const entry of desired) {
    const schedule = ampSchedule(entry.cron, entry.tz, now);
    if ("reason" in schedule) {
      problems.push({
        level: "error",
        file: `.factory/automations/${entry.name}/automation.md`,
        message: `${entry.name} cannot be expressed in Amp: ${schedule.reason}`,
        fix: "Use plain hours and minutes, * for day of month and month, and days or ranges of days for day of week",
      });
      continue;
    }
    entries.push({
      name: entry.name,
      title: entry.title,
      schedule: schedule.schedule,
      schedule_label: schedule.label,
      run_mode: "fresh",
      prompt: entry.stub.trimEnd(),
    });
  }

  if (problems.length > 0) {
    throw new MetafabError("The automations cannot be expressed in Amp", {
      exitCode: ExitCode.Failed,
      code: "amp-schedule",
      problems,
    });
  }
  return entries;
}
