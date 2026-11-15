import { describe, expect, test } from "vitest";
import { parseFactoryYaml } from "../../../src/core/factory/index.js";

const FILE = ".factory/factory.yaml";

function parse(text: string) {
  return parseFactoryYaml(text, FILE);
}

/** Eleven two-value variables, for the combination bound. */
const ELEVEN = Array.from({ length: 11 }, (_, index) => `v${index}`);
const ELEVEN_ENV = ELEVEN.map((name) => `  ${name}: { values: [one, two] }`).join("\n");
const ELEVEN_CONDITION = ELEVEN.map((name) => `env.${name} == one`).join(" and ");

describe("skills declarations", () => {
  test("reads an entry's condition and line in declaration order", () => {
    const result = parse(
      [
        "format: 2",
        "name: demo",
        "env:",
        "  harness: { values: [opencode, amp] }",
        "skills:",
        "  amp-threads: { when: env.harness == amp }",
        "  orca-worktrees:",
        "    when: env.harness != amp",
        "",
      ].join("\n"),
    );

    expect(result.problems).toEqual([]);
    expect(result.yaml?.skills).toEqual([
      {
        name: "amp-threads",
        condition: { kind: "test", variable: "harness", values: ["amp"], negate: false },
        line: 6,
      },
      {
        name: "orca-worktrees",
        condition: { kind: "test", variable: "harness", values: ["amp"], negate: true },
        line: 7,
      },
    ]);
  });

  test.each(["skills:\n", "skills: {}\n"])("accepts %j with no entries", (skills) => {
    const result = parse(`format: 2\nname: demo\n${skills}`);

    expect(result.problems).toEqual([]);
    expect(result.yaml?.skills).toEqual([]);
  });

  test("a factory without skills declares no conditions", () => {
    const result = parse("format: 1\nname: demo\n");

    expect(result.problems).toEqual([]);
    expect(result.yaml?.skills).toEqual([]);
  });

  test("parses the entries of a format 1 factory so their own errors show", () => {
    const result = parse(
      [
        "format: 1",
        "name: demo",
        "env:",
        "  harness: { values: [amp] }",
        "skills:",
        "  demo: { when: env.harness == amp }",
        "",
      ].join("\n"),
    );

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 3,
        message: '"env" needs format: 2',
        fix: "Set format: 2",
      },
      {
        level: "error",
        file: FILE,
        line: 5,
        message: '"skills" needs format: 2',
        fix: "Set format: 2",
      },
    ]);
    expect(result.yaml?.skills).toEqual([
      {
        name: "demo",
        condition: { kind: "test", variable: "harness", values: ["amp"], negate: false },
        line: 6,
      },
    ]);
  });

  test("refuses a skills value that is not a mapping", () => {
    const result = parse("format: 2\nname: demo\nskills: [demo]\n");

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 3,
        message: '"skills" must be a mapping of skill names',
        fix: "Write each skill as <name>: { when: <condition> }",
      },
    ]);
    expect(result.yaml?.skills).toEqual([]);
  });

  test("refuses an entry that is not a mapping", () => {
    const result = parse("format: 2\nname: demo\nskills:\n  demo: env.harness == amp\n");

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 4,
        message: 'Skill entry "demo" must be { when: <condition> }',
        fix: "Write demo: { when: env.<variable> == <value> }",
      },
    ]);
  });

  test("refuses an entry key that is not a string", () => {
    const result = parse("format: 2\nname: demo\nskills:\n  1: { when: env.harness == amp }\n");

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 4,
        message: 'Skill name "1" must be a string',
        fix: "Use the skill's directory name as the key",
      },
    ]);
  });

  test("refuses an unknown key in an entry, suggesting when", () => {
    const result = parse(
      "format: 2\nname: demo\nenv:\n  harness: { values: [amp] }\nskills:\n  demo: { whenn: env.harness == amp }\n",
    );

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 6,
        message: 'Unknown key "whenn" in skill entry "demo"',
        fix: 'Did you mean "when"?',
      },
      {
        level: "error",
        file: FILE,
        line: 6,
        message: 'Skill entry "demo" is missing "when"',
        fix: "Add when: env.<variable> == <value>",
      },
    ]);
  });

  test("refuses an entry with no when", () => {
    const result = parse("format: 2\nname: demo\nskills:\n  demo: {}\n");

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 4,
        message: 'Skill entry "demo" is missing "when"',
        fix: "Add when: env.<variable> == <value>",
      },
    ]);
  });

  test("refuses an empty when", () => {
    const result = parse("format: 2\nname: demo\nskills:\n  demo: { when: }\n");

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 4,
        message: 'Skill entry "demo" needs a "when" condition',
        fix: "Write demo: { when: env.<variable> == <value> }",
      },
    ]);
  });

  test("refuses a condition that does not parse", () => {
    const result = parse(
      "format: 2\nname: demo\nenv:\n  harness: { values: [amp] }\nskills:\n  demo: { when: env.harness == }\n",
    );

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 6,
        message: 'Cannot read condition "env.harness ==": Trailing operator at "=="',
        fix: "Write env.<variable> == <value>, != <value> or in [<values>], joined with and, or, not and parentheses",
      },
    ]);
  });

  test("refuses a condition that names an undeclared variable", () => {
    const result = parse(
      "format: 2\nname: demo\nenv:\n  harness: { values: [amp] }\nskills:\n  demo: { when: env.harnes == amp }\n",
    );

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 6,
        message: 'Condition names unknown variable "harnes"',
        fix: 'Did you mean "harness"?',
      },
    ]);
  });

  test("refuses a condition that names an undeclared value", () => {
    const result = parse(
      "format: 2\nname: demo\nenv:\n  harness: { values: [amp] }\nskills:\n  demo: { when: env.harness == claude }\n",
    );

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 6,
        message: 'Condition names unknown value "claude" of harness',
        fix: "Use one of: amp",
      },
    ]);
  });

  test("accepts a condition over exactly 1024 combinations", () => {
    const names = ELEVEN.slice(0, 10);
    const result = parse(
      [
        "format: 2",
        "name: demo",
        "env:",
        names.map((name) => `  ${name}: { values: [one, two] }`).join("\n"),
        "skills:",
        `  demo: { when: ${names.map((name) => `env.${name} == one`).join(" and ")} }`,
        "",
      ].join("\n"),
    );

    expect(result.problems).toEqual([]);
  });

  test("refuses a condition that spans more than 1024 combinations", () => {
    const result = parse(
      [
        "format: 2",
        "name: demo",
        "env:",
        ELEVEN_ENV,
        "skills:",
        `  demo: { when: ${ELEVEN_CONDITION} }`,
        "",
      ].join("\n"),
    );

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 16,
        message: `Condition spans too many combinations: 2048 over ${ELEVEN.join(", ")}; the limit is 1024`,
        fix: "Split the condition, or nest fewer conditions",
      },
    ]);
  });
});
