import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import { copyFactoryTree } from "../../src/core/import/copy.js";
import { snapshotTree } from "../../src/core/import/file-tree.js";
import { listFiles } from "../../src/util/fs.js";
import { makeRepo, writeRepoFiles } from "../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../helpers/makeRepo.js";
import { runCli } from "../helpers/runCli.js";
import {
  createGitFab,
  importFab,
  parseJson,
  updateFab,
  withFabEnvironment,
} from "../core/update/git-fab.js";
import type { GitFab } from "../core/update/git-fab.js";

/**
 * The state the `node:fs/promises` mock consults. `untypedDirectories` makes
 * `readdir` report entries whose three type predicates are all false, as a
 * DT_UNKNOWN filesystem does; `denied` makes `lstat` fail with EACCES.
 */
const state = vi.hoisted(() => ({
  untypedDirectories: new Set<string>(),
  denied: new Set<string>(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readdir: vi.fn(async (directory: string, options?: unknown) => {
      const entries = (await (actual.readdir as unknown as (
        target: string,
        settings?: unknown,
      ) => Promise<{ name: string }[]>)(directory, options)) as { name: string }[];
      const withTypes =
        typeof options === "object" &&
        options !== null &&
        (options as { withFileTypes?: boolean }).withFileTypes === true;
      if (!withTypes || !state.untypedDirectories.has(String(directory))) return entries;
      return entries.map((entry) => untypedEntry(entry.name));
    }),
    lstat: vi.fn(async (target: string) => {
      if (state.denied.has(String(target))) {
        throw Object.assign(new Error("EACCES: permission denied, lstat"), { code: "EACCES" });
      }
      return actual.lstat(target);
    }),
  };
});

/** A directory entry of no type, as DT_UNKNOWN reports it. */
function untypedEntry(name: string): {
  name: string;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
} {
  return {
    name,
    isFile: () => false,
    isDirectory: () => false,
    isSymbolicLink: () => false,
  };
}

const DEMO_SKILL =
  "---\nname: demo\ndescription: Demo. Use when testing.\n---\n\n# Demo\n";
const X_SKILL = "---\nname: x\ndescription: X. Use when testing x.\n---\n\n# X\n";
const GUIDE_SKILL =
  "---\nname: guide\ndescription: Use this guide when the task needs it.\n---\n\n# Guide\n";

const repos: TempRepo[] = [];
const fabs: GitFab[] = [];

afterEach(async () => {
  state.untypedDirectories.clear();
  state.denied.clear();
  await Promise.all([
    ...repos.splice(0).map((repo) => repo.cleanup()),
    ...fabs.splice(0).map((fab) => fab.cleanup()),
  ]);
});

function track(repo: TempRepo): TempRepo {
  repos.push(repo);
  return repo;
}

async function checkRepo(): Promise<TempRepo> {
  return track(
    await makeRepo(
      {
        ".factory/factory.yaml": "format: 1\nname: demo\n",
        ".factory/metafab.yaml": "agents: [codex]\nmetafab-skill: false\n",
        ".factory/skills/demo/SKILL.md": DEMO_SKILL,
        ".factory/skills/x/SKILL.md": X_SKILL,
        ".factory/skills/x/stray.txt": "stray\n",
      },
      { git: true },
    ),
  );
}

async function gitProject(): Promise<TempRepo> {
  return track(await makeRepo({}, { git: true }));
}

/** A versioned project imported from a fixture fab at v1.0.0. */
async function importedFrom(initial: RepoFiles): Promise<{ repo: TempRepo; fab: GitFab }> {
  const fab = await createGitFab(initial);
  fabs.push(fab);
  await fab.tag("v1.0.0");
  await fab.push();
  const repo = await gitProject();
  const imported = await withFabEnvironment(fab, () => importFab(repo.root));
  expect(imported.code, `${imported.stdout}${imported.stderr}`).toBe(0);
  return { repo, fab };
}

/** Every file under `root` as its relative path and bytes. */
async function snapshotBytes(root: string): Promise<Record<string, string>> {
  const entries: Record<string, string> = {};
  for (const file of await listFiles(root)) {
    entries[file] = await readFile(path.join(root, ...file.split("/")), "utf8");
  }
  return entries;
}

const FILES_V1: RepoFiles = {
  ".factory/factory.yaml": "format: 1\nname: sample-fab\n",
  ".factory/AGENTS.md": "# Agents\n\none\n",
  ".factory/skills/guide/SKILL.md": GUIDE_SKILL,
  ".factory/templates/kept.md": "# Kept\n\nbase\n",
  ".factory/templates/note.md": "# Note\n\nold\n",
};

describe("readdir walkers with an untyped directory", () => {
  test("check reports one problem for an entry it cannot classify", async () => {
    const repo = await checkRepo();
    const built = await runCli(["build"], { cwd: repo.root, tty: false });
    expect(built.code, `${built.stdout}${built.stderr}`).toBe(0);

    state.untypedDirectories.add(repo.path(".factory", "skills", "x"));
    state.denied.add(repo.path(".factory", "skills", "x", "stray.txt"));

    const result = await runCli(["check"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(1);
    const readProblems = result.stderr
      .split("\n")
      .filter((line) => line.includes("Cannot read") && line.includes(".factory/skills/x"));
    expect(readProblems).toHaveLength(1);
    expect(readProblems[0]).toContain("error:");
  });

  test("update fails before writing when an entry cannot be classified", async () => {
    const { repo, fab } = await importedFrom(FILES_V1);
    const factory = repo.path(".factory");
    const before = await snapshotBytes(factory);

    await fab.commit({ ".factory/AGENTS.md": "# Agents\n\nupstream\n" }, "v1.1.0");
    await fab.tag("v1.1.0");
    await fab.push();

    state.untypedDirectories.add(repo.path(".factory", "templates"));
    state.denied.add(repo.path(".factory", "templates", "note.md"));

    const result = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--no-build", "--json"]),
    );
    expect(result.code).toBe(1);

    state.denied.clear();
    expect(await snapshotBytes(factory)).toEqual(before);
  });

  test("snapshotTree and copyFactoryTree see every file in an untyped directory", async () => {
    const source = await makeRepo({
      ".factory/AGENTS.md": "# Agents\n",
      ".factory/skills/x/SKILL.md": X_SKILL,
      ".factory/skills/x/run.sh": "#!/bin/sh\necho x\n",
    });
    track(source);
    state.untypedDirectories.add(source.path(".factory", "skills", "x"));

    const tree = await snapshotTree(source.path(".factory"));
    expect(Object.keys(tree).sort()).toEqual(["AGENTS.md", "skills/x/SKILL.md", "skills/x/run.sh"]);

    const destination = track(await makeRepo());
    await copyFactoryTree(source.path(".factory"), destination.path(".factory"));
    expect(await listFiles(destination.path(".factory"))).toEqual([
      "AGENTS.md",
      "skills/x/SKILL.md",
      "skills/x/run.sh",
    ]);
  });

  test("update keeps a locally edited file that upstream removed, not as an addition", async () => {
    const { repo, fab } = await importedFrom(FILES_V1);
    await writeRepoFiles(repo.root, { ".factory/templates/kept.md": "# Kept\n\nlocal edit\n" });

    await fab.remove([".factory/templates/kept.md"], "remove kept");
    await fab.tag("v1.1.0");
    await fab.push();

    state.untypedDirectories.add(repo.path(".factory", "templates"));

    const result = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--no-build", "--json"]),
    );
    expect(result.code, `${result.stdout}${result.stderr}`).toBe(0);
    const payload = parseJson(result);
    expect(payload.preserved).toContain("templates/kept.md");
    expect(payload.added).not.toContain("templates/kept.md");
    expect(await readFile(repo.path(".factory", "templates", "kept.md"), "utf8")).toBe(
      "# Kept\n\nlocal edit\n",
    );
  });

  test("only src/util/fs.ts reads directories with entry types", async () => {
    const sourceRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)), "src");
    const offenders: string[] = [];
    for (const file of await listFiles(sourceRoot)) {
      if (file === "util/fs.ts") continue;
      const text = await readFile(path.join(sourceRoot, ...file.split("/")), "utf8");
      if (text.includes("withFileTypes")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
