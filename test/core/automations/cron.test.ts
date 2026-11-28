import { describe, expect, test } from "vitest";
import { CRON_FIELDS, cronProblem, validTimeZone } from "../../../src/core/automations/cron.js";

describe("cronProblem", () => {
  test.each(["0 8 * * 1,4", "0 9 * * 1-5", "*/15 9-17 1,15 * *", "30 7 1 12 0", "0 8 * * 7"])(
    "accepts %s",
    (cron) => {
      expect(cronProblem(cron)).toBeUndefined();
    },
  );

  test("reports a cron that is not five fields", () => {
    expect(cronProblem("0 8 * *")).toBe('the cron "0 8 * *" is not five fields');
  });

  test("reports a number outside its field", () => {
    expect(cronProblem("99 8 * * 1")).toBe(
      'the cron "99 8 * * 1" has a bad minute part "99": 99 is outside 0-59',
    );
  });

  test("reports a step that is not a positive integer", () => {
    expect(cronProblem("0 8 * * */0")).toBe(
      'the cron "0 8 * * */0" has a bad day of week part "*/0": the step is not a positive integer',
    );
  });

  test("reports an empty part as not a number", () => {
    expect(cronProblem("0 8 * * ,")).toBe(
      'the cron "0 8 * * ," has a bad day of week part "": it is not *, a number or a range',
    );
  });

  test("reports a range that starts after it ends", () => {
    expect(cronProblem("0 8 * * 5-2")).toBe(
      'the cron "0 8 * * 5-2" has a bad day of week part "5-2": the range starts after it ends',
    );
  });

  test("reports more than one step", () => {
    expect(cronProblem("0 8 * * 1/2/3")).toBe(
      'the cron "0 8 * * 1/2/3" has a bad day of week part "1/2/3": more than one /step',
    );
  });

  test("reads the cron with its whitespace collapsed", () => {
    expect(cronProblem("  0   8 * * 1,4 ")).toBeUndefined();
    expect(cronProblem("0  8 * *")).toBe('the cron "0  8 * *" is not five fields');
  });

  test("names each field with the range the spec gives it", () => {
    expect(CRON_FIELDS.map((field) => [field.name, field.min, field.max])).toEqual([
      ["minute", 0, 59],
      ["hour", 0, 23],
      ["day of month", 1, 31],
      ["month", 1, 12],
      ["day of week", 0, 7],
    ]);
  });
});

describe("validTimeZone", () => {
  test("accepts an IANA zone", () => {
    expect(validTimeZone("Australia/Sydney")).toBe(true);
    expect(validTimeZone("UTC")).toBe(true);
  });

  test("rejects a zone Intl does not know", () => {
    expect(validTimeZone("Mars/Olympus")).toBe(false);
  });
});
