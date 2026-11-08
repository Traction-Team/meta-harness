import { describe, expect, test } from "vitest";
import { FAB_FETCH_FORMAT, VERBATIM_ATTRIBUTES } from "../../../src/core/sources/git.js";

/**
 * The fetch cache key is derived from the export format, so changing either
 * string silently orphans every cached fab. These literals are the values from
 * before Plan 1.018 moved the helpers; a change here must be deliberate.
 */
describe("git fetch format", () => {
  test("keeps the verbatim attribute rules byte for byte", () => {
    expect(VERBATIM_ATTRIBUTES).toBe(
      "* -text -eol -filter -ident -working-tree-encoding -export-subst -export-ignore\n",
    );
  });

  test("keeps the fetch cache-key segment", () => {
    expect(FAB_FETCH_FORMAT).toBe("git-verbatim-aaf098a96df3");
  });
});
