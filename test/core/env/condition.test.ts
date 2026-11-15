import { describe, expect, test } from "vitest";
import {
  conditionFix,
  conditionProblems,
  conditionVariables,
  evaluate,
  parseCondition,
} from "../../../src/core/env/condition.js";
import type { Condition } from "../../../src/core/env/condition.js";
import type { EnvVariable } from "../../../src/core/env/types.js";

const VARIABLES: EnvVariable[] = [
  {
    name: "harness",
    values: [
      { name: "opencode", label: "In OpenCode", line: 1 },
      { name: "claude", label: "In Claude Code", line: 2 },
      { name: "amp", label: "In Amp", line: 3 },
    ],
    line: 1,
  },
  {
    name: "workspace",
    values: [
      { name: "orca", label: "On Orca", line: 4 },
      { name: "orb", label: "On an orb", line: 5 },
    ],
    line: 4,
  },
  {
    name: "mode",
    values: [
      { name: "in", label: "In mode", line: 6 },
      { name: "out", label: "Out of mode", line: 7 },
    ],
    line: 6,
  },
];

function parse(text: string): Condition {
  const result = parseCondition(text);
  if ("error" in result) throw new Error(result.error);
  return result.condition;
}

function scenario(values: Record<string, string>): ReadonlyMap<string, string> {
  return new Map(Object.entries(values));
}

describe("conditions", () => {
  test("reads each operator", () => {
    expect(parse("env.harness == amp")).toEqual({
      kind: "test",
      variable: "harness",
      values: ["amp"],
      negate: false,
    });
    expect(parse("env.harness != amp")).toEqual({
      kind: "test",
      variable: "harness",
      values: ["amp"],
      negate: true,
    });
    expect(parse("env.harness in [opencode, claude]")).toEqual({
      kind: "test",
      variable: "harness",
      values: ["opencode", "claude"],
      negate: false,
    });
  });

  test("evaluates each operator", () => {
    const equals = parse("env.harness == amp");
    expect(evaluate(equals, scenario({ harness: "amp" }))).toBe(true);
    expect(evaluate(equals, scenario({ harness: "claude" }))).toBe(false);

    const differs = parse("env.harness != amp");
    expect(evaluate(differs, scenario({ harness: "amp" }))).toBe(false);
    expect(evaluate(differs, scenario({ harness: "claude" }))).toBe(true);

    const listed = parse("env.harness in [opencode, claude]");
    expect(evaluate(listed, scenario({ harness: "opencode" }))).toBe(true);
    expect(evaluate(listed, scenario({ harness: "claude" }))).toBe(true);
    expect(evaluate(listed, scenario({ harness: "amp" }))).toBe(false);
  });

  test("not binds tighter than and, which binds tighter than or", () => {
    const condition = parse(
      "not env.harness == amp and env.workspace == orca or env.mode == out",
    );

    expect(evaluate(condition, scenario({ harness: "amp", workspace: "orca", mode: "in" }))).toBe(
      false,
    );
    expect(
      evaluate(condition, scenario({ harness: "claude", workspace: "orca", mode: "in" })),
    ).toBe(true);
    // `or` is the outermost operator: a true right side wins over a false `and`.
    expect(evaluate(condition, scenario({ harness: "amp", workspace: "orb", mode: "out" }))).toBe(
      true,
    );
    expect(evaluate(condition, scenario({ harness: "claude", workspace: "orb", mode: "in" }))).toBe(
      false,
    );
  });

  test("parentheses override precedence", () => {
    const bracketed = parse("not (env.harness == amp and env.workspace == orca)");
    const bare = parse("not env.harness == amp and env.workspace == orca");
    const selected = scenario({ harness: "amp", workspace: "orb" });

    expect(evaluate(bracketed, selected)).toBe(true);
    expect(evaluate(bare, selected)).toBe(false);
  });

  test("reads the no-space forms", () => {
    expect(parse("env.harness==amp")).toEqual(parse("env.harness == amp"));
    expect(parse("not(env.harness in[opencode,claude])")).toEqual(
      parse("not (env.harness in [opencode, claude])"),
    );
    expect(evaluate(parse("not(env.harness in[opencode,claude])"), scenario({ harness: "amp" }))).toBe(
      true,
    );
    expect(
      evaluate(parse("not(env.harness in[opencode,claude])"), scenario({ harness: "opencode" })),
    ).toBe(false);
  });

  test("a word ends at a symbol, so env.harness==ampand names the value ampand", () => {
    const condition = parse("env.harness==ampand");

    expect(condition).toEqual({
      kind: "test",
      variable: "harness",
      values: ["ampand"],
      negate: false,
    });
    expect(conditionProblems(condition, VARIABLES)).toEqual([
      'Condition names unknown value "ampand" of harness',
    ]);
    expect(conditionFix(condition, VARIABLES)).toBe("Use one of: opencode, claude, amp");
  });

  test("two words need whitespace or a symbol between them", () => {
    expect(parseCondition("env.harness == amp andenv.workspace == orb")).toEqual({
      error: 'Unexpected token at "andenv.workspace"',
    });
  });

  test("a value may be named in", () => {
    const equals = parse("env.mode == in");
    expect(equals).toEqual({ kind: "test", variable: "mode", values: ["in"], negate: false });
    expect(evaluate(equals, scenario({ mode: "in" }))).toBe(true);

    const listed = parse("env.mode in [in, out]");
    expect(conditionProblems(listed, VARIABLES)).toEqual([]);
    expect(evaluate(listed, scenario({ mode: "out" }))).toBe(true);
  });

  test.each([
    ["", 'Empty condition at ""'],
    ["   ", 'Empty condition at ""'],
    ["env.harness == amp and", 'Trailing operator at "and"'],
    ["env.harness == amp or", 'Trailing operator at "or"'],
    ["not", 'Trailing operator at "not"'],
    ["env.harness in []", 'Empty value list at "]"'],
    ["env.harness in [amp,]", 'Expected a value at "]"'],
    ["(env.harness == amp", 'Unclosed "(" at ""'],
    ["env.harness in [amp", 'Unclosed "[" at ""'],
    ["env.harness = amp", 'Expected == at "="'],
    ["env. == amp", 'Expected a variable name at "env."'],
    ["env.harness == amp amp", 'Unexpected token at "amp"'],
  ])("reports %j as %s", (text, error) => {
    expect(parseCondition(text)).toEqual({ error });
  });

  test("names unknown variables and values with a fix", () => {
    const variable = parse("env.harnes == amp");
    expect(conditionProblems(variable, VARIABLES)).toEqual([
      'Condition names unknown variable "harnes"',
    ]);
    expect(conditionFix(variable, VARIABLES)).toBe('Did you mean "harness"?');

    const value = parse("env.workspace == orka");
    expect(conditionProblems(value, VARIABLES)).toEqual([
      'Condition names unknown value "orka" of workspace',
    ]);
    expect(conditionFix(value, VARIABLES)).toBe('Did you mean "orca"?');
  });

  test("a condition with several unknown names gets one problem each", () => {
    const condition = parse("env.harnes == amp or env.workspace == orka");

    expect(conditionProblems(condition, VARIABLES)).toEqual([
      'Condition names unknown variable "harnes"',
      'Condition names unknown value "orka" of workspace',
    ]);
    expect(conditionFix(condition, VARIABLES)).toBe("Use a declared variable and value");
  });

  test("names every variable it mentions once, in order", () => {
    const condition = parse(
      "not env.workspace == orca and env.harness in [opencode, claude] or env.harness == amp",
    );

    expect([...conditionVariables(condition)]).toEqual(["workspace", "harness"]);
  });
});
