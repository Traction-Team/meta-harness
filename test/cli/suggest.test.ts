import { describe, expect, test } from "vitest";
import { didYouMean, levenshtein, suggest } from "../../src/util/suggest.js";

describe("levenshtein", () => {
  test("computes the classic distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  test("is zero for equal strings", () => {
    expect(levenshtein("review-slice", "review-slice")).toBe(0);
  });

  test("is the length when one side is empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
  });
});

describe("suggest", () => {
  test("suggests the nearest candidate", () => {
    expect(suggest("review-slices", ["review-slice", "review-skill"])).toBe("review-slice");
  });

  test("matches case-insensitively and returns the candidate", () => {
    expect(suggest("Check", ["build", "check"])).toBe("check");
  });

  test("returns nothing for a distant candidate", () => {
    expect(suggest("publish", ["build", "check"])).toBeUndefined();
  });

  test("returns nothing when there are no candidates", () => {
    expect(suggest("build", [])).toBeUndefined();
  });

  test("breaks ties by lexical order", () => {
    expect(suggest("cot", ["cat", "cut"])).toBe("cat");
  });
});

describe("didYouMean", () => {
  test("formats a suggestion", () => {
    expect(didYouMean("buld", ["build", "check"])).toBe('Did you mean "build"?');
  });

  test("returns nothing without a match", () => {
    expect(didYouMean("zzz", ["build"])).toBeUndefined();
  });
});
