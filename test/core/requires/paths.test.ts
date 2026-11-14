import { describe, expect, test } from "vitest";
import {
  FACTORY_TEMPLATES_PREFIX,
  FORBIDDEN_REQUIREMENT_DIRECTORIES,
  FORBIDDEN_REQUIREMENT_TARGETS,
  factoryRelative,
  requirementPathProblem,
} from "../../../src/core/requires/paths.js";

describe("requirementPathProblem", () => {
  test.each([
    ["", "is empty"],
    ["/abs", "leaves the repository"],
    ["a/../b", "leaves the repository"],
    ["..", "leaves the repository"],
    ["a//b", "has an empty segment"],
    ["a/", "ends with a slash"],
    ["a\\b", "uses a backslash"],
    ["C:x", "contains a character Windows cannot use"],
    ["a*", "contains a character Windows cannot use"],
    ["a?", "contains a character Windows cannot use"],
    ['a"', "contains a character Windows cannot use"],
    ["a<", "contains a character Windows cannot use"],
    ["a>", "contains a character Windows cannot use"],
    ["a|", "contains a character Windows cannot use"],
    ["a\u0001", "contains a character Windows cannot use"],
    [".", 'has a "." segment'],
    ["a/.", 'has a "." segment'],
    ["a.", "has a segment that ends in a dot or a space"],
    ["a ", "has a segment that ends in a dot or a space"],
    ["dir/a./b", "has a segment that ends in a dot or a space"],
    ["CON", "uses a Windows device name"],
    ["CON.txt", "uses a Windows device name"],
    ["con", "uses a Windows device name"],
    ["dir/LPT9.log", "uses a Windows device name"],
    [".GIT/x", "is read by Git as .git"],
    [".git", "is read by Git as .git"],
    [".git/x", "is read by Git as .git"],
    [".factory", "is inside .factory/"],
    [".factory/x", "is inside .factory/"],
    [".Factory/x", "is inside .factory/"],
    [".claude/skills", "is a file Metafab writes"],
    [".claude/skills/x/SKILL.md", "is a file Metafab writes"],
    [".CLAUDE/Skills/x", "is a file Metafab writes"],
    [".agents/skills", "is a file Metafab writes"],
    [".claude", "is a directory that holds a file Metafab writes"],
    [".CLAUDE", "is a directory that holds a file Metafab writes"],
    [".agents", "is a directory that holds a file Metafab writes"],
    [".AGENTS", "is a directory that holds a file Metafab writes"],
    ["AGENTS.md", "is a file Metafab writes"],
    ["agents.md", "is a file Metafab writes"],
    ["AGENTS.md/x", "is a file Metafab writes"],
    ["CLAUDE.md", "is a file Metafab writes"],
    ["CLAUDE.md/x", "is a file Metafab writes"],
    [".gitignore", "is a file Metafab writes"],
    [".gitignore/x", "is a file Metafab writes"],
    [".gitattributes", "is a file Metafab writes"],
  ])("refuses %j: %s", (value, phrase) => {
    expect(requirementPathProblem(value)).toBe(phrase);
  });

  test.each([
    "docs/factory.md",
    ".github/x.yml",
    "opencode.json",
    "orca.yaml",
    "docs/AGENTS.md",
    "docs/.gitignore.md",
    ".claude/settings.json",
    ".agents/settings.json",
    "a.b/c",
    "nested/very/deep/file.txt",
  ])("accepts %s", (value) => {
    expect(requirementPathProblem(value)).toBeUndefined();
  });

  test("refuses the directory that holds a forbidden target, but not a path below it", () => {
    for (const directory of FORBIDDEN_REQUIREMENT_DIRECTORIES) {
      expect(requirementPathProblem(directory)).toBeDefined();
      expect(requirementPathProblem(directory.toUpperCase())).toBeDefined();
      expect(requirementPathProblem(`${directory}/settings.json`)).toBeUndefined();
      expect(requirementPathProblem(`${directory}/skills/x`)).toBeDefined();
    }
  });

  test("refuses every forbidden target and every path below it", () => {
    for (const target of FORBIDDEN_REQUIREMENT_TARGETS) {
      expect(requirementPathProblem(target)).toBeDefined();
      expect(requirementPathProblem(`${target}/below`)).toBeDefined();
      expect(requirementPathProblem(target.toUpperCase())).toBeDefined();
    }
  });
});

describe("factoryRelative", () => {
  test("drops the .factory/ prefix", () => {
    expect(factoryRelative(".factory/templates/setup/opencode.json")).toBe(
      "templates/setup/opencode.json",
    );
    expect(FACTORY_TEMPLATES_PREFIX).toBe(".factory/templates/");
  });
});
