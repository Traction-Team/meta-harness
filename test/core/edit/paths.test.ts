import { describe, expect, test } from "vitest";
import { MetafabError } from "../../../src/errors.js";
import {
  deriveFactoryName,
  getSkillNameProblems,
  headingFromName,
  normaliseCreatePath,
} from "../../../src/core/edit/index.js";

function codeOf(action: () => unknown): string | undefined {
  try {
    action();
    return undefined;
  } catch (error) {
    return error instanceof MetafabError ? error.code : undefined;
  }
}

describe("normaliseCreatePath", () => {
  test("returns the segments, relative directory and name", () => {
    expect(normaliseCreatePath("workflows/review-slice")).toEqual({
      segments: ["workflows", "review-slice"],
      relDir: "workflows/review-slice",
      name: "review-slice",
    });
  });

  test("strips .factory/ and normalises separators and empty segments", () => {
    expect(normaliseCreatePath(".factory/workflows//review-slice/")).toEqual({
      segments: ["workflows", "review-slice"],
      relDir: "workflows/review-slice",
      name: "review-slice",
    });
    expect(normaliseCreatePath("review\\security").relDir).toBe("review/security");
    expect(normaliseCreatePath("./review/./security").relDir).toBe("review/security");
  });

  test("accepts a top-level skill", () => {
    expect(normaliseCreatePath(".factory/hotfix")).toEqual({
      segments: ["hotfix"],
      relDir: "hotfix",
      name: "hotfix",
    });
  });

  test.each([
    "",
    "/workflows/review-slice",
    "C:\\workflows\\review-slice",
    "../review-slice",
    "workflows/../review-slice",
    ".factory",
    ".factory/",
  ])("rejects %j", (input) => {
    expect(codeOf(() => normaliseCreatePath(input))).toBe("create-path-invalid");
  });

  test("rejects an invalid skill name", () => {
    expect(codeOf(() => normaliseCreatePath("review/Bad_Name"))).toBe("create-name-invalid");
    expect(codeOf(() => normaliseCreatePath("metafab-review"))).toBe("create-name-invalid");
  });
});

describe("headingFromName", () => {
  test("capitalises the first letter and replaces hyphens with spaces", () => {
    expect(headingFromName("review-slice")).toBe("Review slice");
    expect(headingFromName("build")).toBe("Build");
    expect(headingFromName("3d-model")).toBe("3d model");
  });
});

describe("deriveFactoryName", () => {
  test("derives a factory name from the directory name", () => {
    expect(deriveFactoryName("My Repo!!")).toBe("my-repo");
    expect(deriveFactoryName("metafab")).toBe("metafab");
    expect(deriveFactoryName("!!!")).toBe("factory");
  });
});

describe("getSkillNameProblems", () => {
  test("accepts a valid name", () => {
    expect(getSkillNameProblems("review-slice", "workflows/review-slice")).toEqual([]);
  });

  test("rejects the reserved prefix", () => {
    const problems = getSkillNameProblems("metafab-review", "workflows/metafab-review");

    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain("reserved");
    expect(problems[0]?.file).toBe(".factory/workflows/metafab-review/SKILL.md");
  });

  test("rejects a name that is not a valid Agent Skill name", () => {
    expect(getSkillNameProblems("Bad_Name", "review/Bad_Name")).toHaveLength(1);
  });

  test("rejects an empty name", () => {
    expect(getSkillNameProblems("", "review/empty")).toHaveLength(1);
  });
});
