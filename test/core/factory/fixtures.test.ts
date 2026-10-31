import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { loadFactory } from "../../../src/core/factory/index.js";
import type { Problem } from "../../../src/errors.js";

const FIXTURES = fileURLToPath(new URL("../../fixtures/factories/", import.meta.url));

interface ExpectedProblem {
  level: "error" | "warning";
  file: string;
  line?: number;
  message: string;
  fix?: string;
}

function normalize(problem: ExpectedProblem): ExpectedProblem {
  return {
    level: problem.level,
    file: problem.file,
    ...(problem.line === undefined ? {} : { line: problem.line }),
    message: problem.message,
    ...(problem.fix === undefined ? {} : { fix: problem.fix }),
  };
}

function compare(left: ExpectedProblem, right: ExpectedProblem): number {
  if (left.file !== right.file) return left.file < right.file ? -1 : 1;
  if ((left.line ?? 0) !== (right.line ?? 0)) return (left.line ?? 0) - (right.line ?? 0);
  return left.message < right.message ? -1 : left.message > right.message ? 1 : 0;
}

const fixtureNames = (await readdir(FIXTURES, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("factory fixtures", () => {
  test.each(fixtureNames)("%s reports exactly the expected problems", async (name) => {
    const root = path.join(FIXTURES, name);
    const expected = JSON.parse(
      await readFile(path.join(root, "expected.json"), "utf8"),
    ) as ExpectedProblem[];
    const factory = await loadFactory(root);

    const actual = (factory.problems as Problem[])
      .map(normalize)
      .sort(compare);
    const wanted = expected.map(normalize).sort(compare);

    expect(actual).toEqual(wanted);
  });

  test("a nested skill is reported but not loaded", async () => {
    const factory = await loadFactory(path.join(FIXTURES, "invalid-rule-3-nested-skill"));

    expect(factory.skills.map((skill) => skill.relDir)).toEqual(["workflows/build-slice"]);
  });

  test("a SKILL.md in a reserved container is rule 11 and its skills still load", async () => {
    const factory = await loadFactory(path.join(FIXTURES, "invalid-rule-11-reserved-container"));

    expect(factory.problems.map((problem) => problem.file)).toEqual([
      ".factory/scorers/SKILL.md",
      ".factory/workflows/SKILL.md",
    ]);
    expect(factory.skills.map((skill) => skill.relDir)).toEqual([
      "scorers/score-slice",
      "workflows/review-slice",
    ]);
    expect(factory.skills.find((skill) => skill.name === "review-slice")?.isWorkflow).toBe(true);
    expect(factory.skills.find((skill) => skill.name === "score-slice")?.isWorkflow).toBe(false);
  });
});
