import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { CONFIG_FILE, TARGETS, parseConfig } from "../../../src/core/config.js";

const fixture = (name: string): URL => new URL(`../../fixtures/config/${name}`, import.meta.url);

describe("parseConfig defaults", () => {
  test("empty text is an empty config with defaults", () => {
    const config = parseConfig("");

    expect(config.agents).toEqual(TARGETS);
    expect(config.agentsRaw).toBeUndefined();
    expect(config.metafabSkill).toBe(true);
    expect(config.publish).toBeUndefined();
    expect(config.upstream).toBeUndefined();
    expect(config.problems).toEqual([]);
    expect(config.doc.contents).toBeNull();
  });

  test("absent agents resolves to all targets", () => {
    const config = parseConfig("metafab-skill: true\n");

    expect(config.agents).toEqual(TARGETS);
    expect(config.agentsRaw).toBeUndefined();
  });

  test("agents: all resolves to all targets", () => {
    const config = parseConfig("agents: all\n");

    expect(config.agents).toEqual(TARGETS);
    expect(config.agentsRaw).toBe("all");
  });

  test("agents: [] resolves to no targets", () => {
    const config = parseConfig("agents: []\n");

    expect(config.agents).toEqual([]);
    expect(config.agentsRaw).toEqual([]);
  });

  test("agents: [claude, codex] keeps the listed order", () => {
    const config = parseConfig("agents: [claude, codex]\n");

    expect(config.agents).toEqual(["claude", "codex"]);
    expect(config.agentsRaw).toEqual(["claude", "codex"]);
  });

  test("metafab-skill defaults to true and reads the kebab-case key", () => {
    expect(parseConfig("").metafabSkill).toBe(true);
    expect(parseConfig("metafab-skill: false\n").metafabSkill).toBe(false);
  });

  test("a non-mapping document is an empty config", () => {
    const config = parseConfig("just a string\n");

    expect(config.agents).toEqual(TARGETS);
    expect(config.problems).toEqual([]);
  });
});

describe("parseConfig publish", () => {
  test("reads every publish key", () => {
    const config = parseConfig(
      [
        "publish:",
        "  name: '@seasb/fab-mark4'",
        "  git: git@github.com:seasb/fab-mark4.git",
        "  branch: main",
        "  version: 1.2.0",
        "  description: A factory.",
        "  license: MIT",
        "  access: public",
        "  readme: docs/fab-readme.md",
        "  keywords: [planning, review]",
        "  exclude: [skills/our-api/**]",
        "",
      ].join("\n"),
    );

    expect(config.publish).toEqual({
      name: "@seasb/fab-mark4",
      git: "git@github.com:seasb/fab-mark4.git",
      branch: "main",
      version: "1.2.0",
      description: "A factory.",
      license: "MIT",
      access: "public",
      readme: "docs/fab-readme.md",
      keywords: ["planning", "review"],
      exclude: ["skills/our-api/**"],
    });
  });
});

describe("parseConfig upstream", () => {
  test("reads an npm upstream", () => {
    const config = parseConfig("upstream:\n  source: '@seasb/fab-base'\n  requested: ^2.0.0\n  version: 2.1.0\n");

    expect(config.upstream).toEqual({
      kind: "npm",
      source: "@seasb/fab-base",
      requested: "^2.0.0",
      version: "2.1.0",
    });
  });

  test("reads a Git upstream without a version", () => {
    const config = parseConfig(
      "upstream:\n  source: github:seasb/fab-mark4\n  requested: main\n  commit: 3f9c2e1\n",
    );

    expect(config.upstream).toEqual({
      kind: "git",
      source: "github:seasb/fab-mark4",
      requested: "main",
      commit: "3f9c2e1",
    });
  });

  test("reads an unversioned upstream", () => {
    const config = parseConfig("upstream:\n  source: ../platform/.factory\n");

    expect(config.upstream).toEqual({ kind: "unversioned", source: "../platform/.factory" });
  });
});

describe("parseConfig problems", () => {
  test("the spec example parses with its comments intact", async () => {
    const text = await readFile(fixture("spec-example.yaml"), "utf8");
    const config = parseConfig(text);

    expect(config.problems).toEqual([]);
    expect(config.agents).toEqual(["claude", "codex"]);
    expect(config.metafabSkill).toBe(true);
    expect(config.publish?.version).toBe("1.2.0");
    expect(config.upstream?.kind).toBe("npm");
    expect(config.doc.toString()).toContain("# Written by metafab import. Do not edit.");
  });

  test("invalid YAML reports one error problem and keeps defaults", async () => {
    const text = await readFile(fixture("invalid.yaml"), "utf8");
    const config = parseConfig(text);

    expect(config.problems).toHaveLength(1);
    expect(config.problems[0]?.level).toBe("error");
    expect(config.problems[0]?.file).toBe(CONFIG_FILE);
    expect(config.problems[0]?.line).toBeGreaterThan(0);
    expect(config.problems[0]?.message).toMatch(/^Invalid YAML:/);
    expect(config.agents).toEqual(TARGETS);
    expect(config.metafabSkill).toBe(true);
  });
});
