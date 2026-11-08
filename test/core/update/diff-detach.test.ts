import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { cacheLayout } from "../../../src/core/sources/cache.js";
import { toLF } from "../../../src/util/text.js";
import { makeRepo, writeRepoFiles } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";
import type { RunCliResult } from "../../helpers/runCli.js";
import {
  FAB_URL,
  createGitFab,
  importFab,
  parseJson,
  withFabEnvironment,
} from "./git-fab.js";
import type { GitFab } from "./git-fab.js";

const repos: TempRepo[] = [];
const fabs: GitFab[] = [];

afterEach(async () => {
  await Promise.all([
    ...repos.splice(0).map((repo) => repo.cleanup()),
    ...fabs.splice(0).map((fab) => fab.cleanup()),
  ]);
});

function skill(body: string): string {
  return `---\nname: guide\ndescription: Use this guide when the task needs it.\n---\n\n# Guide\n\n${body}\n`;
}

const AGENTS_V1 = "# Agents\n\nalpha\nbeta\ngamma\n";
const SKILL_V1 = skill("First line.\nMiddle line.\nLast line.");

function fabV1(): RepoFiles {
  return {
    ".factory/factory.yaml": "format: 1\nname: sample-fab\n",
    ".factory/AGENTS.md": AGENTS_V1,
    ".factory/skills/guide/SKILL.md": SKILL_V1,
    ".factory/templates/note.md": "# Note\n\nold\n",
  };
}

async function project(): Promise<TempRepo> {
  const repo = await makeRepo({}, { git: true });
  repos.push(repo);
  return repo;
}

async function importedProject(): Promise<{ repo: TempRepo; fab: GitFab }> {
  const fab = await createGitFab(fabV1());
  fabs.push(fab);
  await fab.tag("v1.0.0");
  await fab.push();
  const repo = await project();
  const imported = await withFabEnvironment(fab, () => importFab(repo.root));
  expect(imported.code).toBe(0);
  return { repo, fab };
}

function diffFab(cwd: string, args: readonly string[] = []): Promise<RunCliResult> {
  return runCli(["diff", ...args], { cwd });
}

describe("metafab diff", { timeout: 30_000 }, () => {
  test("prints nothing when the factory matches its recorded upstream", async () => {
    const { repo, fab } = await importedProject();

    const human = await withFabEnvironment(fab, () => diffFab(repo.root));
    expect(human.code).toBe(0);
    expect(human.stdout.trim()).toBe("");

    const json = await withFabEnvironment(fab, () => diffFab(repo.root, ["--json"]));
    expect(json.code).toBe(0);
    expect(parseJson(json).files).toEqual([]);
  });

  test("prints the unified patch after a local edit", async () => {
    const { repo, fab } = await importedProject();
    await writeRepoFiles(repo.root, {
      ".factory/skills/guide/SKILL.md": skill("First line.\nMiddle line.\nLast line local."),
    });

    const result = await withFabEnvironment(fab, () => diffFab(repo.root));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("--- a/upstream/skills/guide/SKILL.md");
    expect(result.stdout).toContain("+++ b/local/skills/guide/SKILL.md");
    expect(result.stdout).toContain("-Last line.");
    expect(result.stdout).toContain("+Last line local.");
  });

  test("limits the comparison to the path prefix", async () => {
    const { repo, fab } = await importedProject();
    await writeRepoFiles(repo.root, {
      ".factory/AGENTS.md": "# Agents\n\nalpha\nbeta\ngamma-local\n",
      ".factory/skills/guide/SKILL.md": skill("First line.\nMiddle line.\nLast line local."),
    });

    const result = await withFabEnvironment(fab, () => diffFab(repo.root, [".factory/skills"]));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("skills/guide/SKILL.md");
    expect(result.stdout).not.toContain("AGENTS.md");
  });

  test("reports the JSON shape for each changed file", async () => {
    const { repo, fab } = await importedProject();
    await writeRepoFiles(repo.root, {
      ".factory/skills/guide/SKILL.md": skill("First line.\nMiddle line.\nLast line local."),
    });

    const result = await withFabEnvironment(fab, () => diffFab(repo.root, ["--json"]));
    expect(result.code).toBe(0);
    expect(parseJson(result).problems).toEqual([]);
    const files = parseJson(result).files as Array<Record<string, unknown>>;
    expect(files).toHaveLength(1);
    expect(Object.keys(files[0]!).sort()).toEqual(["patch", "path", "status"]);
    expect(files[0]!.path).toBe("skills/guide/SKILL.md");
    expect(files[0]!.status).toBe("modified");
    expect(files[0]!.patch).toContain("+Last line local.");
  });

  test("prints one line for a binary file", async () => {
    const { repo, fab } = await importedProject();
    const binary = new Uint8Array([0, 1, 2, 3, 255]);
    await writeRepoFiles(repo.root, { ".factory/assets/logo.bin": binary });

    const human = await withFabEnvironment(fab, () => diffFab(repo.root));
    expect(human.code).toBe(0);
    expect(human.stdout).toContain(
      "Binary files a/upstream/assets/logo.bin and b/local/assets/logo.bin differ",
    );

    const json = await withFabEnvironment(fab, () => diffFab(repo.root, ["--json"]));
    const files = parseJson(json).files as Array<Record<string, unknown>>;
    expect(files).toEqual([{ path: "assets/logo.bin", status: "added" }]);
  });

  test("reports a fetch failure for another reason instead of comparing", async () => {
    const { repo, fab } = await importedProject();
    // Drop the cached fab so the recorded base has to be exported again.
    await rm(path.join(fab.root, "cache", "fabs"), { recursive: true, force: true });
    // A cache entry that cannot hold the verbatim attribute rules fails that
    // export for a reason that is not a missing base.
    const mirror = cacheLayout(path.join(fab.root, "cache")).gitMirror(FAB_URL);
    await rm(path.join(mirror, "info"), { recursive: true, force: true });
    await writeFile(path.join(mirror, "info"), "not a directory\n");

    const result = await withFabEnvironment(fab, () => diffFab(repo.root));

    expect(result.code).toBe(3);
    expect(result.stdout).toContain("Cannot export .factory");
  });

  test("fails with a fix when the factory has no upstream", async () => {
    const repo = await project();
    await writeRepoFiles(repo.root, { ".factory/metafab.yaml": "agents: all\n" });

    const result = await diffFab(repo.root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("This factory has no upstream to compare");
    expect(result.stderr).toContain("fix: Run metafab import <source>");
  });
});

describe("metafab detach", { timeout: 30_000 }, () => {
  test("removes only the upstream entry and keeps comments and other keys", async () => {
    const { repo, fab } = await importedProject();
    const configFile = repo.path(".factory", "metafab.yaml");
    const before = await readFile(configFile, "utf8");
    const rewritten = `# Keep this comment.\n${before.replace(
      "upstream:",
      "metafab-skill: false\nupstream:",
    )}`;
    await writeFile(configFile, rewritten);
    const factoryFile = repo.path(".factory", "skills", "guide", "SKILL.md");
    const factoryBefore = await readFile(factoryFile, "utf8");

    // Detach does not fetch anything, but the fixture keeps Git off the network.
    const result = await withFabEnvironment(fab, () => runCli(["detach"], { cwd: repo.root }));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Removed the upstream from .factory/metafab.yaml.");

    const after = await readFile(configFile, "utf8");
    expect(after).toContain("# Keep this comment.");
    expect(after).toContain("metafab-skill: false");
    expect(after).not.toContain("upstream");
    expect(toLF(await readFile(factoryFile, "utf8"))).toBe(toLF(factoryBefore));
  });

  test("reports the detached upstream in JSON", async () => {
    const { repo, fab } = await importedProject();

    const result = await withFabEnvironment(fab, () =>
      runCli(["detach", "--json"], { cwd: repo.root }),
    );
    expect(result.code).toBe(0);
    expect(parseJson(result)).toMatchObject({
      ok: true,
      command: "detach",
      detached: true,
      upstream: { source: "git+https://example.com/fab.git" },
    });
    expect(parseJson(result).problems).toEqual([]);
  });

  test("says there is no upstream to detach", async () => {
    const repo = await project();
    const configFile = repo.path(".factory", "metafab.yaml");
    await writeRepoFiles(repo.root, { ".factory/metafab.yaml": "agents: all\n" });

    const result = await runCli(["detach"], { cwd: repo.root });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("No upstream to detach.");
    expect(await readFile(configFile, "utf8")).toBe("agents: all\n");

    const json = await runCli(["detach", "--json"], { cwd: repo.root });
    expect(parseJson(json)).toMatchObject({ detached: false });
  });
});
