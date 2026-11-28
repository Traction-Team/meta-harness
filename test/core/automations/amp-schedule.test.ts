import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ampSchedule, firstInstant, planAmp } from "../../../src/core/automations/amp-schedule.js";
import type { DesiredEntry } from "../../../src/core/automations/desired.js";
import { MetafabError } from "../../../src/errors.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";

const SYDNEY = "Australia/Sydney";

/** Monday 23 November 2026, 09:00 in Sydney. */
const MONDAY = new Date("2026-11-22T22:00:00Z");

function schedule(cron: string, tz: string, now: Date): { schedule: string; label: string } {
  const result = ampSchedule(cron, tz, now);
  if ("reason" in result) throw new Error(`ampSchedule refused: ${result.reason}`);
  return result;
}

function reason(cron: string, tz: string, now: Date): string {
  const result = ampSchedule(cron, tz, now);
  if (!("reason" in result)) throw new Error(`ampSchedule accepted: ${result.schedule}`);
  return result.reason;
}

/** The wall clock a `DTSTART` stamp names, so a test can read it back. */
function stampWallClock(scheduleText: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const match = /^DTSTART;TZID=[^:]+:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})00\n/.exec(scheduleText);
  if (match === null) throw new Error(`no DTSTART in ${scheduleText}`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

describe("ampSchedule", () => {
  test("writes the first allowed day in the zone, not the UTC day", () => {
    const result = schedule("0 8 * * 1,4", SYDNEY, MONDAY);

    // Monday 09:00 has passed 08:00, so the first firing is Thursday 26 November.
    expect(result.schedule).toBe(
      "DTSTART;TZID=Australia/Sydney:20261126T080000\n" +
        "RRULE:FREQ=WEEKLY;BYDAY=MO,TH;BYHOUR=8;BYMINUTE=0",
    );
    expect(result.label).toBe("Mondays and Thursdays, 8:00 AM Australia/Sydney");
  });

  test("writes a range of weekdays once each, in MO TU WE TH FR SA SU order", () => {
    const result = schedule("0 9 * * 1-5", SYDNEY, MONDAY);

    expect(result.schedule).toBe(
      "DTSTART;TZID=Australia/Sydney:20261123T090000\n" +
        "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0",
    );
    expect(result.label).toBe("Weekdays, 9:00 AM Australia/Sydney");
  });

  test("writes several times of day as one daily rule", () => {
    const result = schedule("0 7,19 * * *", SYDNEY, MONDAY);

    expect(result.schedule).toBe(
      "DTSTART;TZID=Australia/Sydney:20261123T190000\n" +
        "RRULE:FREQ=DAILY;BYHOUR=7,19;BYMINUTE=0",
    );
    expect(result.label).toBe("Every day, 7:00 AM and 7:00 PM Australia/Sydney");
  });

  test("writes Sunday once whether the cron says 0 or 7", () => {
    const result = schedule("0 8 * * 0,7", SYDNEY, MONDAY);

    expect(result.schedule).toBe(
      "DTSTART;TZID=Australia/Sydney:20261129T080000\n" +
        "RRULE:FREQ=WEEKLY;BYDAY=SU;BYHOUR=8;BYMINUTE=0",
    );
    expect(result.label).toBe("Sundays, 8:00 AM Australia/Sydney");
  });

  test("names Saturday and Sunday as the weekend", () => {
    const result = schedule("0 8 * * 6,0", SYDNEY, MONDAY);

    expect(result.schedule).toContain("RRULE:FREQ=WEEKLY;BYDAY=SA,SU;");
    expect(result.label).toBe("Weekends, 8:00 AM Australia/Sydney");
  });

  test("reads midnight and noon on a 12-hour clock", () => {
    expect(schedule("0 0,12 * * *", SYDNEY, MONDAY).label).toBe(
      "Every day, 12:00 AM and 12:00 PM Australia/Sydney",
    );
  });

  test("skips a wall-clock time that the spring-forward change skips", () => {
    // 2026-10-04 01:00 in Sydney: the zone jumps from 02:00 to 03:00 that day.
    const now = new Date("2026-10-03T15:00:00Z");

    expect(stampWallClock(schedule("30 2 * * *", SYDNEY, now).schedule)).toEqual({
      year: 2026,
      month: 10,
      day: 5,
      hour: 2,
      minute: 30,
    });
    // A weekly time whose only day in the next seven is skipped fires a week on.
    expect(stampWallClock(schedule("30 2 * * 0", SYDNEY, now).schedule)).toEqual({
      year: 2026,
      month: 10,
      day: 11,
      hour: 2,
      minute: 30,
    });
  });

  test("refuses a cron Amp cannot express, with the reason", () => {
    expect(reason("* * * * *", SYDNEY, MONDAY)).toBe(
      'its minute "*" is not a single number or a comma list of numbers',
    );
    expect(reason("0 8 1 * *", SYDNEY, MONDAY)).toBe(
      'its day of month "1" must be *, because an Amp schedule repeats by day of the week, not by date',
    );
    expect(reason("0 8 * 12 *", SYDNEY, MONDAY)).toBe(
      'its month "12" must be *, because an Amp schedule repeats all year',
    );
    expect(reason("0 8 * * */2", SYDNEY, MONDAY)).toBe(
      'its day of week "*/2" has "*/2", which is not a day or a range of days',
    );
    expect(reason("0 8 * * 1,4,9", SYDNEY, MONDAY)).toBe(
      'its day of week "1,4,9" has a day outside 0-7, where 0 and 7 are both Sunday',
    );
    expect(reason("0 8 * * 5-3", SYDNEY, MONDAY)).toBe(
      'its day of week "5-3" has the range "5-3", which starts after it ends',
    );
    expect(reason("0 8 * *", SYDNEY, MONDAY)).toBe("it is not five cron fields");
    expect(reason("0 24 * * *", SYDNEY, MONDAY)).toBe(
      'its hour "24" has 24, which is outside 0-23',
    );
  });

  test("refuses a zone Intl does not know", () => {
    expect(reason("0 8 * * *", "Not/AZone", MONDAY)).toBe('"Not/AZone" is not an IANA time zone');
  });

  test("keeps the next firing when now is past today's time by seconds", () => {
    // 09:00:30.500 in Sydney: today's 09:00:00 is before now.
    const now = new Date("2026-11-22T22:00:30.500Z");

    expect(stampWallClock(schedule("0 9 * * *", SYDNEY, now).schedule)).toEqual({
      year: 2026,
      month: 11,
      day: 24,
      hour: 9,
      minute: 0,
    });
  });

  test("takes the first occurrence of a wall-clock time the fall-back change repeats", () => {
    // Sydney repeats 02:00-02:59 on 5 April 2026: 02:30 is 15:30Z and then 16:30Z.
    const first = new Date("2026-04-04T15:15:00Z");
    const repeated = schedule("30 2 * * *", SYDNEY, first);
    expect(repeated.schedule.startsWith("DTSTART;TZID=Australia/Sydney:20260405T023000\n")).toBe(
      true,
    );

    const instant = firstInstant(stampWallClock(repeated.schedule), SYDNEY);
    expect(instant).toBe(Date.parse("2026-04-04T15:30:00Z"));
    expect(instant! >= first.getTime()).toBe(true);

    // Between the two 02:30s the first occurrence has passed, so the next day is first.
    const between = new Date("2026-04-04T15:45:00Z");
    expect(stampWallClock(schedule("30 2 * * *", SYDNEY, between).schedule)).toEqual({
      year: 2026,
      month: 4,
      day: 6,
      hour: 2,
      minute: 30,
    });

    // A minute that has not come round yet that night still fires first.
    expect(stampWallClock(schedule("0,30 2 * * *", SYDNEY, first).schedule)).toEqual({
      year: 2026,
      month: 4,
      day: 5,
      hour: 2,
      minute: 30,
    });
  });
});

describe("firstInstant", () => {
  test("returns the earliest instant of a repeated wall clock and none of a skipped one", () => {
    expect(firstInstant({ year: 2026, month: 4, day: 5, hour: 2, minute: 30 }, SYDNEY)).toBe(
      Date.parse("2026-04-04T15:30:00Z"),
    );
    expect(firstInstant({ year: 2026, month: 10, day: 4, hour: 2, minute: 30 }, SYDNEY)).toBe(
      undefined,
    );
    expect(firstInstant({ year: 2026, month: 11, day: 26, hour: 8, minute: 0 }, SYDNEY)).toBe(
      Date.parse("2026-11-25T21:00:00Z"),
    );
  });
});

function desired(name: string, overrides: Partial<DesiredEntry> = {}): DesiredEntry {
  return {
    name,
    title: `automation: ${name}`,
    cron: "0 8 * * 1,4",
    tz: SYDNEY,
    checkout: "worktree",
    stub: `Run the factory automation \`${name}\` from the \`dragonfly\` factory.\n\n1. Do it.\n`,
    ...overrides,
  };
}

describe("planAmp", () => {
  test("builds one entry per automation, with a fresh run and the stub trimmed", () => {
    const entries = planAmp([desired("intake")], MONDAY);

    expect(entries).toEqual([
      {
        name: "intake",
        title: "automation: intake",
        schedule:
          "DTSTART;TZID=Australia/Sydney:20261126T080000\n" +
          "RRULE:FREQ=WEEKLY;BYDAY=MO,TH;BYHOUR=8;BYMINUTE=0",
        schedule_label: "Mondays and Thursdays, 8:00 AM Australia/Sydney",
        run_mode: "fresh",
        prompt:
          "Run the factory automation `intake` from the `dragonfly` factory.\n\n1. Do it.",
      },
    ]);
  });

  test("refuses the whole set when one automation cannot be expressed", () => {
    let failure: unknown;
    try {
      planAmp([desired("intake"), desired("dated", { cron: "0 8 1 * *" })], MONDAY);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(MetafabError);
    const error = failure as MetafabError;
    expect(error.exitCode).toBe(1);
    expect(error.problems?.map((problem) => problem.message)).toEqual([
      'dated cannot be expressed in Amp: its day of month "1" must be *, because an Amp schedule repeats by day of the week, not by date',
    ]);
  });
});

const FACTORY_YAML = "format: 2\nname: dragonfly\n";

function automationFile(cron: string): string {
  return [
    "---",
    'owner: "*"',
    "triggers:",
    `  - schedule: { cron: "${cron}", tz: ${SYDNEY} }`,
    "---",
    "",
    "Triage the backlog.",
    "",
  ].join("\n");
}

const repos: TempRepo[] = [];
let savedEnvironment: [string, string | undefined][] = [];

beforeEach(() => {
  savedEnvironment = Object.entries(process.env).filter(
    ([key]) => key.toUpperCase().startsWith("FACTORY_ENV_") || key === "AMP_USER_EMAIL",
  );
  for (const [key] of savedEnvironment) delete process.env[key];
});

afterEach(async () => {
  for (const [key, value] of savedEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnvironment = [];
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

async function automationRepo(cron = "0 8 * * 1,4"): Promise<TempRepo> {
  const repo = await makeRepo({
    ".factory/factory.yaml": FACTORY_YAML,
    ".factory/automations/intake/automation.md": automationFile(cron),
  });
  repos.push(repo);
  return repo;
}

describe("metafab automations plan amp", () => {
  test("prints the desired set for AMP_USER_EMAIL as JSON", async () => {
    process.env.AMP_USER_EMAIL = "person@example.com";
    const repo = await automationRepo();

    const result = await runCli(["automations", "plan", "amp", "--branch", "main", "--json"], {
      cwd: repo.root,
    });

    expect(result.code).toBe(0);
    const json = JSON.parse(result.stdout) as {
      ok: boolean;
      account: string;
      entries: {
        name: string;
        title: string;
        schedule: string;
        schedule_label: string;
        run_mode: string;
        prompt: string;
      }[];
    };
    expect(json.ok).toBe(true);
    expect(json.account).toBe("person@example.com");
    expect(json.entries).toHaveLength(1);

    const [entry] = json.entries;
    expect(entry!.name).toBe("intake");
    expect(entry!.title).toBe("automation: intake");
    // The clock decides the stamp; every entry still names the zone.
    expect(entry!.schedule).toMatch(
      /^DTSTART;TZID=Australia\/Sydney:\d{8}T080000\nRRULE:FREQ=WEEKLY;BYDAY=MO,TH;BYHOUR=8;BYMINUTE=0$/,
    );
    expect(entry!.schedule_label).toBe("Mondays and Thursdays, 8:00 AM Australia/Sydney");
    expect(entry!.run_mode).toBe("fresh");
    expect(entry!.prompt).toContain("automations prompt intake --target amp");
    expect(entry!.prompt).toBe(entry!.prompt.trimEnd());
  });

  test("exits 1 without AMP_USER_EMAIL, saying this is not an Amp thread", async () => {
    const repo = await automationRepo();

    const result = await runCli(["automations", "plan", "amp", "--branch", "main"], {
      cwd: repo.root,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "The Amp account is unknown: AMP_USER_EMAIL is not set, so this is not an Amp thread",
    );
  });

  test("refuses a cron Amp cannot express, naming the automation and the reason", async () => {
    process.env.AMP_USER_EMAIL = "person@example.com";
    const repo = await automationRepo("0 8 1 * *");

    const result = await runCli(["automations", "plan", "amp", "--branch", "main"], {
      cwd: repo.root,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      'intake cannot be expressed in Amp: its day of month "1" must be *, because an Amp schedule repeats by day of the week, not by date',
    );
  });
});
