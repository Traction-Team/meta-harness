import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { findImportConflicts } from "../../../src/core/import/conflicts.js";
import type { LocalPaths } from "../../../src/core/import/conflicts.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function incomingFab(files: readonly string[]): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "metafab-import-conflicts-"));
  directories.push(root);
  for (const relativePath of files) {
    const target = path.join(root, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "incoming\n");
  }
  return root;
}

function entry(text: string) {
  return { hash: text, mode: 0o644, binary: false, text };
}

/**
 * Paths that a case-sensitive filesystem can hold and the preflight has to
 * choose between. They cannot be created on macOS or Windows, so the index is
 * built directly; the CLI-level case is skipped there.
 */
describe("import ambiguities", () => {
  test("two local directories that fold to one incoming directory are one ambiguity", async () => {
    const root = await incomingFab(["SKILLS/a.md"]);
    const local: LocalPaths = {
      files: new Map(),
      directories: new Map([
        ["Skills", ".factory/Skills"],
        ["skills", ".factory/skills"],
      ]),
    };

    const { conflicts, ambiguities } = await findImportConflicts(root, local);

    expect(conflicts).toEqual([]);
    expect(ambiguities).toEqual([
      {
        level: "error",
        file: ".factory/Skills",
        message:
          "The incoming fab writes SKILLS, but these local entries differ only in case: .factory/Skills, .factory/skills",
        fix: "Move all but one of the local entries away, then run metafab import again",
      },
    ]);
  });

  test("two local files that fold to one incoming file are one ambiguity", async () => {
    const root = await incomingFab(["templates/note.md"]);
    const local: LocalPaths = {
      files: new Map([
        ["templates/Note.md", { entry: entry("one"), file: ".factory/templates/Note.md" }],
        ["templates/note.md", { entry: entry("two"), file: ".factory/templates/note.md" }],
      ]),
      directories: new Map([["templates", ".factory/templates"]]),
    };

    const { conflicts, ambiguities } = await findImportConflicts(root, local);

    expect(conflicts).toEqual([]);
    expect(ambiguities.map((problem) => problem.file)).toEqual([".factory/templates/Note.md"]);
    expect(ambiguities[0]?.message).toBe(
      "The incoming fab writes templates/note.md, but these local entries differ only in case: .factory/templates/Note.md, .factory/templates/note.md",
    );
  });
});
