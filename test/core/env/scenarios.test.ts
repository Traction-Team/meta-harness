import { describe, expect, test } from "vitest";
import { parseCondition } from "../../../src/core/env/condition.js";
import type { Condition } from "../../../src/core/env/condition.js";
import { allValues, classify, scenarios } from "../../../src/core/env/scenarios.js";
import type { Applies } from "../../../src/core/env/scenarios.js";
import type { EnvSelection, EnvVariable } from "../../../src/core/env/types.js";

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
      { name: "orb", label: "On orb", line: 5 },
    ],
    line: 4,
  },
];

const ALL_HARNESSES = ["opencode", "claude", "amp"];

function selection(values: Record<string, string[]>): EnvSelection {
  return new Map(Object.entries(values));
}

function condition(text: string): Condition {
  const parsed = parseCondition(text);
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed.condition;
}

function applies(
  text: string,
  values: Record<string, string[]>,
  enclosing: string[] = [],
  variables: readonly EnvVariable[] = VARIABLES,
): Applies {
  return classify(
    condition(text),
    enclosing.map(condition),
    selection(values),
    variables,
  );
}

describe("scenarios", () => {
  test("is the product of the selected values, the first variable varying slowest", () => {
    const rows = scenarios(selection({ harness: ["opencode", "amp"], workspace: ["orca", "orb"] }), [
      "harness",
      "workspace",
    ]).map((scenario) => Object.fromEntries(scenario));

    expect(rows).toEqual([
      { harness: "opencode", workspace: "orca" },
      { harness: "opencode", workspace: "orb" },
      { harness: "amp", workspace: "orca" },
      { harness: "amp", workspace: "orb" },
    ]);
  });

  test("a variable the selection does not give a value for contributes none", () => {
    expect(scenarios(selection({ workspace: ["orca"] }), ["harness"])).toEqual([]);
  });

  test("no variables is one empty scenario", () => {
    const result = scenarios(selection({ harness: ["amp"] }), []);

    expect(result).toHaveLength(1);
    expect(result[0]?.size).toBe(0);
  });

  test("allValues selects every declared value of every variable, in declaration order", () => {
    expect([...allValues(VARIABLES)]).toEqual([
      ["harness", ["opencode", "claude", "amp"]],
      ["workspace", ["orca", "orb"]],
    ]);
  });
});

const LABELS: {
  name: string;
  condition: string;
  values: Record<string, string[]>;
  applies: Applies;
}[] = [
  {
    name: "true in every scenario is kept unlabelled",
    condition: "env.harness == amp",
    values: { harness: ["amp"] },
    applies: { kind: "all" },
  },
  {
    name: "false in every scenario is removed",
    condition: "env.harness == amp",
    values: { harness: ["opencode"] },
    applies: { kind: "none" },
  },
  {
    name: "a partial match names the value it applies to",
    condition: "env.harness == amp",
    values: { harness: ["opencode", "amp"] },
    applies: { kind: "some", label: "In Amp" },
  },
  {
    name: "several values of one variable are joined with or",
    condition: "env.harness in [opencode, claude]",
    values: { harness: ALL_HARNESSES },
    applies: { kind: "some", label: "In OpenCode or In Claude Code" },
  },
  {
    name: "two variables are joined with a comma and and",
    condition: "env.harness == amp and env.workspace == orb",
    values: { harness: ["opencode", "amp"], workspace: ["orca", "orb"] },
    applies: { kind: "some", label: "In Amp, and On orb" },
  },
  {
    name: "an or across two variables that every value can satisfy lists each combination",
    condition: "env.harness == amp or env.workspace == orb",
    values: { harness: ["opencode", "amp"], workspace: ["orca", "orb"] },
    applies: {
      kind: "some",
      label: "In OpenCode, and On orb or In Amp, and On Orca or In Amp, and On orb",
    },
  },
  {
    name: "a negated test names the value it keeps",
    condition: "env.harness != amp",
    values: { harness: ["claude", "amp"] },
    applies: { kind: "some", label: "In Claude Code" },
  },
  {
    name: "not names the value it keeps",
    condition: "not env.harness == amp",
    values: { harness: ["opencode", "amp"] },
    applies: { kind: "some", label: "In OpenCode" },
  },
  {
    name: "a test every value satisfies keeps the text unlabelled",
    condition: "env.harness in [opencode, claude, amp]",
    values: { harness: ALL_HARNESSES },
    applies: { kind: "all" },
  },
  {
    name: "an and of two variables true in the only scenario is kept unlabelled",
    condition: "env.harness == amp and env.workspace == orb",
    values: { harness: ["amp"], workspace: ["orb"] },
    applies: { kind: "all" },
  },
  {
    name: "an and of two variables false in the only scenario is removed",
    condition: "env.harness == amp and env.workspace == orb",
    values: { harness: ["amp"], workspace: ["orca"] },
    applies: { kind: "none" },
  },
];

describe("classify and labels", () => {
  test.each(LABELS)("$name", ({ condition: text, values, applies: expected }) => {
    expect(applies(text, values)).toEqual(expected);
  });

  const NESTED: {
    name: string;
    condition: string;
    enclosing: string[];
    values: Record<string, string[]>;
    applies: Applies;
  }[] = [
    {
      name: "a nested block is labelled only by its own variable",
      condition: "env.workspace == orb",
      enclosing: ["env.harness == amp"],
      values: { harness: ["amp"], workspace: ["orca", "orb"] },
      applies: { kind: "some", label: "On orb" },
    },
    {
      name: "a nested block whose own variable has one value is labelled by the enclosing one",
      condition: "env.harness == amp",
      enclosing: ["env.workspace == orb"],
      values: { harness: ["opencode", "amp"], workspace: ["orca", "orb"] },
      applies: { kind: "some", label: "In Amp" },
    },
    {
      name: "an enclosing condition that leaves one scenario keeps the text unlabelled",
      condition: "env.harness == amp",
      enclosing: ["env.workspace == orca"],
      values: { harness: ["amp"], workspace: ["orca", "orb"] },
      applies: { kind: "all" },
    },
    {
      name: "an enclosing condition narrows the scenarios the label ranges over",
      condition: "env.harness == amp",
      enclosing: ["env.workspace == orca"],
      values: { harness: ["amp", "opencode"], workspace: ["orca", "orb"] },
      applies: { kind: "some", label: "In Amp" },
    },
    {
      name: "every enclosing condition narrows the scenarios",
      condition: "env.harness == amp",
      enclosing: ["env.workspace == orb", "env.harness in [amp, opencode]"],
      values: { harness: ALL_HARNESSES, workspace: ["orca", "orb"] },
      applies: { kind: "some", label: "In Amp" },
    },
    {
      name: "a condition the enclosing condition rules out is removed",
      condition: "env.harness == claude",
      enclosing: ["env.harness == amp"],
      values: { harness: ["amp", "claude"] },
      applies: { kind: "none" },
    },
  ];

  test.each(NESTED)("$name", ({ condition: text, enclosing, values, applies: expected }) => {
    expect(applies(text, values, enclosing)).toEqual(expected);
  });

  test("a value with no label of its own reads When <variable> is <value>", () => {
    const defaults: EnvVariable[] = [
      {
        name: "harness",
        values: [
          { name: "opencode", label: "In OpenCode", line: 1 },
          { name: "amp", label: "When harness is amp", line: 2 },
        ],
        line: 1,
      },
    ];

    expect(applies("env.harness == amp", { harness: ["opencode", "amp"] }, [], defaults)).toEqual({
      kind: "some",
      label: "When harness is amp",
    });
  });
});
