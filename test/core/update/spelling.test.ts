import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { FileEntry } from "../../../src/core/import/file-tree.js";
import { alignFactorySpelling, alignTreeSpelling } from "../../../src/core/update/spelling.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "metafab-spelling-"));
  directories.push(directory);
  return directory;
}

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

describe("spelling alignment on disk", () => {
  test("renames a directory that differs only in case and keeps a local-only file", async () => {
    const factory = await scratch();
    await mkdir(path.join(factory, "Skills", "guide"), { recursive: true });
    await writeFile(path.join(factory, "Skills", "guide", "SKILL.md"), "skill\n");
    await writeFile(path.join(factory, "Skills", "local.md"), "local\n");

    await alignFactorySpelling(factory, {
      files: ["skills/guide/SKILL.md"],
      directories: ["skills", "skills/guide"],
    });

    expect(await readFile(path.join(factory, "skills", "guide", "SKILL.md"), "utf8")).toBe("skill\n");
    expect(await readFile(path.join(factory, "skills", "local.md"), "utf8")).toBe("local\n");
    expect(await readdir(factory)).toContain("skills");
    expect(await readdir(factory)).not.toContain("Skills");
  });

  test("skips a component that is a local file, leaving it for the copy", async () => {
    const factory = await scratch();
    await writeFile(path.join(factory, "templates"), "local file\n");

    await expect(
      alignFactorySpelling(factory, {
        files: ["templates/note.md"],
        directories: ["templates"],
      }),
    ).resolves.toBeUndefined();

    expect(await readFile(path.join(factory, "templates"), "utf8")).toBe("local file\n");
  });
});
