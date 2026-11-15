import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { parseFactoryYaml } from "../../../src/core/factory/index.js";

const FILE = ".factory/factory.yaml";
const FIXTURES = fileURLToPath(new URL("../../fixtures/env/", import.meta.url));

function parse(text: string) {
  return parseFactoryYaml(text, FILE);
}

async function fixture(name: string) {
  return parse(await readFile(path.join(FIXTURES, name, ".factory", "factory.yaml"), "utf8"));
}

describe("env declarations", () => {
  test("reads variables, values, labels and defaults in declaration order", async () => {
    const result = await fixture("valid");

    expect(result.problems).toEqual([]);
    expect(result.yaml?.format).toBe(2);
    expect(result.yaml?.env).toEqual([
      {
        name: "harness",
        description: "The agent tool that runs the workflows",
        values: [
          { name: "opencode", label: "In OpenCode", line: 8 },
          { name: "claude", label: "In Claude Code", line: 9 },
          { name: "amp", label: "When harness is amp", line: 10 },
        ],
        default: ["claude"],
        line: 5,
      },
      {
        name: "workspace",
        values: [
          { name: "orca", label: "When workspace is orca", line: 13 },
          { name: "orb", label: "When workspace is orb", line: 13 },
          { name: "worktree", label: "When workspace is worktree", line: 13 },
        ],
        default: ["worktree"],
        line: 12,
      },
    ]);
  });

  test.each(["env:\n", "env: {}\n"])("accepts %j with no variables", (env) => {
    const result = parse(`format: 2\nname: demo\n${env}`);

    expect(result.problems).toEqual([]);
    expect(result.yaml?.env).toEqual([]);
  });

  test("a factory without env declares no variables", () => {
    const result = parse("format: 1\nname: demo\n");

    expect(result.problems).toEqual([]);
    expect(result.yaml?.env).toEqual([]);
  });

  test("parses the variables of a format 1 factory so their own errors show", () => {
    const result = parse("format: 1\nname: demo\nenv:\n  harness: { values: [amp] }\n");

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 3,
        message: '"env" needs format: 2',
        fix: "Set format: 2",
      },
    ]);
    expect(result.yaml?.env).toEqual([
      {
        name: "harness",
        values: [{ name: "amp", label: "When harness is amp", line: 4 }],
        line: 4,
      },
    ]);
  });

  test("resolves an alias in env", () => {
    const result = parse(
      "format: 2\nname: demo\nenv:\n  harness:\n    values: &v [amp, claude]\n  workspace:\n    values: *v\n",
    );

    expect(result.problems).toEqual([]);
    expect(result.yaml?.env.map((variable) => variable.values.map((value) => value.name))).toEqual([
      ["amp", "claude"],
      ["amp", "claude"],
    ]);
  });

  test("refuses a variable whose key is not a string", () => {
    const result = parse("format: 2\nname: demo\nenv:\n  1: { values: [amp] }\n");

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 4,
        message:
          'Variable name "1" must start with a letter and use lowercase letters, digits and single hyphens',
        fix: 'Use a name like "v1"',
      },
    ]);
    expect(result.yaml?.env).toEqual([]);
  });
});
