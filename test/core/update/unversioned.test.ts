import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { pathExists } from "../../../src/util/fs.js";
import { toLF } from "../../../src/util/text.js";
import { makeRepo, writeRepoFiles } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import { caseInsensitiveFilesystem } from "./case-probe.js";
import { parseJson, updateFab } from "./git-fab.js";
import { runCli } from "../../helpers/runCli.js";
import type { RunCliResult } from "../../helpers/runCli.js";
import { isolateGitConfig } from "../hooks/helpers.js";

const caseInsensitiveFs = await caseInsensitiveFilesystem();

const repos: TempRepo[] = [];
const roots: string[] = [];
let isolation: Awaited<ReturnType<typeof isolateGitConfig>> | undefined;

afterEach(async () => {
  isolation?.restore();
  if (isolation !== undefined) {
    await rm(isolation.dir, { recursive: true, force: true });
    isolation = undefined;
  }
  await Promise.all([
    ...repos.splice(0).map((repo) => repo.cleanup()),
    ...roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ]);
});

function skill(body: string): string {
  return `---\nname: guide\ndescription: Use the guide when the task needs it.\n---\n\n# Guide\n\n${body}\n`;
}

const SOURCE_V1: RepoFiles = {
  ".factory/factory.yaml": "format: 1\nname: local-fab\n",
  ".factory/AGENTS.md": "# Agents v1\n",
  ".factory/skills/guide/SKILL.md": skill("source v1"),
};

async function sourceFab(): Promise<{ root: string; source: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "metafab-update-path-"));
  roots.push(root);
  await writeRepoFiles(root, SOURCE_V1);
  return { root, source: path.join(root, ".factory") };
}

async function imported(): Promise<{ repo: TempRepo; root: string }> {
  const fab = await sourceFab();
  const repo = await makeRepo({}, { git: true });
  repos.push(repo);
  const result = await runCli(["import", fab.source, "--agents", "claude", "--json"], {
    cwd: repo.root,
  });
  expect(result.code).toBe(0);
  return { repo, root: fab.root };
}

function parse(result: RunCliResult): Record<string, unknown> {
  return parseJson(result);
}

describe("update from an unversioned source", () => {
  test("replaces upstream-owned files, keeps local-only files, and builds", async () => {
    const { repo, root } = await imported();

    await writeRepoFiles(repo.root, {
      ".factory/skills/guide/SKILL.md": skill("local edit"),
      ".factory/templates/local.md": "# Local only\n",
    });
    await writeRepoFiles(root, {
      ".factory/skills/guide/SKILL.md": skill("source v2"),
      ".factory/templates/new.md": "# New from source\n",
      ".factory/AGENTS.md": "# Agents v2\n",
    });

    const dryRun = await updateFab(repo.root, ["--dry-run"]);
    expect(dryRun.code).toBe(0);
    expect(dryRun.stdout).toContain("skills/guide/SKILL.md");
    expect(dryRun.stdout).toContain("templates/new.md");
    expect(dryRun.stdout).toContain("Dry run: nothing was written.");
    expect(toLF(await readFile(repo.path(".factory", "skills", "guide", "SKILL.md"), "utf8"))).toBe(
      skill("local edit"),
    );
    expect(await pathExists(repo.path(".factory", "templates", "new.md"))).toBe(false);

    const result = await updateFab(repo.root, ["--json"]);
    expect(result.code).toBe(0);
    const payload = parse(result);
    expect(payload.status).toBe("updated");
    expect(payload.versioned).toBe(false);
    expect(payload.replaced).toEqual([
      "AGENTS.md",
      "skills/guide/SKILL.md",
      "templates/new.md",
    ]);
    expect(payload.built).toBe(true);

    expect(toLF(await readFile(repo.path(".factory", "skills", "guide", "SKILL.md"), "utf8"))).toBe(
      skill("source v2"),
    );
    expect(toLF(await readFile(repo.path(".factory", "AGENTS.md"), "utf8"))).toBe("# Agents v2\n");
    expect(toLF(await readFile(repo.path(".factory", "templates", "new.md"), "utf8"))).toBe(
      "# New from source\n",
    );
    expect(toLF(await readFile(repo.path(".factory", "templates", "local.md"), "utf8"))).toBe(
      "# Local only\n",
    );

    // The build installed the source version of the skill.
    expect(toLF(await readFile(repo.path(".claude", "skills", "guide", "SKILL.md"), "utf8"))).toContain(
      "source v2",
    );

    const human = await updateFab(repo.root, ["--no-build"]);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("Replaced local edits can be restored from Git.");
  });

  test("refuses --to for an unversioned source", async () => {
    const { repo } = await imported();
    const result = await updateFab(repo.root, ["--to", "1.0.0"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--to 1.0.0 cannot select a version from an unversioned upstream");
    expect(result.stderr).toContain("Run metafab update without --to");
  });

  test("diff with no edits names the source without a version", async () => {
    const { repo, root } = await imported();
    const result = await runCli(["diff"], { cwd: repo.root });
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(`No local edits since ${path.join(root, ".factory")}.`);
  });

  test.skipIf(process.platform === "win32")(
    "reports a foreign Git hook warning from the closing build",
    async () => {
      isolation = await isolateGitConfig();
      const { repo, root } = await imported();
      const config = await readFile(repo.path(".factory", "metafab.yaml"), "utf8");
      const foreign = "#!/bin/sh\necho foreign\n";
      await writeRepoFiles(repo.root, {
        ".factory/metafab.yaml": `${config}git-hooks: true\n`,
        ".git/hooks/post-merge": foreign,
      });
      await writeRepoFiles(root, { ".factory/AGENTS.md": "# Agents v2\n" });

      const result = await updateFab(repo.root, ["--json"]);

      expect(result.code).toBe(0);
      const problems = parse(result).problems as { message: string }[];
      expect(
        problems.some(
          (problem) => problem.message === ".git/hooks/post-merge exists and was not written by Metafab",
        ),
      ).toBe(true);
      expect(await readFile(repo.path(".git", "hooks", "post-merge"), "utf8")).toBe(foreign);
    },
  );

  test("keeps the local metafab.yaml and factory README", async () => {
    const { repo, root } = await imported();
    await writeFile(repo.path(".factory", "README.md"), "# Local README\n");
    await writeRepoFiles(root, {
      ".factory/README.md": "# Source README\n",
      ".factory/metafab.yaml": "publish:\n  name: from-source\n",
    });

    const result = await updateFab(repo.root, ["--no-build"]);
    expect(result.code).toBe(0);
    expect(toLF(await readFile(repo.path(".factory", "README.md"), "utf8"))).toBe("# Local README\n");
    expect(await readFile(repo.path(".factory", "metafab.yaml"), "utf8")).not.toContain(
      "from-source",
    );
  });

  test("refuses a source file that would replace a local directory", async () => {
    const { repo, root } = await imported();
    await writeRepoFiles(repo.root, {
      ".factory/templates/notes/local.md": "# Local note\n",
    });
    await writeRepoFiles(root, { ".factory/templates/notes": "# Source notes file\n" });

    for (const args of [["--no-build"], ["--dry-run"]]) {
      const result = await updateFab(repo.root, args);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "The update would replace .factory/templates/notes with a different kind of entry",
      );
      expect(
        toLF(await readFile(repo.path(".factory", "templates", "notes", "local.md"), "utf8")),
      ).toBe("# Local note\n");
    }
  });

  test("replaces a path that differs only in case with the source's spelling", async () => {
    const { repo, root } = await imported();

    // A checkout on another filesystem can spell these paths differently. The
    // copy replaces the files anyway, so it writes the source's spelling.
    await rename(repo.path(".factory", "AGENTS.md"), repo.path(".factory", "agents.md"));
    await rename(repo.path(".factory", "skills"), repo.path(".factory", "Skills"));
    await writeRepoFiles(root, {
      ".factory/AGENTS.md": "# Agents v2\n",
      ".factory/skills/guide/SKILL.md": skill("source v2"),
    });

    // The dry run reports both halves of a case-only replacement; before, the
    // old spelling stayed in the predicted tree and the delete line was lost.
    const dryRun = await updateFab(repo.root, ["--dry-run"]);
    expect(dryRun.code).toBe(0);
    expect(dryRun.stdout).toContain("A AGENTS.md");
    expect(dryRun.stdout).toContain("D agents.md");
    expect(dryRun.stdout).toContain("A skills/guide/SKILL.md");
    expect(dryRun.stdout).toContain("D Skills/guide/SKILL.md");
    expect(toLF(await readFile(repo.path(".factory", "agents.md"), "utf8"))).toBe("# Agents v1\n");

    const result = await updateFab(repo.root, ["--no-build"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("A AGENTS.md");
    expect(result.stdout).toContain("D agents.md");
    expect(result.stdout).toContain("A skills/guide/SKILL.md");
    expect(result.stdout).toContain("D Skills/guide/SKILL.md");
    const entries = await readdir(repo.path(".factory"));
    expect(entries).toContain("AGENTS.md");
    expect(entries).not.toContain("agents.md");
    expect(entries).toContain("skills");
    expect(entries).not.toContain("Skills");
    expect(toLF(await readFile(repo.path(".factory", "AGENTS.md"), "utf8"))).toBe("# Agents v2\n");
    expect(toLF(await readFile(repo.path(".factory", "skills", "guide", "SKILL.md"), "utf8"))).toBe(
      skill("source v2"),
    );
  });

  test.skipIf(caseInsensitiveFs)(
    "keeps a local-only file that folds to the source's path",
    async () => {
      const { repo, root } = await imported();

      await writeRepoFiles(repo.root, { ".factory/agents.md": "# Local agents\n" });
      await writeRepoFiles(root, { ".factory/AGENTS.md": "# Agents v2\n" });

      const result = await updateFab(repo.root, ["--no-build"]);
      expect(result.code).toBe(0);
      expect(toLF(await readFile(repo.path(".factory", "AGENTS.md"), "utf8"))).toBe("# Agents v2\n");
      expect(toLF(await readFile(repo.path(".factory", "agents.md"), "utf8"))).toBe(
        "# Local agents\n",
      );
    },
  );

  test.skipIf(caseInsensitiveFs)(
    "refuses several local spellings that fold to one incoming path",
    async () => {
      const { repo, root } = await imported();

      await rename(repo.path(".factory", "AGENTS.md"), repo.path(".factory", "Agents.md"));
      await writeRepoFiles(repo.root, { ".factory/agents.md": "# Local agents\n" });
      await writeRepoFiles(root, { ".factory/AGENTS.md": "# Agents v2\n" });

      for (const args of [["--no-build"], ["--dry-run"]]) {
        const result = await updateFab(repo.root, args);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain("differ only in case");
        expect(result.stderr).toContain(
          "Move all but one of the local entries away, then run metafab update again",
        );
        expect(toLF(await readFile(repo.path(".factory", "Agents.md"), "utf8"))).toBe(
          "# Agents v1\n",
        );
        expect(toLF(await readFile(repo.path(".factory", "agents.md"), "utf8"))).toBe(
          "# Local agents\n",
        );
      }
    },
  );

  test("resolves a recorded relative source from the project root in a subdirectory", async () => {
    const fab = await sourceFab();
    const repo = await makeRepo({}, { git: true });
    repos.push(repo);

    const relative = path.relative(repo.root, fab.source);
    const imported = await runCli(["import", relative, "--agents", "claude", "--json"], {
      cwd: repo.root,
    });
    expect(imported.code).toBe(0);

    await writeRepoFiles(fab.root, { ".factory/AGENTS.md": "# Agents from root\n" });

    const updated = await updateFab(repo.path(".factory"), ["--no-build"]);
    expect(updated.code).toBe(0);
    expect(toLF(await readFile(repo.path(".factory", "AGENTS.md"), "utf8"))).toBe(
      "# Agents from root\n",
    );

    await writeRepoFiles(fab.root, { ".factory/AGENTS.md": "# Agents diffed from root\n" });
    const diff = await runCli(["diff", "--json"], { cwd: repo.path(".factory") });
    expect(diff.code).toBe(0);
    expect(parseJson(diff).files).toHaveLength(1);
  });
});
