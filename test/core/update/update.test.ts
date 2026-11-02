import { readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, test } from "vitest";
import { pathExists } from "../../../src/util/fs.js";
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
const AGENTS_LOCAL = "# Agents\n\nalpha\nbeta\ngamma-local\n";
const AGENTS_V2 = "# Agents\n\nALPHA-UPSTREAM\nbeta\ngamma\n";

const SKILL_V1 = skill("First line.\nMiddle line.\nLast line.");
const SKILL_LOCAL = skill("First line.\nMiddle line.\nLast line local.");
const SKILL_V2 = skill("First line upstream.\nMiddle line.\nLast line.");

function fabV1(): RepoFiles {
  return {
    ".factory/factory.yaml": "format: 1\nname: sample-fab\n",
    ".factory/AGENTS.md": AGENTS_V1,
    ".factory/skills/guide/SKILL.md": SKILL_V1,
    ".factory/templates/note.md": "# Note\n\nold\n",
    ".factory/templates/kept.md": "# Kept\n\nbase\n",
    ".factory/templates/dropped.md": "# Dropped\n\nbase\n",
  };
}

async function track(fab: GitFab): Promise<GitFab> {
  fabs.push(fab);
  return fab;
}

async function project(): Promise<TempRepo> {
  const repo = await makeRepo({}, { git: true });
  repos.push(repo);
  return repo;
}

async function importedProject(): Promise<{ repo: TempRepo; fab: GitFab }> {
  const fab = await track(await createGitFab(fabV1()));
  await fab.tag("v1.0.0");
  await fab.push();
  const repo = await project();
  const imported = await withFabEnvironment(fab, () => importFab(repo.root));
  expect(imported.code).toBe(0);
  return { repo, fab };
}

async function metafabYaml(repo: TempRepo): Promise<string> {
  return readFile(repo.path(".factory", "metafab.yaml"), "utf8");
}

describe("update version selection", () => {
  test("follows the recorded range to the newest matching tag", async () => {
    const { repo, fab } = await importedProject();
    const commit = await fab.commit(
      { ".factory/AGENTS.md": AGENTS_V2, ".factory/templates/new.md": "# New\n" },
      "v1.1.0",
    );
    await fab.tag("v1.1.0");
    await fab.push();

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build", "--json"]));
    expect(result.code).toBe(0);
    const payload = parseJson(result);
    expect(payload.status).toBe("updated");
    expect(payload.from).toBe("1.0.0");
    expect(payload.to).toBe("1.1.0");
    expect(payload.built).toBe(false);
    expect(toLF(await readFile(repo.path(".factory", "AGENTS.md"), "utf8"))).toBe(AGENTS_V2);
    expect(toLF(await metafabYaml(repo))).toContain(`commit: ${commit}`);
    expect(await metafabYaml(repo)).toContain("version: 1.1.0");
  });

  test("reports Already up to date when the range selects the recorded version", async () => {
    const { repo, fab } = await importedProject();

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--json"]));
    expect(result.code).toBe(0);
    expect(parseJson(result).status).toBe("up-to-date");

    const human = await withFabEnvironment(fab, () => updateFab(repo.root));
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("Already up to date.");
  });

  test("reports a pinned tag without --to and updates with --to", async () => {
    const fab = await track(await createGitFab(fabV1()));
    await fab.tag("v1.0.0");
    await fab.push();
    const repo = await project();
    const imported = await withFabEnvironment(fab, () =>
      importFab(repo.root, "git+https://example.com/fab.git#v1.0.0"),
    );
    expect(imported.code).toBe(0);

    const pinned = await withFabEnvironment(fab, () => updateFab(repo.root));
    expect(pinned.code).toBe(0);
    expect(pinned.stdout).toContain("Pinned to v1.0.0. Use --to.");

    const commit = await fab.commit({ ".factory/AGENTS.md": AGENTS_V2 }, "v1.1.0");
    await fab.tag("v1.1.0");
    await fab.push();

    const updated = await withFabEnvironment(fab, () => updateFab(repo.root, ["--to", "v1.1.0", "--no-build", "--json"]));
    expect(updated.code).toBe(0);
    expect(parseJson(updated).to).toBe("1.1.0");
    expect(await metafabYaml(repo)).toContain(`commit: ${commit}`);
  });

  test("reports a pinned commit without --to", async () => {
    const fab = await track(await createGitFab(fabV1()));
    await fab.tag("v1.0.0");
    await fab.push();
    const commit = await fab.head();
    const repo = await project();

    const imported = await withFabEnvironment(fab, () =>
      importFab(repo.root, `git+https://example.com/fab.git#${commit}`),
    );
    expect(imported.code).toBe(0);

    const pinned = await withFabEnvironment(fab, () => updateFab(repo.root));
    expect(pinned.code).toBe(0);
    expect(pinned.stdout).toContain(`Pinned to ${commit}. Use --to.`);
  });

  test("follows a recorded branch to its new head", async () => {
    const fab = await track(await createGitFab(fabV1()));
    await fab.tag("v1.0.0");
    await fab.createBranch("next");
    await fab.push("next");
    const repo = await project();

    const imported = await withFabEnvironment(fab, () =>
      importFab(repo.root, "git+https://example.com/fab.git#next"),
    );
    expect(imported.code).toBe(0);

    const commit = await fab.commit({ ".factory/AGENTS.md": "# Agents on next\n" }, "next work");
    await fab.push("next");

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build", "--json"]));
    expect(result.code).toBe(0);
    expect(parseJson(result).status).toBe("updated");
    expect(toLF(await readFile(repo.path(".factory", "AGENTS.md"), "utf8"))).toBe("# Agents on next\n");
    expect(await metafabYaml(repo)).toContain(`commit: ${commit}`);
  });

  test("follows the default branch head when the import recorded no request", async () => {
    const fab = await track(await createGitFab(fabV1()));
    await fab.push();
    const repo = await project();

    const imported = await withFabEnvironment(fab, () => importFab(repo.root));
    expect(imported.code).toBe(0);
    expect(await metafabYaml(repo)).not.toContain("requested:");

    const commit = await fab.commit({ ".factory/AGENTS.md": AGENTS_V2 }, "main work");
    await fab.push();

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build", "--json"]));
    expect(result.code).toBe(0);
    expect(parseJson(result).status).toBe("updated");
    expect(toLF(await readFile(repo.path(".factory", "AGENTS.md"), "utf8"))).toBe(AGENTS_V2);
    expect(await metafabYaml(repo)).toContain(`commit: ${commit}`);
  });

  test("--to accepts a commit when the recorded request is a range", async () => {
    const { repo, fab } = await importedProject();
    const commit = await fab.commit({ ".factory/AGENTS.md": AGENTS_V2 }, "v1.1.0");
    await fab.tag("v1.1.0");
    await fab.push();

    const result = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--to", commit, "--no-build", "--json"]),
    );
    expect(result.code).toBe(0);
    expect(parseJson(result).status).toBe("updated");
    expect(await metafabYaml(repo)).toContain(`commit: ${commit}`);
  });
});

describe("versioned update", () => {
  test("merges local edits, writes markers for overlaps, and records the new version", async () => {
    const { repo, fab } = await importedProject();

    await writeRepoFiles(repo.root, {
      ".factory/AGENTS.md": AGENTS_LOCAL,
      ".factory/factory.yaml": "format: 1\nname: local-fab\n",
      ".factory/skills/guide/SKILL.md": SKILL_LOCAL,
      ".factory/templates/kept.md": "# Kept\n\nlocal edit\n",
      ".factory/templates/local.md": "# Local\n",
    });
    await rm(repo.path(".factory", "templates", "dropped.md"));

    const installedBefore = toLF(
      await readFile(repo.path(".claude", "skills", "guide", "SKILL.md"), "utf8"),
    );

    await fab.commit(
      {
        ".factory/AGENTS.md": AGENTS_V2,
        ".factory/factory.yaml": "format: 1\nname: sample-fab-upstream\n",
        ".factory/skills/guide/SKILL.md": SKILL_V2,
        ".factory/templates/dropped.md": "# Dropped\n\nupstream change\n",
        ".factory/templates/new.md": "# New upstream\n",
      },
      "v1.1.0",
    );
    const commit = await fab.remove(
      [".factory/templates/note.md", ".factory/templates/kept.md"],
      "remove templates",
    );
    await fab.tag("v1.1.0");
    await fab.push();

    const result = await withFabEnvironment(fab, () => updateFab(repo.root));
    expect(result.code).toBe(1);

    const agents = toLF(await readFile(repo.path(".factory", "AGENTS.md"), "utf8"));
    expect(agents).toContain("ALPHA-UPSTREAM");
    expect(agents).toContain("gamma-local");

    const factory = toLF(await readFile(repo.path(".factory", "factory.yaml"), "utf8"));
    expect(factory).toContain("<<<<<<< yours");
    expect(factory).toContain("||||||| base 1.0.0");
    expect(factory).toContain(">>>>>>> upstream 1.1.0");
    expect(factory).toContain("local-fab");
    expect(factory).toContain("sample-fab-upstream");

    const guide = toLF(await readFile(repo.path(".factory", "skills", "guide", "SKILL.md"), "utf8"));
    expect(guide).toContain("First line upstream.");
    expect(guide).toContain("Last line local.");

    expect(await pathExists(repo.path(".factory", "templates", "note.md"))).toBe(false);
    expect(await pathExists(repo.path(".factory", "templates", "new.md"))).toBe(true);
    expect(await pathExists(repo.path(".factory", "templates", "local.md"))).toBe(true);
    expect(toLF(await readFile(repo.path(".factory", "templates", "kept.md"), "utf8"))).toBe(
      "# Kept\n\nlocal edit\n",
    );
    expect(await pathExists(repo.path(".factory", "templates", "dropped.md"))).toBe(false);

    expect(result.stdout).toContain("Conflicts: 1");
    expect(result.stdout).toContain("Local edits preserved");
    expect(result.stdout).toContain("templates/kept.md");
    expect(result.stdout).toContain("Upstream removed templates/kept.md; your local version was kept.");
    expect(result.stdout).toContain("Upstream changed templates/dropped.md, which you removed");

    const recorded = await metafabYaml(repo);
    expect(recorded).toContain("version: 1.1.0");
    expect(recorded).toContain(`commit: ${commit}`);

    // A conflicted update does not build, so the installed skill is still v1.
    expect(toLF(await readFile(repo.path(".claude", "skills", "guide", "SKILL.md"), "utf8"))).toBe(
      installedBefore,
    );
  });

  test("refuses while a conflict remains and succeeds after it is resolved", async () => {
    const { repo, fab } = await importedProject();
    await writeRepoFiles(repo.root, {
      ".factory/factory.yaml": "format: 1\nname: local-fab\n",
    });
    await fab.commit({ ".factory/factory.yaml": "format: 1\nname: sample-fab-upstream\n" }, "v1.1.0");
    await fab.tag("v1.1.0");
    await fab.push();

    const conflicted = await withFabEnvironment(fab, () => updateFab(repo.root));
    expect(conflicted.code).toBe(1);

    const refused = await withFabEnvironment(fab, () => updateFab(repo.root));
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("Unresolved conflict marker");

    await writeFile(repo.path(".factory", "factory.yaml"), "format: 1\nname: resolved-fab\n");
    const resolved = await withFabEnvironment(fab, () => updateFab(repo.root));
    expect(resolved.code).toBe(0);
    expect(resolved.stdout).toContain("Already up to date.");
  });

  test("--dry-run writes nothing and reports the same plan", async () => {
    const { repo, fab } = await importedProject();
    await fab.commit(
      { ".factory/AGENTS.md": AGENTS_V2, ".factory/templates/new.md": "# New upstream\n" },
      "v1.1.0",
    );
    await fab.tag("v1.1.0");
    await fab.push();

    const before = toLF(await readFile(repo.path(".factory", "AGENTS.md"), "utf8"));
    const dryRun = await withFabEnvironment(fab, () => updateFab(repo.root, ["--dry-run"]));
    expect(dryRun.code).toBe(0);
    expect(dryRun.stdout).toContain("Dry run: nothing was written.");
    expect(dryRun.stdout).toContain("templates/new.md");
    expect(toLF(await readFile(repo.path(".factory", "AGENTS.md"), "utf8"))).toBe(before);
    expect(await pathExists(repo.path(".factory", "templates", "new.md"))).toBe(false);
    const recorded = await metafabYaml(repo);
    expect(recorded).toContain("version: 1.0.0");
    expect(recorded).not.toContain("version: 1.1.0");

    const real = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build"]));
    expect(real.code).toBe(0);
    expect(real.stdout).toContain("templates/new.md");
    expect(toLF(await readFile(repo.path(".factory", "AGENTS.md"), "utf8"))).toBe(AGENTS_V2);
    expect(await pathExists(repo.path(".factory", "templates", "new.md"))).toBe(true);
  });

  test("builds after a clean update unless --no-build is set", async () => {
    const { repo, fab } = await importedProject();
    await fab.commit({ ".factory/skills/guide/SKILL.md": skill("Built upstream.") }, "v1.1.0");
    await fab.tag("v1.1.0");
    await fab.push();

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--json"]));
    expect(result.code).toBe(0);
    expect(parseJson(result).built).toBe(true);
    expect(toLF(await readFile(repo.path(".claude", "skills", "guide", "SKILL.md"), "utf8"))).toContain(
      "Built upstream.",
    );
  });
});
