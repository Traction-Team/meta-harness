import { describe, expect, test } from "vitest";
import type { FileEntry } from "../../../src/core/import/file-tree.js";
import { alignTreeSpelling } from "../../../src/core/update/spelling.js";

function entry(text: string): FileEntry {
  return { hash: text, mode: 0o644, binary: false, text };
}

/**
 * Selection rules for a case-folding path, tested on an in-memory snapshot so
 * they run the same on a case-sensitive and a case-insensitive filesystem.
 */
describe("spelling alignment", () => {
  test("prefers an exact spelling and leaves the other local entry alone", () => {
    const aligned = alignTreeSpelling(
      { "AGENTS.md": entry("source spelling"), "agents.md": entry("local only") },
      { files: ["AGENTS.md"], directories: [] },
    );

    expect(Object.keys(aligned).sort()).toEqual(["AGENTS.md", "agents.md"]);
    expect(aligned["AGENTS.md"]?.text).toBe("source spelling");
    expect(aligned["agents.md"]?.text).toBe("local only");
  });

  test("refuses when several local spellings fold to the incoming path and none matches", () => {
    expect(() =>
      alignTreeSpelling(
        { "Agents.md": entry("one"), "agents.md": entry("two") },
        { files: ["AGENTS.md"], directories: [] },
      ),
    ).toThrow(/differ only in case/);
  });

  test("moves a local-only file with a case-only directory rename", () => {
    const aligned = alignTreeSpelling(
      {
        "Skills/guide/SKILL.md": entry("skill"),
        "Skills/local.md": entry("local only"),
      },
      {
        files: ["skills/guide/SKILL.md"],
        directories: ["skills", "skills/guide"],
      },
    );

    expect(Object.keys(aligned).sort()).toEqual([
      "skills/guide/SKILL.md",
      "skills/local.md",
    ]);
    expect(aligned["skills/local.md"]?.text).toBe("local only");
  });

  test("keeps a differently-spelled local directory beside an exact one", () => {
    const aligned = alignTreeSpelling(
      {
        "Skills/local.md": entry("local only"),
        "skills/guide/SKILL.md": entry("skill"),
      },
      {
        files: ["skills/guide/SKILL.md"],
        directories: ["skills", "skills/guide"],
      },
    );

    expect(Object.keys(aligned).sort()).toEqual([
      "Skills/local.md",
      "skills/guide/SKILL.md",
    ]);
  });
});
