import { describe, expect, test } from "vitest";
import { SKILL_DIRECTORIES } from "../../../src/core/check/drift.js";
import { destinations } from "../../../src/core/config/destinations.js";
import { TARGETS } from "../../../src/core/config/types.js";

describe("SKILL_DIRECTORIES", () => {
  // A target added with a new directory is covered without editing check.
  // The message itself is asserted in check.test.ts, both directions.
  test("is the directory of every target", () => {
    expect(SKILL_DIRECTORIES).toEqual(
      destinations([...TARGETS]).map((destination) => destination.directory),
    );
  });
});
