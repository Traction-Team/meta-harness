import { describe, expect, test } from "vitest";
import type { Problem } from "../../../src/errors.js";
import { directiveLines, parseMarkdown } from "../../../src/core/env/directives.js";
import type { MarkdownDocument, ParseOptions } from "../../../src/core/env/directives.js";
import type { EnvVariable } from "../../../src/core/env/types.js";

const FILE = ".factory/skills/demo/SKILL.md";

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
];

/** Eleven two-value variables: 2^11 is more than the 1024 combination limit. */
const ELEVEN: EnvVariable[] = Array.from({ length: 11 }, (_, index) => ({
  name: `v${index + 1}`,
  values: [
    { name: "a", label: "A", line: index + 1 },
    { name: "b", label: "B", line: index + 1 },
  ],
  line: index + 1,
}));

const CONDITION_FIX =
  "Write env.<variable> == <value>, != <value> or in [<values>], joined with and, or, not and parentheses";

function parse(text: string, options: Partial<ParseOptions> = {}): MarkdownDocument {
  return parseMarkdown(text, { file: FILE, firstLine: 1, variables: VARIABLES, ...options });
}

function error(line: number, message: string, fix: string): Problem {
  return { level: "error", file: FILE, line, message, fix };
}

const CASES: { name: string; text: string; problems: Problem[] }[] = [
  {
    name: "an unknown directive",
    text: "<!-- factory:wnen env.harness == amp -->\n",
    problems: [error(1, 'Unknown directive "factory:wnen"', 'Did you mean "when"?')],
  },
  {
    name: "factory:start",
    text: "<!-- factory:start -->\n",
    problems: [
      error(
        1,
        "factory:start marks the generated block in the root AGENTS.md and cannot appear in source",
        "Remove the line",
      ),
    ],
  },
  {
    name: "factory:end",
    text: "<!-- factory:end -->\n",
    problems: [
      error(
        1,
        "factory:end marks the generated block in the root AGENTS.md and cannot appear in source",
        "Remove the line",
      ),
    ],
  },
  {
    name: "factory:import",
    text: "<!-- factory:import partials/setup.md -->\n",
    problems: [error(1, "factory:import is not supported yet", "Copy the text in for now")],
  },
  {
    name: "a when without a condition",
    text: "<!-- factory:when -->\n",
    problems: [
      error(
        1,
        "factory:when needs a condition",
        "Write <!-- factory:when env.<variable> == <value> -->",
      ),
    ],
  },
  {
    name: "a when whose condition does not parse",
    text: "<!-- factory:when env.harness == -->\n",
    problems: [
      error(
        1,
        'Cannot read condition "env.harness ==": Trailing operator at "=="',
        CONDITION_FIX,
      ),
    ],
  },
  {
    name: "a condition that names an unknown variable",
    text: "<!-- factory:when env.harnes == amp -->\n<!-- factory:endwhen -->\n",
    problems: [error(1, 'Condition names unknown variable "harnes"', 'Did you mean "harness"?')],
  },
  {
    name: "a condition that names an unknown value",
    text: "<!-- factory:when env.harness == ampp -->\n<!-- factory:endwhen -->\n",
    problems: [
      error(1, 'Condition names unknown value "ampp" of harness', 'Did you mean "amp"?'),
    ],
  },
  {
    name: "arguments on endwhen",
    text: "<!-- factory:when env.harness == amp -->\ntext\n<!-- factory:endwhen x -->\n",
    problems: [error(3, "factory:endwhen takes no arguments", 'Remove "x"')],
  },
  {
    name: "arguments on default",
    text: [
      "<!-- factory:switch env.harness -->",
      "<!-- factory:case opencode -->",
      "a",
      "<!-- factory:case claude -->",
      "b",
      "<!-- factory:case amp -->",
      "c",
      "<!-- factory:default x -->",
      "<!-- factory:endswitch -->",
      "",
    ].join("\n"),
    problems: [error(8, "factory:default takes no arguments", 'Remove "x"')],
  },
  {
    name: "arguments on endswitch",
    text: "<!-- factory:switch env.harness -->\n<!-- factory:default -->\ntext\n<!-- factory:endswitch extra -->\n",
    problems: [error(4, "factory:endswitch takes no arguments", 'Remove "extra"')],
  },
  {
    name: "a switch without a variable",
    text: "<!-- factory:switch -->\n",
    problems: [
      error(
        1,
        "factory:switch needs env.<variable>",
        "Write <!-- factory:switch env.<variable> -->",
      ),
    ],
  },
  {
    name: "a switch whose argument is not env.<variable>",
    text: "<!-- factory:switch harness -->\n",
    problems: [
      error(
        1,
        "factory:switch needs env.<variable>",
        "Write <!-- factory:switch env.<variable> -->",
      ),
    ],
  },
  {
    name: "a switch over an unknown variable",
    text: "<!-- factory:switch env.harnes -->\n<!-- factory:default -->\ntext\n<!-- factory:endswitch -->\n",
    problems: [
      error(1, 'factory:switch names unknown variable "harnes"', 'Did you mean "harness"?'),
    ],
  },
  {
    name: "endwhen with nothing open",
    text: "<!-- factory:endwhen -->\n",
    problems: [error(1, "factory:endwhen has no matching factory:when", "Remove the line")],
  },
  {
    name: "endswitch with nothing open",
    text: "<!-- factory:endswitch -->\n",
    problems: [error(1, "factory:endswitch has no matching factory:switch", "Remove the line")],
  },
  {
    name: "endwhen closing a switch",
    text: "<!-- factory:switch env.harness -->\n<!-- factory:endwhen -->\n",
    problems: [
      error(2, "factory:endwhen cannot close the factory:switch on line 1", "Close the inner block first"),
      error(1, "factory:switch on line 1 is never closed in this file", "Add <!-- factory:endswitch --> in the same file"),
    ],
  },
  {
    name: "endswitch closing a when",
    text: "<!-- factory:when env.harness == amp -->\n<!-- factory:endswitch -->\n",
    problems: [
      error(2, "factory:endswitch cannot close the factory:when on line 1", "Close the inner block first"),
      error(1, "factory:when on line 1 is never closed in this file", "Add <!-- factory:endwhen --> in the same file"),
    ],
  },
  {
    name: "a block that is never closed",
    text: "<!-- factory:when env.harness == amp -->\ntext\n",
    problems: [
      error(1, "factory:when on line 1 is never closed in this file", "Add <!-- factory:endwhen --> in the same file"),
    ],
  },
  {
    name: "a case outside a switch",
    text: "<!-- factory:case amp -->\n",
    problems: [
      error(
        1,
        "factory:case must be directly inside a factory:switch",
        "Move the line inside a factory:switch, or remove it",
      ),
    ],
  },
  {
    name: "a default inside a when",
    text: "<!-- factory:when env.harness == amp -->\n<!-- factory:default -->\n<!-- factory:endwhen -->\n",
    problems: [
      error(
        2,
        "factory:default must be directly inside a factory:switch",
        "Move the line inside a factory:switch, or remove it",
      ),
    ],
  },
  {
    name: "text between a switch and its first case",
    text: [
      "<!-- factory:switch env.harness -->",
      "not blank",
      "<!-- factory:case opencode -->",
      "<!-- factory:case claude -->",
      "<!-- factory:case amp -->",
      "<!-- factory:endswitch -->",
      "",
    ].join("\n"),
    problems: [error(2, "Only blank lines may come between factory:switch and its first case", "Move the text into a case")],
  },
  {
    name: "a case with no values",
    text: "<!-- factory:switch env.harness -->\n<!-- factory:case -->\n<!-- factory:default -->\n<!-- factory:endswitch -->\n",
    problems: [
      error(2, "factory:case needs one or more value names separated by spaces", "Write <!-- factory:case <value> [<value> ...] -->"),
    ],
  },
  {
    name: "a case with a badly formatted value",
    text: "<!-- factory:switch env.harness -->\n<!-- factory:case Amp -->\n<!-- factory:default -->\n<!-- factory:endswitch -->\n",
    problems: [
      error(2, "factory:case needs one or more value names separated by spaces", "Write <!-- factory:case <value> [<value> ...] -->"),
    ],
  },
  {
    name: "a case naming a value the variable does not declare",
    text: [
      "<!-- factory:switch env.harness -->",
      "<!-- factory:case opencode -->",
      "<!-- factory:case claude -->",
      "<!-- factory:case amp -->",
      "<!-- factory:case ampp -->",
      "<!-- factory:endswitch -->",
      "",
    ].join("\n"),
    problems: [error(5, 'factory:case names unknown value "ampp" of harness', 'Did you mean "amp"?')],
  },
  {
    name: "a value in two cases",
    text: [
      "<!-- factory:switch env.harness -->",
      "<!-- factory:case amp -->",
      "a",
      "<!-- factory:case opencode -->",
      "b",
      "<!-- factory:case claude amp -->",
      "c",
      "<!-- factory:endswitch -->",
      "",
    ].join("\n"),
    problems: [error(6, 'Value "amp" already has a case on line 2', "Remove it from one case")],
  },
  {
    name: "a case after a default",
    text: [
      "<!-- factory:switch env.harness -->",
      "<!-- factory:default -->",
      "a",
      "<!-- factory:case amp -->",
      "b",
      "<!-- factory:endswitch -->",
      "",
    ].join("\n"),
    problems: [error(4, "factory:default must be the last branch of its switch", "Move the factory:default to the end of the switch")],
  },
  {
    name: "a second default",
    text: [
      "<!-- factory:switch env.harness -->",
      "<!-- factory:default -->",
      "a",
      "<!-- factory:default -->",
      "b",
      "<!-- factory:endswitch -->",
      "",
    ].join("\n"),
    problems: [error(4, "factory:default must be the last branch of its switch", "Move the factory:default to the end of the switch")],
  },
  {
    name: "a switch without a default that misses values",
    text: "<!-- factory:switch env.harness -->\n<!-- factory:case opencode -->\ntext\n<!-- factory:endswitch -->\n",
    problems: [
      error(1, "factory:switch over env.harness has no case for claude, amp", "Add a case for each, or a factory:default"),
    ],
  },
  {
    name: "an unclosed fence before directive lines",
    text: "```text\n<!-- factory:when env.harness == amp -->\n",
    problems: [
      {
        level: "warning",
        file: FILE,
        line: 1,
        message:
          "The code fence on line 1 is never closed, so the directive lines after it are text",
        fix: "Close the fence",
      },
    ],
  },
  {
    name: "a directive comment that is not one whole line",
    text: "<!-- factory:when env.harness == amp --> and more\n",
    problems: [
      error(
        1,
        "A factory: directive must be one whole line: <!-- factory:<name> <arguments> -->",
        "Write it on one line: <!-- factory:<name> <arguments> -->",
      ),
    ],
  },
  {
    name: "a directive comment that spans several lines",
    text: "<!--\nfactory:when env.harness == amp\n-->\n",
    problems: [
      error(
        2,
        "A factory: directive must be one whole line: <!-- factory:<name> <arguments> -->",
        "Write it on one line: <!-- factory:<name> <arguments> -->",
      ),
    ],
  },
];

describe("directive parser", () => {
  test.each(CASES)("$name", ({ text, problems }) => {
    expect(parse(text).problems).toEqual(problems);
  });

  test("directives inside backtick and tilde fences, and in a fence in a list item, are text", () => {
    const text = [
      "# Skill",
      "",
      "```md",
      "<!-- factory:when env.harness == amp -->",
      "<!-- factory:endwhen -->",
      "```",
      "",
      "~~~~",
      "<!-- factory:switch env.harness -->",
      "~~~~",
      "",
      "- a list item",
      "",
      "  ```",
      "  <!-- factory:when env.harness == amp -->",
      "  ```",
      "",
    ].join("\n");

    const document = parse(text);

    expect(document.problems).toEqual([]);
    expect(document.nodes.every((node) => node.kind === "text")).toBe(true);
    expect(document.nodes.map((node) => node.text).join("\n")).toBe(text);
  });

  test("a directive without spaces around the comment is a directive", () => {
    const document = parse("<!--factory:when env.harness == amp-->\ntext\n<!--factory:endwhen-->\n");

    expect(document.problems).toEqual([]);
    expect(document.nodes.map((node) => node.kind)).toEqual(["when", "text"]);
    const [when] = document.nodes;
    expect(when?.kind === "when" ? when.children.map((node) => node.kind) : []).toEqual(["text"]);
  });

  test("reports every problem in a file, one per line", () => {
    const document = parse("<!-- factory:wnen -->\n<!-- factory:when -->\n");

    expect(document.problems.map((problem) => [problem.line, problem.message])).toEqual([
      [1, 'Unknown directive "factory:wnen"'],
      [2, "factory:when needs a condition"],
    ]);
  });

  test("numbers lines from firstLine", () => {
    const document = parse("text\n<!-- factory:wnen -->\n", { firstLine: 5 });

    expect(document.problems).toEqual([
      error(6, 'Unknown directive "factory:wnen"', 'Did you mean "when"?'),
    ]);
  });

  test("reads the tree of when blocks, switches and text", () => {
    const text = [
      "  <!-- factory:when env.harness == amp -->",
      "  text",
      "  <!-- factory:endwhen -->",
      "<!-- factory:switch env.workspace -->",
      "<!-- factory:case orca -->",
      "orca text",
      "<!-- factory:case orb -->",
      "orb text",
      "<!-- factory:default -->",
      "other",
      "<!-- factory:endswitch -->",
      "after",
      "",
    ].join("\n");

    const document = parse(text);

    expect(document.problems).toEqual([]);
    expect(document.nodes).toEqual([
      {
        kind: "when",
        line: 1,
        indent: "  ",
        condition: { kind: "test", variable: "harness", values: ["amp"], negate: false },
        children: [{ kind: "text", line: 2, text: "  text" }],
        endLine: 3,
      },
      {
        kind: "switch",
        line: 4,
        indent: "",
        variable: "workspace",
        branches: [
          { kind: "case", line: 5, indent: "", values: ["orca"], children: [{ kind: "text", line: 6, text: "orca text" }] },
          { kind: "case", line: 7, indent: "", values: ["orb"], children: [{ kind: "text", line: 8, text: "orb text" }] },
          { kind: "default", line: 9, indent: "", values: [], children: [{ kind: "text", line: 10, text: "other" }] },
        ],
        endLine: 11,
      },
      { kind: "text", line: 12, text: "after" },
      { kind: "text", line: 13, text: "" },
    ]);
    expect([...document.variables]).toEqual(["harness", "workspace"]);
  });

  test("a block nested in another reads its own condition", () => {
    const text = [
      "<!-- factory:when env.harness == amp -->",
      "<!-- factory:when env.workspace == orca -->",
      "both",
      "<!-- factory:endwhen -->",
      "<!-- factory:endwhen -->",
      "",
    ].join("\n");

    const document = parse(text);

    expect(document.problems).toEqual([]);
    const [outer] = document.nodes;
    expect(outer?.kind).toBe("when");
    if (outer?.kind !== "when") return;
    expect(outer.children).toHaveLength(1);
    expect(outer.children[0]?.kind).toBe("when");
  });
});

describe("directive combination limit", () => {
  const six =
    "env.v6 == a and env.v7 == a and env.v8 == a and env.v9 == a and env.v10 == a and env.v11 == a";
  const five = "env.v1 == a and env.v2 == a and env.v3 == a and env.v4 == a and env.v5 == a";

  test("a nested block over more than 1024 combinations is an error on its line", () => {
    const text = [
      `<!-- factory:when ${five} -->`,
      `<!-- factory:when ${six} -->`,
      "text",
      "<!-- factory:endwhen -->",
      "<!-- factory:endwhen -->",
      "",
    ].join("\n");

    const document = parse(text, { variables: ELEVEN });

    expect(document.problems).toEqual([
      error(
        2,
        "Condition spans too many combinations: 2048 over v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11; the limit is 1024",
        "Split the condition, or nest fewer conditions",
      ),
    ]);
  });

  test("the same variables in sibling blocks are within the limit", () => {
    const text = [
      `<!-- factory:when ${six} -->`,
      "six",
      "<!-- factory:endwhen -->",
      `<!-- factory:when ${five} -->`,
      "five",
      "<!-- factory:endwhen -->",
      "",
    ].join("\n");

    expect(parse(text, { variables: ELEVEN }).problems).toEqual([]);
  });

  test("a switch's variable counts toward a block inside its case", () => {
    const ten =
      "env.v1 == a and env.v2 == a and env.v3 == a and env.v4 == a and env.v5 == a and env.v6 == a and env.v7 == a and env.v8 == a and env.v9 == a and env.v10 == a";
    const text = [
      "<!-- factory:switch env.v11 -->",
      "<!-- factory:case a -->",
      `<!-- factory:when ${ten} -->`,
      "text",
      "<!-- factory:endwhen -->",
      "<!-- factory:case b -->",
      "b",
      "<!-- factory:endswitch -->",
      "",
    ].join("\n");

    const document = parse(text, { variables: ELEVEN });

    expect(document.problems).toEqual([
      error(
        3,
        "Condition spans too many combinations: 2048 over v11, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10; the limit is 1024",
        "Split the condition, or nest fewer conditions",
      ),
    ]);
  });
});

describe("directiveLines", () => {
  test("names the directive lines and skips fenced code", () => {
    const text = [
      "text",
      "<!-- factory:when env.harness == amp -->",
      "```",
      "<!-- factory:endwhen -->",
      "```",
      "<!-- factory:endswitch -->",
      "",
    ].join("\n");

    expect(directiveLines(text)).toEqual([2, 6]);
  });

  test("numbers lines from firstLine", () => {
    expect(directiveLines("text\n<!-- factory:default -->\n", 10)).toEqual([11]);
  });

  test("finds nothing in a file without directives or inside an unclosed fence", () => {
    expect(directiveLines("a\nb\n")).toEqual([]);
    expect(directiveLines("```\n<!-- factory:when env.harness == amp -->\n")).toEqual([]);
  });
});
