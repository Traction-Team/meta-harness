import { chmod, mkdir, readFile, symlink } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { pathExists } from "../../../src/util/fs.js";
import { makeRepo, writeRepoFiles } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

/** When set, `readFile` fails with EIO for any path that ends with it. */
let unreadable: string | undefined;

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  unreadable = undefined;
  vi.mocked(readFile).mockImplementation((((file: string, options?: unknown) => {
    if (unreadable !== undefined && String(file).endsWith(unreadable)) {
      return Promise.reject(
        Object.assign(new Error("EIO: i/o error, read"), { code: "EIO" }),
      );
    }
    return (actual.readFile as (path: string, options?: unknown) => Promise<unknown>)(
      file,
      options,
    );
  }) as never));
});

const repos: TempRepo[] = [];

afterEach(async () => {
  unreadable = undefined;
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

async function gitRepo(files: RepoFiles = {}): Promise<TempRepo> {
  const repo = await makeRepo(files, { git: true });
  repos.push(repo);
  return repo;
}

describe("metafab init read errors", () => {
  test("an EIO on metafab.yaml is not reported as a permissions problem", async () => {
    const repo = await gitRepo({ ".factory/factory.yaml": "format: 1\nname: demo\n" });
    unreadable = "metafab.yaml";

    const result = await runCli(["init", "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Cannot read file .factory/metafab.yaml");
    expect(result.stderr).toContain("Restore the file, then run metafab init again");
    expect(result.stderr).not.toContain("Check its permissions");
    expect(await pathExists(repo.path(".factory", "AGENTS.md"))).toBe(false);
    expect(await pathExists(repo.path(".gitattributes"))).toBe(false);
  });

  test("a directory named metafab.yaml stops init before it writes anything", async () => {
    const repo = await gitRepo({ ".factory/factory.yaml": "format: 1\nname: demo\n" });
    await mkdir(repo.path(".factory", "metafab.yaml"));
    await writeRepoFiles(repo.root, { ".factory/metafab.yaml/keep.txt": "" });

    const result = await runCli(["init", "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Cannot read file .factory/metafab.yaml");
    expect(result.stderr).toContain("Restore the file, then run metafab init again");
    expect(await pathExists(repo.path(".factory", "AGENTS.md"))).toBe(false);
    expect(await pathExists(repo.path(".gitattributes"))).toBe(false);
  });

  test.skipIf(process.platform === "win32")(
    "a dangling factory.yaml symlink stops init before it writes anything",
    async () => {
      const repo = await gitRepo({ ".factory/keep.txt": "" });
      await symlink("../stray.yaml", repo.path(".factory", "factory.yaml"));

      const result = await runCli(["init", "--agents", "claude"], { cwd: repo.root });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("Cannot read .factory/factory.yaml");
      expect(await pathExists(repo.path("stray.yaml"))).toBe(false);
      expect(await pathExists(repo.path(".factory", "AGENTS.md"))).toBe(false);
      expect(await pathExists(repo.path(".factory", "metafab.yaml"))).toBe(false);
      expect(await pathExists(repo.path(".gitattributes"))).toBe(false);
    },
  );

  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "an unreadable factory.yaml stops init before it writes anything",
    async () => {
      const repo = await gitRepo({
        ".factory/factory.yaml": "format: 1\nname: demo\n",
        ".claude/skills/release/SKILL.md":
          "---\nname: release\ndescription: Use release when the task needs it.\n---\n\n# release\n",
      });
      const factoryFile = repo.path(".factory", "factory.yaml");
      await chmod(factoryFile, 0o000);

      try {
        const result = await runCli(["init", "--agents", "claude", "--adopt"], {
          cwd: repo.root,
        });

        expect(result.code).toBe(1);
        expect(result.stderr).toContain("Cannot read .factory/factory.yaml");
        expect(await pathExists(repo.path(".factory", "AGENTS.md"))).toBe(false);
        expect(await pathExists(repo.path(".factory", "metafab.yaml"))).toBe(false);
        expect(await pathExists(repo.path(".gitattributes"))).toBe(false);
        expect(await pathExists(repo.path(".factory", "skills", "release"))).toBe(false);
        expect(await pathExists(repo.path(".claude", "skills", "release", "SKILL.md"))).toBe(true);
      } finally {
        await chmod(factoryFile, 0o644);
      }
    },
  );
});
