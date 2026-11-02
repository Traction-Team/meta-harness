import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { pathExists } from "../../../src/util/fs.js";
import { toLF } from "../../../src/util/text.js";
import { makeRepo, writeRepoFiles } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";
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

/** Imports a fab with `initial` as its first version, tagged v1.0.0. */
async function importedFrom(initial: RepoFiles): Promise<{ repo: TempRepo; fab: GitFab }> {
  const fab = await track(await createGitFab(initial));
  await fab.tag("v1.0.0");
  await fab.push();
  const repo = await project();
  const imported = await withFabEnvironment(fab, () => importFab(repo.root));
  expect(imported.code).toBe(0);
  return { repo, fab };
}

async function publish(fab: GitFab, changes: RepoFiles): Promise<void> {
  await fab.commit(changes, "v1.1.0");
  await fab.tag("v1.1.0");
  await fab.push();
}

async function metafabYaml(repo: TempRepo): Promise<string> {
  return readFile(repo.path(".factory", "metafab.yaml"), "utf8");
}

describe("update version selection", { timeout: 30_000 }, () => {
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

  test("--to that selects the recorded version records the new request", async () => {
    const fab = await track(await createGitFab(fabV1()));
    await fab.tag("v1.0.0");
    await fab.push();
    const repo = await project();
    const imported = await withFabEnvironment(fab, () =>
      importFab(repo.root, "git+https://example.com/fab.git#v1.0.0"),
    );
    expect(imported.code).toBe(0);
    expect(await metafabYaml(repo)).toContain("requested: v1.0.0");

    const recorded = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--to", "^1.0.0"]),
    );
    expect(recorded.code).toBe(0);
    expect(recorded.stdout).toContain("Already up to date. Recorded requested range ^1.0.0.");
    expect(await metafabYaml(repo)).toContain("requested: ^1.0.0");

    // The same request again is not recorded anew, so the summary does not
    // claim a change that did not happen.
    const unchanged = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--to", "^1.0.0"]),
    );
    expect(unchanged.code).toBe(0);
    expect(unchanged.stdout.trim()).toBe("Already up to date.");

    const result = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--to", "~1.0.0", "--no-build", "--json"]),
    );
    expect(result.code).toBe(0);
    expect(parseJson(result).status).toBe("up-to-date");
    expect(parseJson(result).requested).toBe("~1.0.0");
    expect(await metafabYaml(repo)).toContain("requested: ~1.0.0");

    const dryRun = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--to", "1.0.0", "--dry-run"]),
    );
    expect(dryRun.code).toBe(0);
    expect(dryRun.stdout).toContain("Dry run: would record requested range 1.0.0.");
    expect(await metafabYaml(repo)).toContain("requested: ~1.0.0");
  });
});

describe("versioned update", { timeout: 30_000 }, () => {
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

  test("a new local file that differs from the new upstream file is not called binary", async () => {
    const { repo, fab } = await importedProject();
    await writeRepoFiles(repo.root, { ".factory/templates/local.md": "# Mine\n" });
    await fab.commit({ ".factory/templates/local.md": "# Theirs\n" }, "v1.1.0");
    await fab.tag("v1.1.0");
    await fab.push();

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build"]));
    expect(result.code).toBe(1);
    expect(result.stdout).toContain(
      "Conflict in templates/local.md: the local entry differs from the new upstream file",
    );
    expect(result.stdout).not.toContain("Binary conflict");
    expect(toLF(await readFile(repo.path(".factory", "templates", "local.md"), "utf8"))).toBe(
      "# Mine\n",
    );
    expect(
      toLF(await readFile(repo.path(".factory", "templates", "local.md.upstream"), "utf8")),
    ).toBe("# Theirs\n");
  });

  test("refuses while a .upstream file remains", async () => {
    const { repo, fab } = await importedProject();
    await writeRepoFiles(repo.root, {
      ".factory/templates/note.md.upstream": "# Upstream note\n",
    });
    await fab.commit({ ".factory/AGENTS.md": AGENTS_V2 }, "v1.1.0");
    await fab.tag("v1.1.0");
    await fab.push();

    const refused = await withFabEnvironment(fab, () => updateFab(repo.root));
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("Unresolved .upstream conflict file");
    expect(toLF(await readFile(repo.path(".factory", "AGENTS.md"), "utf8"))).toBe(AGENTS_V1);
    expect(await metafabYaml(repo)).toContain("version: 1.0.0");
  });

  test("reports a change upstream made exactly as the local edit as an upstream change", async () => {
    const { repo, fab } = await importedProject();
    await writeRepoFiles(repo.root, {
      ".factory/templates/kept.md": "# Kept\n\nshared change\n",
    });
    await fab.commit({ ".factory/templates/kept.md": "# Kept\n\nshared change\n" }, "v1.1.0");
    await fab.tag("v1.1.0");
    await fab.push();

    const note =
      "Upstream made the same change as your local edit to templates/kept.md; the file now matches upstream.";
    const dryRun = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--no-build", "--dry-run", "--json"]),
    );
    expect(dryRun.code).toBe(0);
    const payload = parseJson(dryRun);
    // The local edit is not a divergence to maintain: upstream adopted it, so it
    // is reported as an upstream change rather than a preserved local edit.
    expect(payload.preserved).toEqual([]);
    expect(payload.updated).toEqual([]);
    expect(payload.notes).toContain(note);

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build"]));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(note);
    expect(result.stdout).not.toContain("Local edits preserved");
  });

  test("refuses a file that would replace a local directory", async () => {
    const { repo, fab } = await importedProject();
    await writeRepoFiles(repo.root, {
      ".factory/templates/notes/local.md": "# Local note\n",
    });
    await fab.commit({ ".factory/templates/notes": "# Upstream notes file\n" }, "v1.1.0");
    await fab.tag("v1.1.0");
    await fab.push();

    for (const args of [["--no-build"], ["--dry-run"]]) {
      const result = await withFabEnvironment(fab, () => updateFab(repo.root, args));
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "The update would replace .factory/templates/notes with a different kind of entry",
      );
      expect(result.stderr).toContain("fix: Move the local entry away, then run metafab update again");
      expect(
        toLF(await readFile(repo.path(".factory", "templates", "notes", "local.md"), "utf8")),
      ).toBe("# Local note\n");
      expect(await pathExists(repo.path(".factory", "templates", "notes", "local.md"))).toBe(true);
      expect(await metafabYaml(repo)).toContain("version: 1.0.0");
    }
  });

  test("refuses a path that differs only in case from a local file", async () => {
    const { repo, fab } = await importedProject();
    await writeRepoFiles(repo.root, { ".factory/templates/notes.md": "# Local note\n" });
    await fab.commit({ ".factory/templates/Notes.md": "# Upstream note\n" }, "v1.1.0");
    await fab.tag("v1.1.0");
    await fab.push();

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build"]));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "The update writes templates/Notes.md, which differs only in case from .factory/templates/notes.md",
    );
    expect(toLF(await readFile(repo.path(".factory", "templates", "notes.md"), "utf8"))).toBe(
      "# Local note\n",
    );
  });

  test("updates a file that is not valid UTF-8 without re-encoding it", async () => {
    const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x0a]);
    const latin1Next = new Uint8Array([0x63, 0x61, 0x66, 0xe8, 0x0a]);
    const fab = await track(
      await createGitFab({
        ...fabV1(),
        ".factory/templates/latin.txt": latin1,
      }),
    );
    await fab.tag("v1.0.0");
    await fab.push();
    const repo = await project();
    const imported = await withFabEnvironment(fab, () => importFab(repo.root));
    expect(imported.code).toBe(0);
    expect(await readFile(repo.path(".factory", "templates", "latin.txt"))).toEqual(
      Buffer.from(latin1),
    );

    // Both invalid sequences decode to the same replacement character, so a
    // merge on decoded text would keep the old file and lose this change.
    await fab.commit({ ".factory/templates/latin.txt": latin1Next }, "v1.1.0");
    await fab.tag("v1.1.0");
    await fab.push();

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build", "--json"]));
    expect(result.code).toBe(0);
    expect(parseJson(result).status).toBe("updated");
    expect(await readFile(repo.path(".factory", "templates", "latin.txt"))).toEqual(
      Buffer.from(latin1Next),
    );
  });
});

describe("upstream restructures", { timeout: 30_000 }, () => {
  const CONFIG = "format: 1\nname: sample-fab\n";

  /**
   * The report a case-only rename of the skills directory produces when a local
   * file lives in it: the renamed skill is an edit at its new spelling and the
   * local-only file is only preserved.
   */
  const expectedReport = {
    preserved: ["skills/local.md"],
    added: [],
    updated: ["skills/guide/SKILL.md"],
    removed: [],
  };
  const expectedGroups = [
    ["skills", "skills/guide/SKILL.md"],
    ["preserved", "skills/local.md"],
  ];

  function changedFiles(value: Record<string, unknown>): Record<string, unknown> {
    return {
      preserved: value.preserved,
      added: value.added,
      updated: value.updated,
      removed: value.removed,
    };
  }

  /** Each review group as its key followed by its paths. */
  function reviewPaths(value: Record<string, unknown>): string[][] {
    const groups = (
      value.review as {
        groups: Array<{ key: string; entries: Array<{ path: string }> }>;
      }
    ).groups;
    return groups.map((group) => [group.key, ...group.entries.map((entry) => entry.path)]);
  }

  /**
   * Every summary line that mentions a skills path, with alignment padding
   * folded away. A stray delete at the old spelling would show up here.
   */
  function pathLines(stdout: string): string[] {
    return stdout
      .split("\n")
      .map((line) => line.trim().replace(/\s+/g, " "))
      .filter((line) => /skills\//i.test(line));
  }

  const expectedLines = ["M skills/guide/SKILL.md +1 -1", "skills/local.md"];

  test("turns an upstream file into a directory", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/templates/notes": "# Notes file\n",
    });

    await fab.remove([".factory/templates/notes"], "move notes into a directory");
    await publish(fab, { ".factory/templates/notes/local.md": "# Local note\n" });

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build"]));
    expect(result.code).toBe(0);
    expect(toLF(await readFile(repo.path(".factory", "templates", "notes", "local.md"), "utf8"))).toBe(
      "# Local note\n",
    );
    expect(await metafabYaml(repo)).toContain("version: 1.1.0");
  });

  test("turns an upstream directory into a file", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/templates/notes/local.md": "# Local note\n",
      ".factory/templates/notes/deep/other.md": "# Other\n",
    });

    // Remove the whole directory from the fixture before writing the file that
    // replaces it: the empty subdirectory would make the write fail instead.
    await rm(path.join(fab.work, ".factory", "templates", "notes"), {
      recursive: true,
      force: true,
    });
    await publish(fab, { ".factory/templates/notes": "# Notes file\n" });

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build"]));
    expect(result.code).toBe(0);
    const notes = await stat(repo.path(".factory", "templates", "notes"));
    expect(notes.isFile()).toBe(true);
    expect(toLF(await readFile(repo.path(".factory", "templates", "notes"), "utf8"))).toBe(
      "# Notes file\n",
    );
    expect(await metafabYaml(repo)).toContain("version: 1.1.0");
  });

  test("follows an upstream rename that changes only the case of a path", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/templates/notes.md": "# Note\n\nold\n",
    });

    await fab.remove([".factory/templates/notes.md"], "rename the note");
    await publish(fab, { ".factory/templates/Notes.md": "# Note\n\nnew\n" });

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build"]));
    expect(result.code).toBe(0);
    expect(await readdir(repo.path(".factory", "templates"))).toEqual(["Notes.md"]);
    expect(toLF(await readFile(repo.path(".factory", "templates", "Notes.md"), "utf8"))).toBe(
      "# Note\n\nnew\n",
    );
  });

  test("follows an upstream rename that changes only the case of a directory", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/Skills/guide/SKILL.md": SKILL_V1,
    });
    await writeRepoFiles(repo.root, { ".factory/Skills/local.md": "# Local only\n" });

    // Remove the directory, not just the file: on a case-insensitive filesystem
    // the fixture would otherwise keep the old spelling on disk and commit it.
    await fab.remove([".factory/Skills"], "rename the skills directory");
    await publish(fab, { ".factory/skills/guide/SKILL.md": SKILL_V2 });

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build"]));
    expect(result.code).toBe(0);

    // readdir shows the real on-disk spelling; existsSync would lie on a
    // case-insensitive filesystem.
    const entries = await readdir(repo.path(".factory"));
    expect(entries).toContain("skills");
    expect(entries).not.toContain("Skills");
    expect((await readdir(repo.path(".factory", "skills"))).sort()).toEqual(["guide", "local.md"]);
    expect(toLF(await readFile(repo.path(".factory", "skills", "guide", "SKILL.md"), "utf8"))).toBe(
      SKILL_V2,
    );
    expect(toLF(await readFile(repo.path(".factory", "skills", "local.md"), "utf8"))).toBe(
      "# Local only\n",
    );

    // Only the local-only file is a difference; the renamed directory is not a
    // phantom add/delete pair.
    const diff = await withFabEnvironment(fab, () => runCli(["diff", "--json"], { cwd: repo.root }));
    expect(diff.code).toBe(0);
    const diffFiles = parseJson(diff).files as Array<{ path: string; status: string }>;
    expect(diffFiles.map((file) => ({ path: file.path, status: file.status }))).toEqual([
      { path: "skills/local.md", status: "added" },
    ]);

    // A follow-up update reaches the renamed files, rather than treating the old
    // spelling as a new local file and dropping the upstream change.
    await fab.commit(
      { ".factory/skills/guide/SKILL.md": skill("Second upstream.") },
      "v1.2.0",
    );
    await fab.tag("v1.2.0");
    await fab.push();

    const second = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build"]));
    expect(second.code).toBe(0);
    expect(toLF(await readFile(repo.path(".factory", "skills", "guide", "SKILL.md"), "utf8"))).toBe(
      skill("Second upstream."),
    );
    expect(toLF(await readFile(repo.path(".factory", "skills", "local.md"), "utf8"))).toBe(
      "# Local only\n",
    );
  });

  test("reports a preserved local file at the spelling the rename leaves on disk", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/Skills/guide/SKILL.md": SKILL_V1,
    });
    await writeRepoFiles(repo.root, { ".factory/Skills/local.md": "# Local only\n" });

    await fab.remove([".factory/Skills"], "rename the skills directory");
    await publish(fab, { ".factory/skills/guide/SKILL.md": SKILL_V2 });

    const dryRun = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--no-build", "--dry-run"]),
    );
    expect(dryRun.code).toBe(0);
    expect(pathLines(dryRun.stdout)).toEqual(expectedLines);

    // The dry run prints the tree the real run writes, so it names the
    // preserved file at the directory's new spelling, not the one it is
    // renamed away from. The report is the same as a real run's: a case-only
    // rename is not a change, so the renamed skill is an edit at its new
    // spelling and the local-only file is only preserved.
    const dryJson = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--no-build", "--dry-run", "--json"]),
    );
    expect(dryJson.code).toBe(0);
    const dryPayload = parseJson(dryJson);
    expect(changedFiles(dryPayload)).toEqual(expectedReport);
    expect(reviewPaths(dryPayload)).toEqual(expectedGroups);

    const result = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--no-build", "--json"]),
    );
    expect(result.code).toBe(0);
    const payload = parseJson(result);
    expect(changedFiles(payload)).toEqual(expectedReport);
    expect(reviewPaths(payload)).toEqual(expectedGroups);
  });

  test("prints the same preserved-file summary on a real run", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/Skills/guide/SKILL.md": SKILL_V1,
    });
    await writeRepoFiles(repo.root, { ".factory/Skills/local.md": "# Local only\n" });

    await fab.remove([".factory/Skills"], "rename the skills directory");
    await publish(fab, { ".factory/skills/guide/SKILL.md": SKILL_V2 });

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build"]));
    expect(result.code).toBe(0);
    expect(pathLines(result.stdout)).toEqual(expectedLines);
    expect(await readdir(repo.path(".factory"))).toContain("skills");
  });

  test("reports a case-only upstream rename of an unchanged file as no change", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/Skills/guide/SKILL.md": SKILL_V1,
    });

    await fab.remove([".factory/Skills"], "rename the skills directory");
    await publish(fab, { ".factory/skills/guide/SKILL.md": SKILL_V1 });

    const result = await withFabEnvironment(fab, () =>
      updateFab(repo.root, ["--no-build", "--json"]),
    );
    expect(result.code).toBe(0);
    const payload = parseJson(result);

    // The file exists on disk under both spellings, so it is neither added,
    // updated, nor removed: only the spelling of its directory changed.
    expect({
      preserved: payload.preserved,
      added: payload.added,
      updated: payload.updated,
      removed: payload.removed,
    }).toEqual({ preserved: [], added: [], updated: [], removed: [] });
    expect((payload.review as { groups: unknown[] }).groups).toEqual([]);

    expect(await readdir(repo.path(".factory"))).toContain("skills");
  });

  test("merges a local edit inside a directory renamed only by case", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/Skills/guide/SKILL.md": SKILL_V1,
    });
    await writeRepoFiles(repo.root, { ".factory/Skills/guide/SKILL.md": SKILL_LOCAL });

    await fab.remove([".factory/Skills"], "rename the skills directory");
    await publish(fab, { ".factory/skills/guide/SKILL.md": SKILL_V2 });

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build"]));
    expect(result.code).toBe(0);

    // The case-only rename is one logical path, so the edit merges instead of
    // refusing the update as a case-only clash, and it lands where the source
    // now spells it.
    const entries = await readdir(repo.path(".factory"));
    expect(entries).toContain("skills");
    expect(entries).not.toContain("Skills");
    expect(toLF(await readFile(repo.path(".factory", "skills", "guide", "SKILL.md"), "utf8"))).toBe(
      skill("First line upstream.\nMiddle line.\nLast line local."),
    );
  });

  test("writes markers at the new spelling when a local edit overlaps a case-only rename", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/Skills/guide/SKILL.md": SKILL_V1,
    });
    await writeRepoFiles(repo.root, {
      ".factory/Skills/guide/SKILL.md": skill("First line local.\nMiddle line.\nLast line."),
    });

    await fab.remove([".factory/Skills"], "rename the skills directory");
    await publish(fab, { ".factory/skills/guide/SKILL.md": SKILL_V2 });

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build"]));
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Conflicts: 1");

    const entries = await readdir(repo.path(".factory"));
    expect(entries).toContain("skills");
    expect(entries).not.toContain("Skills");
    const merged = toLF(
      await readFile(repo.path(".factory", "skills", "guide", "SKILL.md"), "utf8"),
    );
    expect(merged).toContain("<<<<<<< yours");
    expect(merged).toContain("First line local.");
    expect(merged).toContain("First line upstream.");
    expect(await metafabYaml(repo)).toContain("version: 1.1.0");
  });

  test("merges a local edit of a file renamed only by case", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/templates/notes.md": "one\ntwo\nthree\n",
    });
    await writeRepoFiles(repo.root, {
      ".factory/templates/notes.md": "one\ntwo\nthree local\n",
    });

    await fab.remove([".factory/templates/notes.md"], "rename the notes");
    await publish(fab, { ".factory/templates/Notes.md": "ONE\ntwo\nthree\n" });

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build"]));
    expect(result.code).toBe(0);
    expect(await readdir(repo.path(".factory", "templates"))).toEqual(["Notes.md"]);
    expect(toLF(await readFile(repo.path(".factory", "templates", "Notes.md"), "utf8"))).toBe(
      "ONE\ntwo\nthree local\n",
    );
  });

  test("still refuses a directory that keeps local content", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/templates/notes/local.md": "# Local note\n",
    });
    await writeRepoFiles(repo.root, { ".factory/templates/notes/mine.md": "# Mine\n" });

    await rm(path.join(fab.work, ".factory", "templates", "notes"), {
      recursive: true,
      force: true,
    });
    await publish(fab, { ".factory/templates/notes": "# Notes file\n" });

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build"]));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "The update would replace .factory/templates/notes with a different kind of entry",
    );
    expect(toLF(await readFile(repo.path(".factory", "templates", "notes", "mine.md"), "utf8"))).toBe(
      "# Mine\n",
    );
    expect(await metafabYaml(repo)).toContain("version: 1.0.0");
  });
});

describe("update without a base", { timeout: 30_000 }, () => {
  const CONFIG = "format: 1\nname: sample-fab\n";
  /** A commit the fixture repository does not have, so the base cannot be fetched. */
  const FORGOTTEN_COMMIT = "0123456789abcdef0123456789abcdef01234567";

  /** Rewrites the recorded commit, as a force push upstream would effectively do. */
  async function forgetBase(repo: TempRepo): Promise<void> {
    const recorded = await metafabYaml(repo);
    await writeRepoFiles(repo.root, {
      ".factory/metafab.yaml": recorded.replace(
        /^(\s*)commit:.*$/m,
        `$1commit: ${FORGOTTEN_COMMIT}`,
      ),
    });
  }

  test("an upstream file the local factory removed is a conflict, not an addition", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/scripts/deploy.sh": "#!/bin/sh\necho deploy\n",
    });

    // The user deletes the file on purpose and upstream force-pushes the
    // recorded commit away, so there is no base to tell the deletion from an
    // upstream addition.
    await rm(repo.path(".factory", "scripts", "deploy.sh"));
    await publish(fab, { ".factory/scripts/deploy.sh": "#!/bin/sh\necho deploy v2\n" });
    await forgetBase(repo);

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build", "--json"]));
    expect(result.code).toBe(1);
    const payload = parseJson(result);
    expect(payload.conflicts).toEqual(["scripts/deploy.sh"]);
    expect(payload.sideFiles).toEqual(["scripts/deploy.sh"]);
    expect(payload.built).toBe(false);

    // The removed path stays absent, and upstream is kept beside it.
    expect(await pathExists(repo.path(".factory", "scripts", "deploy.sh"))).toBe(false);
    expect(
      toLF(await readFile(repo.path(".factory", "scripts", "deploy.sh.upstream"), "utf8")),
    ).toBe("#!/bin/sh\necho deploy v2\n");
    expect(result.stdout).toContain("cannot tell a local removal from an upstream addition");
    // The new version is recorded, as for every conflicted update.
    expect(await metafabYaml(repo)).toContain("version: 1.1.0");
  });

  test("a local file upstream no longer has is a conflict that keeps yours", async () => {
    const { repo, fab } = await importedFrom({
      ".factory/factory.yaml": CONFIG,
      ".factory/templates/kept.md": "# Kept\n",
    });

    await fab.remove([".factory/templates/kept.md"], "remove kept");
    await fab.tag("v1.1.0");
    await fab.push();
    await forgetBase(repo);

    const result = await withFabEnvironment(fab, () => updateFab(repo.root, ["--no-build", "--json"]));
    expect(result.code).toBe(1);
    const payload = parseJson(result);
    expect(payload.conflicts).toEqual(["templates/kept.md"]);
    expect(payload.sideFiles).toEqual([]);

    // A removal has no content to write to a side file, so the local file is
    // kept and the conflict is reported without one.
    expect(toLF(await readFile(repo.path(".factory", "templates", "kept.md"), "utf8"))).toBe(
      "# Kept\n",
    );
    expect(result.stdout).toContain(
      "cannot tell your local file from an upstream removal",
    );
    expect(await metafabYaml(repo)).toContain("version: 1.1.0");
  });
});

