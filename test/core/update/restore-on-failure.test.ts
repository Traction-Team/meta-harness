import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { toLF } from "../../../src/util/text.js";
import { makeRepo, writeRepoFiles } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import {
  createGitFab,
  importFab,
  parseJson,
  updateFab,
  withFabEnvironment,
} from "./git-fab.js";
import type { GitFab } from "./git-fab.js";
import { walkRaw } from "./raw-tree.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    writeFile: vi.fn(actual.writeFile),
    copyFile: vi.fn(actual.copyFile),
    rename: vi.fn(actual.rename),
  };
});

/**
 * A count of writes under one `.factory/` before they start failing.
 *
 * `allowed` writes reach the filesystem; every later one throws `EPERM`. A
 * non-persistent seam fails once, so a restore that rewrites the files can
 * succeed. A persistent seam keeps failing, which is how a test makes the
 * restore itself fail.
 */
interface WriteSeam {
  factoryDir: string;
  allowed: number;
  persistent: boolean;
  count: number;
}

let writeSeam: WriteSeam | undefined;
let copySeam: WriteSeam | undefined;
let renameSeam: WriteSeam | undefined;

function within(factoryDir: string, target: string): boolean {
  return target === factoryDir || target.startsWith(factoryDir + path.sep);
}

function seamFails(seam: WriteSeam | undefined, target: string): boolean {
  if (seam === undefined || !within(seam.factoryDir, target)) return false;
  seam.count += 1;
  if (seam.count <= seam.allowed) return false;
  if (!seam.persistent) seam.allowed = Number.POSITIVE_INFINITY;
  return true;
}

function permissionError(operation: string): Error {
  return Object.assign(new Error(`EPERM: operation not permitted, ${operation}`), {
    code: "EPERM",
  });
}

const repos: TempRepo[] = [];
const fabs: GitFab[] = [];
const roots: string[] = [];

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  writeSeam = undefined;
  copySeam = undefined;
  renameSeam = undefined;

  vi.mocked(writeFile).mockImplementation((async (...args: unknown[]) => {
    if (seamFails(writeSeam, String(args[0]))) throw permissionError("write");
    return (actual.writeFile as (...values: unknown[]) => Promise<void>)(...args);
  }) as never);
  vi.mocked(copyFile).mockImplementation((async (...args: unknown[]) => {
    if (seamFails(copySeam, String(args[1]))) throw permissionError("copyfile");
    return (actual.copyFile as (...values: unknown[]) => Promise<void>)(...args);
  }) as never);
  vi.mocked(rename).mockImplementation((async (...args: unknown[]) => {
    if (seamFails(renameSeam, String(args[1]))) throw permissionError("rename");
    return (actual.rename as (...values: unknown[]) => Promise<void>)(...args);
  }) as never);
});

afterEach(async () => {
  writeSeam = undefined;
  copySeam = undefined;
  renameSeam = undefined;
  await Promise.all([
    ...repos.splice(0).map((repo) => repo.cleanup()),
    ...fabs.splice(0).map((fab) => fab.cleanup()),
    ...roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ]);
});

function skill(body: string): string {
  return `---\nname: guide\ndescription: Use the guide when the task needs it.\n---\n\n# Guide\n\n${body}\n`;
}

const CONFIG = "format: 1\nname: sample-fab\n";

async function importedFrom(initial: RepoFiles): Promise<{ repo: TempRepo; fab: GitFab }> {
  const fab = await createGitFab(initial);
  fabs.push(fab);
  await fab.tag("v1.0.0");
  await fab.push();
  const repo = await makeRepo({}, { git: true });
  repos.push(repo);
  const imported = await withFabEnvironment(fab, () => importFab(repo.root));
  expect(imported.code).toBe(0);
  return { repo, fab };
}

async function publish(fab: GitFab, changes: RepoFiles): Promise<void> {
  await fab.commit(changes, "v1.1.0");
  await fab.tag("v1.1.0");
  await fab.push();
}

function metafabYaml(repo: TempRepo): Promise<string> {
  return readFile(repo.path(".factory", "metafab.yaml"), "utf8");
}

function failedUpdate(fab: GitFab, repo: TempRepo): ReturnType<typeof updateFab> {
  return withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build", "--json"]));
}

describe("update restores .factory/ when a write fails", { timeout: 30_000 }, () => {
  test("a failed file write leaves .factory/ byte-identical, empty directory included", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/AGENTS.md": "# Agents v1\n",
      ".factory/skills/guide/SKILL.md": skill("v1"),
      ".factory/templates/note.md": "# Note\n",
    });
    // A planned file replaces this empty directory, and the restore must put an
    // empty directory back.
    await mkdir(repo.path(".factory", "Empty"), { recursive: true });
    await chmod(repo.path(".factory", "AGENTS.md"), 0o755);
    if (process.platform !== "win32") {
      await symlink("AGENTS.md", repo.path(".factory", "alias.md"));
    }

    await publish(fab, {
      ".factory/AGENTS.md": "# Agents v2\n",
      ".factory/Empty": "# Now a file\n",
    });

    const factoryDir = repo.path(".factory");
    const before = await walkRaw(factoryDir);
    writeSeam = { factoryDir, allowed: 1, persistent: false, count: 0 };

    const result = await failedUpdate(fab, repo);

    expect(result.code).toBe(1);
    const payload = parseJson(result);
    expect(payload.code).toBe("update-write-failed");
    expect(payload.summary).toContain("Update stopped:");
    expect(payload.summary).toContain(".factory/ was restored.");
    expect(await walkRaw(factoryDir)).toEqual(before);
    expect((await lstat(repo.path(".factory", "Empty"))).isDirectory()).toBe(true);
    expect(toLF(await readFile(repo.path(".factory", "AGENTS.md"), "utf8"))).toBe("# Agents v1\n");
    expect(await metafabYaml(repo)).toContain("version: 1.0.0");
  });

  test("a failing case-only directory rename is undone with the original spelling", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/Skills/guide/SKILL.md": skill("v1"),
      ".factory/Templates/note.md": "# Note v1\n",
    });
    await fab.remove([".factory/Skills", ".factory/Templates"], "rename the factory directories");
    await publish(fab, {
      ".factory/skills/guide/SKILL.md": skill("v2"),
      ".factory/templates/note.md": "# Note v2\n",
    });

    const factoryDir = repo.path(".factory");
    const before = await walkRaw(factoryDir);
    // The first rename (Skills -> skills) succeeds; the second (Guide -> guide)
    // fails, so the restore has to move the directory back.
    renameSeam = { factoryDir, allowed: 1, persistent: false, count: 0 };

    const result = await failedUpdate(fab, repo);

    expect(result.code).toBe(1);
    expect(parseJson(result).code).toBe("update-write-failed");
    expect(await walkRaw(factoryDir)).toEqual(before);
    const entries = await readdir(factoryDir);
    expect(entries).toContain("Skills");
    expect(entries).not.toContain("skills");
  });

  test("a failing case-only file rename is undone with the original spelling", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/Notes.md": "# Notes v1\n",
      ".factory/Other.md": "# Other v1\n",
      ".factory/skills/guide/SKILL.md": skill("v1"),
    });
    await fab.remove([".factory/Notes.md", ".factory/Other.md"], "rename the notes files");
    await publish(fab, {
      ".factory/notes.md": "# Notes v2\n",
      ".factory/other.md": "# Other v2\n",
    });

    const factoryDir = repo.path(".factory");
    const before = await walkRaw(factoryDir);
    // Notes.md -> notes.md succeeds; Other.md -> other.md fails.
    renameSeam = { factoryDir, allowed: 1, persistent: false, count: 0 };

    const result = await failedUpdate(fab, repo);

    expect(result.code).toBe(1);
    expect(parseJson(result).code).toBe("update-write-failed");
    expect(await walkRaw(factoryDir)).toEqual(before);
    const entries = await readdir(factoryDir);
    expect(entries).toContain("Notes.md");
    expect(entries).toContain("Other.md");
    expect(entries).not.toContain("notes.md");
  });

  test("a restore that fails says .factory/ may be partly updated and points at Git", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/AGENTS.md": "# Agents v1\n",
      ".factory/NOTES.md": "# Notes v1\n",
      ".factory/skills/guide/SKILL.md": skill("v1"),
    });
    await publish(fab, {
      ".factory/AGENTS.md": "# Agents v2\n",
      ".factory/NOTES.md": "# Notes v2\n",
    });

    const factoryDir = repo.path(".factory");
    // The first write lands, the second fails, and every later write fails too,
    // so the restore cannot rewrite the first file.
    writeSeam = { factoryDir, allowed: 1, persistent: true, count: 0 };

    const result = await failedUpdate(fab, repo);

    expect(result.code).toBe(1);
    const payload = parseJson(result);
    expect(payload.code).toBe("update-write-failed");
    expect(payload.summary).toContain(".factory/ may be partly updated.");
    const problems = payload.problems as Array<{ fix?: string }>;
    expect(problems[0]?.fix).toBe(
      "Restore .factory/ from Git (git status shows what changed), then run metafab update again",
    );
    // The first write is still there, which is why the message does not claim a
    // restore, and the recorded version is still the old one.
    expect(toLF(await readFile(repo.path(".factory", "AGENTS.md"), "utf8"))).toBe("# Agents v2\n");
    expect(await metafabYaml(repo)).toContain("version: 1.0.0");
  });

  test("a dry run captures nothing and writes nothing", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/AGENTS.md": "# Agents v1\n",
      ".factory/skills/guide/SKILL.md": skill("v1"),
    });
    await publish(fab, { ".factory/AGENTS.md": "# Agents v2\n" });

    const factoryDir = repo.path(".factory");
    const before = await walkRaw(factoryDir);
    writeSeam = { factoryDir, allowed: 0, persistent: true, count: 0 };

    const result = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--no-build", "--dry-run", "--json"]),
    );

    expect(result.code).toBe(0);
    expect(writeSeam.count).toBe(0);
    expect(await walkRaw(factoryDir)).toEqual(before);
  });
});

describe("unversioned update restores .factory/ when a write fails", { timeout: 30_000 }, () => {
  const SOURCE_V1: RepoFiles = {
    ".factory/factory.yaml": CONFIG,
    ".factory/AGENTS.md": "# Agents v1\n",
    ".factory/skills/guide/SKILL.md": skill("v1"),
  };

  async function sourceFab(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), "metafab-update-restore-"));
    roots.push(root);
    await writeRepoFiles(root, SOURCE_V1);
    return root;
  }

  test("a failed copy leaves .factory/ byte-identical, empty directory included", async () => {
    const source = await sourceFab();
    const repo = await makeRepo({}, { git: true });
    repos.push(repo);
    const imported = await importFab(repo.root, path.join(source, ".factory"));
    expect(imported.code).toBe(0);

    await mkdir(repo.path(".factory", "Empty"), { recursive: true });
    await chmod(repo.path(".factory", "AGENTS.md"), 0o755);

    await writeRepoFiles(source, {
      ".factory/AGENTS.md": "# Agents v2\n",
      ".factory/Empty": "# Now a file\n",
    });

    const factoryDir = repo.path(".factory");
    const before = await walkRaw(factoryDir);
    copySeam = { factoryDir, allowed: 1, persistent: false, count: 0 };

    const result = await updateFab(repo.root, ["--no-build", "--json"]);

    expect(result.code).toBe(1);
    const payload = parseJson(result);
    expect(payload.code).toBe("update-write-failed");
    expect(payload.summary).toContain(".factory/ was restored.");
    expect(await walkRaw(factoryDir)).toEqual(before);
    expect((await lstat(repo.path(".factory", "Empty"))).isDirectory()).toBe(true);
    expect(toLF(await readFile(repo.path(".factory", "AGENTS.md"), "utf8"))).toBe("# Agents v1\n");
  });
});
