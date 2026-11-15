import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { Problem } from "../../../src/errors.js";
import { parseFactoryYaml } from "../../../src/core/factory/index.js";
import { pathExists } from "../../../src/util/fs.js";

const FIXTURES = fileURLToPath(new URL("../../fixtures/env/", import.meta.url));
const FILE = ".factory/factory.yaml";

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

const fixtureNames: string[] = [];
for (const entry of await readdir(FIXTURES, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  // A declaration fixture carries its expected problems; `factory` is a whole
  // factory that the CLI tests copy, so it has none.
  if (!(await pathExists(path.join(FIXTURES, entry.name, "expected.json")))) continue;
  fixtureNames.push(entry.name);
}
fixtureNames.sort();

describe("env fixtures", () => {
  test.each(fixtureNames)("%s reports exactly the expected problems", async (name) => {
    const root = path.join(FIXTURES, name);
    const expected = JSON.parse(
      await readFile(path.join(root, "expected.json"), "utf8"),
    ) as ExpectedProblem[];
    const text = await readFile(path.join(root, ".factory", "factory.yaml"), "utf8");

    const actual = (parseFactoryYaml(text, FILE).problems as Problem[])
      .map(normalize)
      .sort(compare);
    const wanted = expected.map(normalize).sort(compare);

    expect(actual).toEqual(wanted);
  });
});
