import { chmod, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { emptyTree, snapshotFactory, snapshotTree } from "../../../src/core/import/file-tree.js";
import { writeRepoFiles } from "../../helpers/makeRepo.js";

const directories: string[] = [];

async function makeDir(files: Record<string, string | Uint8Array>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "metafab-tree-"));
  directories.push(dir);
  await writeRepoFiles(dir, files);
  return dir;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("snapshotTree", () => {
  test("keys files by their POSIX path relative to the directory", async () => {
    const dir = await makeDir({
      "AGENTS.md": "# Agents\n",
      "workflows/build-slice/SKILL.md": "# Build slice\n",
    });

    expect(Object.keys(await snapshotTree(dir)).sort()).toEqual([
      "AGENTS.md",
      "workflows/build-slice/SKILL.md",
    ]);
  });

  test("normalises text to LF and hashes it that way", async () => {
    const crlf = await makeDir({ "AGENTS.md": "# Agents\r\nBody\r\n" });
    const lf = await makeDir({ "AGENTS.md": "# Agents\nBody\n" });

    const crlfEntry = (await snapshotTree(crlf))["AGENTS.md"]!;
    const lfEntry = (await snapshotTree(lf))["AGENTS.md"]!;

    expect(crlfEntry.text).toBe("# Agents\nBody\n");
    expect(crlfEntry.binary).toBe(false);
    expect(crlfEntry.hash).toBe(lfEntry.hash);
  });

  test("records binary content as bytes", async () => {
    const data = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);
    const dir = await makeDir({ "templates/logo.png": data });

    const entry = (await snapshotTree(dir))["templates/logo.png"]!;

    expect(entry.binary).toBe(true);
    expect(entry.text).toBeUndefined();
    expect(Buffer.from(entry.data!)).toEqual(Buffer.from(data));
  });

  test("records permission bits", async () => {
    const dir = await makeDir({ "scripts/release.sh": "#!/bin/sh\n" });
    await chmod(path.join(dir, "scripts/release.sh"), 0o755);

    const entry = (await snapshotTree(dir))["scripts/release.sh"]!;

    expect(entry.mode & 0o777).toBe(0o755);
  });

  test("records symbolic links with their target", async () => {
    const dir = await makeDir({ "notes.md": "notes\n" });
    await symlink("notes.md", path.join(dir, "notes-link.md"));

    const tree = await snapshotTree(dir);

    expect(tree["notes-link.md"]).toMatchObject({ link: "notes.md", binary: false });
    expect(tree["notes-link.md"]!.hash).not.toBe(tree["notes.md"]!.hash);
  });

  test("snapshots .factory/ under a repository root", async () => {
    const dir = await makeDir({
      "factory.yaml": "format: 1\n",
      ".factory/factory.yaml": "format: 1\nname: mark4\npipeline: []\n",
    });

    expect(Object.keys(await snapshotFactory(dir))).toEqual(["factory.yaml"]);
  });

  test("an empty tree has no entries", async () => {
    expect(emptyTree()).toEqual({});
  });
});
