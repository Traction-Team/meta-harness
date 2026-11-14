import { describe, expect, test } from "vitest";
import { parseFactoryYaml, rule5NameFormat, rule10ReservedPrefix, validateFactory } from "../../../src/core/factory/index.js";
import type { Factory, Skill } from "../../../src/core/factory/index.js";

const FILE = ".factory/factory.yaml";

function parse(text: string) {
  return parseFactoryYaml(text, FILE);
}

function skill(name: string): Skill {
  return {
    name,
    relDir: `skills/${name}`,
    group: "skills",
    isWorkflow: false,
    frontmatter: { name, description: "Demo skill." },
    frontmatterLines: { start: 1, end: 3 },
  };
}

describe("pipeline entries", () => {
  test("parses a string entry and a mapping entry", () => {
    const result = parse(
      "format: 1\nname: mark4\npipeline:\n  - build-slice\n  - review-slice: { stop: The owner approves }\n",
    );

    expect(result.problems).toEqual([]);
    expect(result.yaml?.pipeline).toEqual([
      { workflow: "build-slice", line: 4 },
      { workflow: "review-slice", stop: "The owner approves", line: 5 },
    ]);
  });

  test("accepts an empty option mapping", () => {
    const result = parse("format: 1\nname: mark4\npipeline:\n  - review-slice: {}\n");

    expect(result.problems).toEqual([]);
    expect(result.yaml?.pipeline).toEqual([{ workflow: "review-slice", line: 4 }]);
  });

  test("rejects an empty entry", () => {
    const result = parse("format: 1\nname: mark4\npipeline:\n  - {}\n");

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 4,
        message: "Pipeline entry must name a workflow",
        fix: "Use - <workflow>",
      },
    ]);
    expect(result.yaml?.pipeline).toEqual([]);
  });

  test("rejects an empty stop text", () => {
    const result = parse('format: 1\nname: mark4\npipeline:\n  - review-slice: { stop: "" }\n');

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 4,
        message: 'Pipeline option "stop" must be a non-empty string',
        fix: "Write a one-line stop instruction",
      },
    ]);
    expect(result.yaml?.pipeline).toEqual([{ workflow: "review-slice", line: 4 }]);
  });

  test("rejects a multi-line stop text", () => {
    const result = parse(
      'format: 1\nname: mark4\npipeline:\n  - review-slice: { stop: "Line one\\nLine two" }\n',
    );

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 4,
        message: 'Pipeline option "stop" must be a single line',
        fix: "Write the stop instruction on one line",
      },
    ]);
  });

  test("rejects two workflow keys in one entry", () => {
    const result = parse(
      "format: 1\nname: mark4\npipeline:\n  - review-slice:\n      stop: One\n    build-slice: {}\n",
    );

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 4,
        message: "Pipeline entry must contain exactly one workflow",
        fix: "Use one workflow per entry",
      },
    ]);
  });

  test("keeps valid entries when another entry is invalid", () => {
    const result = parse("format: 1\nname: mark4\npipeline:\n  - {}\n  - build-slice\n");

    expect(result.yaml?.pipeline).toEqual([{ workflow: "build-slice", line: 5 }]);
  });
});

describe("YAML aliases", () => {
  test("resolves a shared options mapping", () => {
    const result = parse(
      "format: 1\nname: mark4\npipeline:\n  - review-slice: &gate { stop: Wait for approval }\n  - finish-slice: *gate\n",
    );

    expect(result.problems).toEqual([]);
    expect(result.yaml?.pipeline).toEqual([
      { workflow: "review-slice", stop: "Wait for approval", line: 4 },
      { workflow: "finish-slice", stop: "Wait for approval", line: 5 },
    ]);
  });

  test("resolves a scalar anchor in an option value", () => {
    const result = parse(
      "format: 1\nname: mark4\npipeline:\n  - review-slice: { stop: &s Wait }\n  - finish-slice: { stop: *s }\n",
    );

    expect(result.problems).toEqual([]);
    expect(result.yaml?.pipeline).toEqual([
      { workflow: "review-slice", stop: "Wait", line: 4 },
      { workflow: "finish-slice", stop: "Wait", line: 5 },
    ]);
  });

  test("reports an anchored unknown field, not the aliased entry", () => {
    const result = parse(
      "format: 1\nname: mark4\nx-build: &build { stop: Wait }\npipeline:\n  - review-slice: *build\n",
    );

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 3,
        message: 'Unknown field "x-build" in factory.yaml',
        fix: "Remove the field or use a known name: format, name, description, pipeline, requires",
      },
    ]);
    expect(result.problems.some((problem) => problem.message.includes("must be a workflow name"))).toBe(
      false,
    );
  });

  test("reports an alias with no anchor as a grammar problem", () => {
    const result = parse("format: 1\nname: mark4\npipeline:\n  - review-slice: *missing\n");

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 4,
        message: "Alias *missing has no anchor",
        fix: "Remove the alias or define its anchor before it",
      },
    ]);
    expect(result.yaml).toBeUndefined();
  });
});

describe("format", () => {
  test.each(["1", "01", "+1", "0x1", "0o1"])("accepts the YAML 1.2 integer literal %s", (literal) => {
    const result = parse(`format: ${literal}\nname: mark4\n`);

    expect(result.problems).toEqual([]);
    expect(result.yaml?.format).toBe(1);
  });

  test.each(["1.0", "1.00", "1e0"])("rejects the non-integer literal %s", (literal) => {
    const result = parse(`format: ${literal}\nname: mark4\n`);

    expect(result.yaml).toBeUndefined();
    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 1,
        message: '"format" must be the integer 1',
        fix: "Set format to 1",
      },
    ]);
  });
});

describe("factory.yaml keys", () => {
  test("reports a non-string pipeline option key", () => {
    const result = parse("format: 1\nname: mark4\npipeline:\n  - build-slice: { 1: x }\n");

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 4,
        message: "Pipeline option names must be strings",
        fix: 'Remove the option or use the "stop" option',
      },
    ]);
  });

  test("reports a non-string top-level key", () => {
    const result = parse("? [a]\n: b\nformat: 1\nname: mark4\n");

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 1,
        message: "factory.yaml field names must be strings",
        fix: "Use a string field name",
      },
    ]);
    expect(result.yaml?.name).toBe("mark4");
  });
});

describe("fallback fixes", () => {
  test("reports an unknown field without a suggestion", () => {
    const result = parse("format: 1\nname: mark4\nzzz: 1\n");

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 3,
        message: 'Unknown field "zzz" in factory.yaml',
        fix: "Remove the field or use a known name: format, name, description, pipeline, requires",
      },
    ]);
  });

  test("reports an unknown pipeline option without a suggestion", () => {
    const result = parse("format: 1\nname: mark4\npipeline:\n  - review-slice: { zzz: 1 }\n");

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 4,
        message: 'Unknown pipeline option "zzz"',
        fix: 'Remove the option or use the "stop" option',
      },
    ]);
  });
});

describe("rule 5", () => {
  test.each(["valid-name", "a", "a1-b2", "a".repeat(64)])("accepts %s", (name) => {
    expect(rule5NameFormat(skill(name))).toEqual([]);
  });

  test.each(["-leading", "trailing-", "double--hyphen", "Bad_Name", "a".repeat(65)])(
    "rejects %s",
    (name) => {
      expect(rule5NameFormat(skill(name))).toHaveLength(1);
    },
  );
});

describe("rule 10", () => {
  test("rejects a name that starts with metafab", () => {
    expect(rule10ReservedPrefix(skill("metafab-extra"))).toHaveLength(1);
    expect(rule10ReservedPrefix(skill("metafab"))).toHaveLength(1);
  });

  test("accepts other names", () => {
    expect(rule10ReservedPrefix(skill("meta-fab"))).toEqual([]);
  });
});

describe("validateFactory", () => {
  test("a missing name does not cascade into later rules", () => {
    const factory: Factory = {
      root: "/tmp/demo",
      dir: "/tmp/demo/.factory",
      skills: [
        {
          name: "demo",
          relDir: "skills/demo",
          group: "skills",
          isWorkflow: false,
          frontmatter: { description: "Demo skill." },
          frontmatterLines: { start: 1, end: 3 },
        },
      ],
      problems: [],
    };

    const problems = validateFactory(factory);

    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toBe('SKILL.md is missing a "name" field');
  });
});
