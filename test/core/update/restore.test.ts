import { chmod, mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, test } from "vitest";
import { captureFactory } from "../../../src/core/update/restore.js";
import { makeRepo, writeRepoFiles } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";
import { walkRaw } from "./raw-tree.js";

const repos: TempRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

async function factoryRepo(files: Record<string, string>): Promise<TempRepo> {
  const repo = await makeRepo(files);
  repos.push(repo);
  return repo;
}

describe("captureFactory", () => {
  test("restores bytes, modes, directories and empty directories, and removes extras", async () => {
    const repo = await factoryRepo({
      ".factory/AGENTS.md": "# Agents\n",
      ".factory/keep.txt": "keep\n",
      ".factory/Nested/Deeper/file.md": "nested\n",
    });
    await mkdir(repo.path(".factory", "Empty"), { recursive: true });
    await chmod(repo.path(".factory", "AGENTS.md"), 0o755);
    const factoryDir = repo.path(".factory");
    const before = await walkRaw(factoryDir);

    const capture = await captureFactory(factoryDir);
    try {
      await writeFile(repo.path(".factory", "AGENTS.md"), "# Changed\n");
      await chmod(repo.path(".factory", "AGENTS.md"), 0o644);
      await rm(repo.path(".factory", "Empty"), { recursive: true, force: true });
      await rm(repo.path(".factory", "keep.txt"), { force: true });
      await writeRepoFiles(repo.root, { ".factory/Extra/added.md": "extra\n" });
      // A case-only rename is how a case-insensitive filesystem reports the
      // source's spelling after an update realigned it.
      await rename(repo.path(".factory", "Nested"), repo.path(".factory", "nested"));

      await capture.restore();

      expect(await walkRaw(factoryDir)).toEqual(before);
    } finally {
      await capture.discard();
    }
  });

  test.skipIf(process.platform === "win32")("restores a link's target", async () => {
    const repo = await factoryRepo({ ".factory/target.md": "# Target\n" });
    await symlink("target.md", repo.path(".factory", "alias.md"));
    const factoryDir = repo.path(".factory");
    const before = await walkRaw(factoryDir);

    const capture = await captureFactory(factoryDir);
    try {
      await rm(repo.path(".factory", "alias.md"));
      await symlink("other.md", repo.path(".factory", "alias.md"));

      await capture.restore();

      expect(await walkRaw(factoryDir)).toEqual(before);
    } finally {
      await capture.discard();
    }
  });

  test("discard leaves .factory/ as it is and is safe to call twice", async () => {
    const repo = await factoryRepo({ ".factory/AGENTS.md": "# Agents\n" });
    const factoryDir = repo.path(".factory");
    const capture = await captureFactory(factoryDir);
    await writeFile(repo.path(".factory", "AGENTS.md"), "# Changed\n");

    await capture.discard();
    await capture.discard();

    const after = await walkRaw(factoryDir);
    expect(after.map(({ path, kind, data }) => ({ path, kind, data }))).toEqual([
      {
        path: "AGENTS.md",
        kind: "file",
        data: Buffer.from("# Changed\n").toString("base64"),
      },
    ]);
  });
});
