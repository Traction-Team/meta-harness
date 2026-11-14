import { describe, expect, test } from "vitest";
import {
  parseFactoryYaml,
  rule12RequirementPath,
  rule12UniqueRequirements,
  validateFactory,
} from "../../../src/core/factory/index.js";
import type { Factory, Requirement } from "../../../src/core/factory/index.js";

const FILE = ".factory/factory.yaml";

const HEAD = "format: 1\nname: mark4\n";

function parse(text: string) {
  return parseFactoryYaml(text, FILE);
}

function requirement(path: string, line = 1, extra: Partial<Requirement> = {}): Requirement {
  return { path, description: "A file.", line, ...extra };
}

describe("requires grammar", () => {
  test("parses entries with lines and an optional template", () => {
    const result = parse(
      `${HEAD}requires:
  - path: opencode.json
    description: Defines the agent-coding sub-agent
    template: .factory/templates/setup/opencode.json
  - path: docs/roadmap.md
    description: The roadmap the workflows read
`,
    );

    expect(result.problems).toEqual([]);
    expect(result.yaml?.requires).toEqual([
      {
        path: "opencode.json",
        description: "Defines the agent-coding sub-agent",
        template: ".factory/templates/setup/opencode.json",
        line: 4,
      },
      {
        path: "docs/roadmap.md",
        description: "The roadmap the workflows read",
        line: 7,
      },
    ]);
    expect(result.requires).toEqual(result.yaml?.requires);
  });

  test("absent, null and empty lists all mean no requirements", () => {
    const absent = parse(`${HEAD}pipeline: []\n`);
    const nullValue = parse(`${HEAD}requires:\n`);
    const empty = parse(`${HEAD}requires: []\n`);

    for (const result of [absent, nullValue, empty]) {
      expect(result.problems).toEqual([]);
      expect(result.yaml?.requires).toEqual([]);
      expect(result.requires).toEqual([]);
    }
  });

  test("fills requires even when factory.yaml is otherwise invalid", () => {
    const result = parse(
      "format: 2\nrequires:\n  - path: opencode.json\n    description: Agents\n",
    );

    expect(result.yaml).toBeUndefined();
    expect(result.requires).toEqual([
      { path: "opencode.json", description: "Agents", line: 3 },
    ]);
  });

  test("rejects requires that is not a list", () => {
    const result = parse(`${HEAD}requires:\n  path: opencode.json\n`);

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 3,
        message: '"requires" must be a list',
        fix: "Write each required file as a - path: entry",
      },
    ]);
  });

  test("rejects an entry that is not a mapping", () => {
    const result = parse(`${HEAD}requires:\n  - opencode.json\n`);

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 4,
        message: "requires entry must be a mapping",
        fix: "Use - path: <file>\n  description: <text>",
      },
    ]);
    expect(result.yaml?.requires).toEqual([]);
  });

  test("rejects an unknown key with a did-you-mean", () => {
    const result = parse(
      `${HEAD}requires:\n  - path: opencode.json\n    descrption: Agents\n`,
    );

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 5,
        message: 'Unknown key "descrption" in a requires entry',
        fix: 'Did you mean "description"?',
      },
      {
        level: "error",
        file: FILE,
        line: 4,
        message: 'requires entry is missing "description"',
        fix: "Add a one-line description",
      },
    ]);
  });

  test("rejects an unknown key without a suggestion", () => {
    const result = parse(
      `${HEAD}requires:\n  - path: opencode.json\n    description: Agents\n    x: 1\n`,
    );

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 6,
        message: 'Unknown key "x" in a requires entry',
        fix: "Remove the key or use path, description or template",
      },
    ]);
  });

  test("rejects a missing path", () => {
    const result = parse(`${HEAD}requires:\n  - description: Agents\n`);

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 4,
        message: 'requires entry is missing "path"',
        fix: "Add a path: <file> key",
      },
    ]);
    expect(result.yaml?.requires).toEqual([]);
  });

  test("rejects an empty description", () => {
    const result = parse(`${HEAD}requires:\n  - path: opencode.json\n    description: ""\n`);

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 5,
        message: '"description" in a requires entry must be a non-empty, single-line string',
        fix: "Write the description on one line",
      },
    ]);
  });

  test("rejects a multi-line description", () => {
    const result = parse(
      `${HEAD}requires:\n  - path: opencode.json\n    description: "One\\nTwo"\n`,
    );

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 5,
        message: '"description" in a requires entry must be a non-empty, single-line string',
        fix: "Write the description on one line",
      },
    ]);
  });

  test("rejects a path that is not a string", () => {
    const result = parse(`${HEAD}requires:\n  - path: 1\n    description: Agents\n`);

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 4,
        message: '"path" in a requires entry must be a non-empty, single-line string',
        fix: "Write the path on one line",
      },
    ]);
  });

  test("rejects a template that is not a string", () => {
    const result = parse(
      `${HEAD}requires:\n  - path: opencode.json\n    description: Agents\n    template: []\n`,
    );

    expect(result.problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 6,
        message: '"template" in a requires entry must be a non-empty, single-line string',
        fix: "Write the template on one line",
      },
    ]);
  });

  test("a duplicate key is a YAML error", () => {
    const result = parse(
      `${HEAD}requires:\n  - path: one.json\n    path: two.json\n    description: Agents\n`,
    );

    expect(result.problems[0]).toMatchObject({
      level: "error",
      file: FILE,
      message: "Map keys must be unique",
    });
  });

  test("keeps valid entries when another entry is invalid", () => {
    const result = parse(
      `${HEAD}requires:\n  - path: ""\n    description: Bad\n  - path: docs/roadmap.md\n    description: Good\n`,
    );

    expect(result.yaml?.requires).toEqual([
      { path: "docs/roadmap.md", description: "Good", line: 6 },
    ]);
  });
});

describe("rule 12", () => {
  test("reports a refused path with its line and fix", () => {
    expect(rule12RequirementPath(FILE, requirement("../x", 7))).toEqual([
      {
        level: "error",
        file: FILE,
        line: 7,
        message: 'Required path "../x" leaves the repository',
        fix: "Use a repository-relative file path outside .factory/, such as docs/factory.md",
      },
    ]);
  });

  test.each([
    ["/abs", "leaves the repository"],
    ["a/../b", "leaves the repository"],
    ["a//b", "has an empty segment"],
    ["a/", "ends with a slash"],
    ["a\\b", "uses a backslash"],
    ["C:x", "contains a character Windows cannot use"],
    ["a.", "has a segment that ends in a dot or a space"],
    ["a ", "has a segment that ends in a dot or a space"],
    ["CON.txt", "uses a Windows device name"],
    [".GIT/x", "is read by Git as .git"],
    [".factory/x", "is inside .factory/"],
    [".Factory/x", "is inside .factory/"],
    [".claude/skills/x/SKILL.md", "is a file Metafab writes"],
    [".claude/skills", "is a file Metafab writes"],
    ["AGENTS.md", "is a file Metafab writes"],
    ["agents.md", "is a file Metafab writes"],
    [".gitattributes", "is a file Metafab writes"],
    [".gitignore/x", "is a file Metafab writes"],
    ["CLAUDE.md/x", "is a file Metafab writes"],
  ])("refuses %j", (path, phrase) => {
    const problems = rule12RequirementPath(FILE, requirement(path));

    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toBe(`Required path "${path}" ${phrase}`);
    expect(problems[0]?.fix).toBe(
      "Use a repository-relative file path outside .factory/, such as docs/factory.md",
    );
  });

  test.each(["docs/factory.md", ".github/x.yml"])("accepts %s", (path) => {
    expect(rule12RequirementPath(FILE, requirement(path))).toEqual([]);
  });

  test("reports a repeat that differs only in case", () => {
    const problems = rule12UniqueRequirements(FILE, [
      requirement("OpenCode.json", 4),
      requirement("opencode.json", 6),
    ]);

    expect(problems).toEqual([
      {
        level: "error",
        file: FILE,
        line: 6,
        message: 'Required path "opencode.json" repeats "OpenCode.json"',
        fix: "Remove one of the entries",
      },
    ]);
  });

  test("reports a path inside another, in either order", () => {
    expect(
      rule12UniqueRequirements(FILE, [requirement("docs", 4), requirement("docs/roadmap.md", 6)]),
    ).toEqual([
      {
        level: "error",
        file: FILE,
        line: 6,
        message: 'Required path "docs/roadmap.md" is inside required path "docs"',
        fix: "Remove one of the entries",
      },
    ]);

    expect(
      rule12UniqueRequirements(FILE, [requirement("Docs/Roadmap.md", 4), requirement("docs", 6)]),
    ).toEqual([
      {
        level: "error",
        file: FILE,
        line: 6,
        message: 'Required path "Docs/Roadmap.md" is inside required path "docs"',
        fix: "Remove one of the entries",
      },
    ]);
  });

  test("accepts names that only share a prefix", () => {
    expect(
      rule12UniqueRequirements(FILE, [
        requirement("docs/roadmap.md"),
        requirement("docs/roadmap-archive.md"),
        requirement("docs2/roadmap.md"),
      ]),
    ).toEqual([]);
  });

  test("validateFactory reports rule 12 problems", () => {
    const result = parse(
      `${HEAD}requires:\n  - path: .factory/x\n    description: Bad\n  - path: docs/x\n    description: One\n  - path: docs/x\n    description: Two\n`,
    );
    const factory: Factory = {
      root: "/tmp/demo",
      dir: "/tmp/demo/.factory",
      factoryYaml: result.yaml,
      skills: [],
      problems: [],
    };

    const problems = validateFactory(factory);

    expect(problems.map((problem) => problem.message)).toEqual([
      'Required path ".factory/x" is inside .factory/',
      'Required path "docs/x" repeats "docs/x"',
    ]);
  });
});
