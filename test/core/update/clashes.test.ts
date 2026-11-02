import { describe, expect, test } from "vitest";
import type { LocalFile, LocalPaths } from "../../../src/core/import/conflicts.js";
import type { FileEntry } from "../../../src/core/import/file-tree.js";
import { findPathClashes } from "../../../src/core/update/clashes.js";

function entry(): FileEntry {
  return { hash: "same", mode: 0o644, binary: false, text: "same\n" };
}

function local(files: readonly string[], directories: readonly string[]): LocalPaths {
  return {
    files: new Map<string, LocalFile>(
      files.map((file) => [file, { entry: entry(), file: `.factory/${file}` }]),
    ),
    directories: new Map(
      directories.map((directory) => [directory, `.factory/${directory}`]),
    ),
  };
}

describe("path clashes", () => {
  test("refuses a realigned file with an ancestor that folds to two local directories", () => {
    // The merge reconciled a case-only rename of `skills/keep/SKILL.md` to
    // `Skills/keep/SKILL.md`, but the local factory also has a sibling
    // `SKILLS/` directory. The realignment cannot tell which one `Skills`
    // means, so the preflight must refuse before any write or removal.
    const problems = findPathClashes(
      local(
        ["skills/keep/SKILL.md", "SKILLS/extra.md"],
        ["skills", "skills/keep", "SKILLS"],
      ),
      {
        files: ["Skills/keep/SKILL.md"],
        directories: [],
        renameCaseOnlyDirectories: true,
        mergedCaseOnlyFiles: ["Skills/keep/SKILL.md"],
      },
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain("differ only in case");
    expect(problems[0]?.message).toContain(".factory/skills");
    expect(problems[0]?.message).toContain(".factory/SKILLS");
  });

  test("accepts a realigned file whose only ancestor folds to one local directory", () => {
    const problems = findPathClashes(
      local(["Skills/guide/SKILL.md", "Skills/local.md"], ["Skills", "Skills/guide"]),
      {
        files: ["skills/guide/SKILL.md"],
        directories: [],
        renameCaseOnlyDirectories: true,
        mergedCaseOnlyFiles: ["skills/guide/SKILL.md"],
      },
    );

    expect(problems).toEqual([]);
  });
});
