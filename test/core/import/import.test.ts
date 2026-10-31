import { chmod, mkdtemp, readdir, readFile, readlink, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { listFiles, pathExists } from "../../../src/util/fs.js";
import { makeRepo, writeRepoFiles } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";
import type { RunCliResult } from "../../helpers/runCli.js";
import { runGitIn } from "../sources/git-fixture.js";

const repos: TempRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

async function repoWith(files: RepoFiles = {}, git = true): Promise<TempRepo> {
  const repo = await makeRepo(files, { git });
  repos.push(repo);
  return repo;
}

function skill(name: string, body = `Use ${name} when the task needs it.`): string {
  return `---\nname: ${name}\ndescription: Use ${name} when the task needs it.\n---\n\n# ${name}\n\n${body}\n`;
}

function fabFiles(body = "Fab body."): RepoFiles {
  return {
    ".factory/factory.yaml": "format: 1\nname: demo-fab\n\npipeline:\n  - sample-workflow\n",
    ".factory/AGENTS.md": "# Demo fab agents\n",
    ".factory/workflows/sample-workflow/SKILL.md": skill("sample-workflow"),
    ".factory/skills/guide/SKILL.md": skill("guide", body),
    ".factory/metafab.yaml": "publish:\n  name: fab-demo\n",
    ".factory/README.md": "# The fab README lives at the fab root\n",
  };
}

async function makeFab(files: RepoFiles): Promise<TempRepo> {
  return repoWith(files, false);
}

async function snapshot(root: string): Promise<Record<string, string>> {
  const files = await listFiles(root, {
    ignore: (relativePath) => relativePath === ".git" || relativePath.startsWith(".git/"),
  });
  const entries: Record<string, string> = {};
  for (const file of files) {
    entries[file] = await readFile(path.join(root, ...file.split("/")), "utf8");
  }
  return entries;
}

function parseJson(result: RunCliResult): Record<string, unknown> {
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

/**
 * Point `TMPDIR` at a fresh directory for one call. `os.tmpdir()` reads it each
 * time, so a fetch's `mkdtemp` lands there, and any directory it forgets stays
 * behind for the assertion.
 */
async function withScratchTemp<T>(run: (scratch: string) => Promise<T>): Promise<T> {
  const scratch = await mkdtemp(path.join(tmpdir(), "metafab-import-scratch-"));
  const previous = { tmpdir: process.env.TMPDIR, temp: process.env.TEMP };
  process.env.TMPDIR = scratch;
  process.env.TEMP = scratch;
  try {
    return await run(scratch);
  } finally {
    if (previous.tmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous.tmpdir;
    if (previous.temp === undefined) delete process.env.TEMP;
    else process.env.TEMP = previous.temp;
    await rm(scratch, { recursive: true, force: true });
  }
}

describe("metafab import", () => {
  test("copies a fab from a local path into an empty repository", async () => {
    const repo = await repoWith();
    const fab = await makeFab(fabFiles());

    const result = await runCli(["import", fab.root, "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(0);
    const config = await readFile(repo.path(".factory", "metafab.yaml"), "utf8");
    expect(config).toContain("agents: [claude]");
    expect(config).toContain(`source: ${fab.root}`);
    expect(config).not.toContain("publish");

    expect(await readFile(repo.path(".gitattributes"), "utf8")).toBe(
      [
        ".factory/** text=auto eol=lf",
        ".claude/skills/** text=auto eol=lf",
        ".agents/skills/** text=auto eol=lf",
        "",
      ].join("\n"),
    );
    expect(await readFile(repo.path(".factory", "factory.yaml"), "utf8")).toBe(
      "format: 1\nname: demo-fab\n\npipeline:\n  - sample-workflow\n",
    );
    expect(await readFile(repo.path(".factory", "workflows", "sample-workflow", "SKILL.md"), "utf8")).toBe(
      skill("sample-workflow"),
    );
    expect(await readFile(repo.path(".factory", "skills", "guide", "SKILL.md"), "utf8")).toBe(
      skill("guide", "Fab body."),
    );
    expect(await readFile(repo.path(".gitignore"), "utf8")).toContain(
      "# metafab:start\n.claude/skills/\n# metafab:end\n",
    );
    expect(await pathExists(repo.path(".claude", "skills", "guide", "SKILL.md"))).toBe(true);
    expect(await pathExists(repo.path(".claude", "skills", "metafab", "SKILL.md"))).toBe(true);

    // The fab's own metafab.yaml and README never travel.
    expect(await pathExists(repo.path(".factory", "README.md"))).toBe(false);

    expect(result.stdout).toContain(`Imported ${fab.root}`);
    expect(result.stdout).toContain("Workflows");
    expect(result.stdout).toContain("Skills");
    expect(result.stdout).toContain("Nothing was committed. Review the changes with git diff.");
  });

  test("creates no factory.yaml placeholder when the fab has none", async () => {
    const repo = await repoWith();
    const fab = await makeFab({
      ".factory/AGENTS.md": "# Lean fab\n",
      ".factory/skills/guide/SKILL.md": skill("guide"),
    });

    const result = await runCli(["import", fab.root, "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(0);
    expect(await pathExists(repo.path(".factory", "factory.yaml"))).toBe(false);
    expect(await pathExists(repo.path(".factory", "AGENTS.md"))).toBe(true);
    expect(await readFile(repo.path(".factory", "metafab.yaml"), "utf8")).toContain("upstream:");
    expect(await pathExists(repo.path(".gitattributes"))).toBe(true);
    expect(await pathExists(repo.path(".claude", "skills", "guide", "SKILL.md"))).toBe(true);
  });

  test("a differing local file stops the import and lists every conflict", async () => {
    const repo = await repoWith({
      ".factory/factory.yaml": "format: 1\nname: local\n",
      ".factory/skills/guide/SKILL.md": skill("guide", "Local body."),
    });
    const fab = await makeFab(fabFiles("Fab body."));
    const before = await snapshot(repo.root);

    const result = await runCli(["import", fab.root, "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(5);
    expect(result.stdout).toContain("Import stopped because the incoming fab would replace local files.");
    expect(result.stderr).toContain(".factory/skills/guide/SKILL.md");
    expect(result.stderr).toContain(".factory/factory.yaml");
    expect(await snapshot(repo.root)).toEqual(before);
  });

  test("--force replaces differing local files", async () => {
    const repo = await repoWith({
      ".factory/skills/guide/SKILL.md": skill("guide", "Local body."),
    });
    const fab = await makeFab(fabFiles("Fab body."));

    const result = await runCli(["import", fab.root, "--agents", "claude", "--force"], {
      cwd: repo.root,
    });

    expect(result.code).toBe(0);
    expect(await readFile(repo.path(".factory", "skills", "guide", "SKILL.md"), "utf8")).toBe(
      skill("guide", "Fab body."),
    );
  });

  test("an identical local file is not a conflict, even with different line endings", async () => {
    const repo = await repoWith({
      ".factory/skills/guide/SKILL.md": skill("guide", "Fab body.").replace(/\n/g, "\r\n"),
    });
    const fab = await makeFab(fabFiles());

    const result = await runCli(["import", fab.root, "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(0);
  });

  test("an existing upstream stops the import", async () => {
    const repo = await repoWith({
      ".factory/metafab.yaml": [
        "upstream:",
        '  source: "@seasb/fab-mark4"',
        "  requested: ^1.2.0",
        "  version: 1.2.0",
        "",
      ].join("\n"),
    });
    const fab = await makeFab(fabFiles());
    const before = await snapshot(repo.root);

    const result = await runCli(["import", fab.root, "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(5);
    expect(result.stdout).toBe("This factory already has an upstream\n");
    expect(result.stderr).toContain(".factory/metafab.yaml: error: This factory already has an upstream");
    expect(result.stderr).toContain("fix: Use metafab update or metafab detach");
    expect(await snapshot(repo.root)).toEqual(before);
  });

  test("--json returns the review as structured data", async () => {
    const repo = await repoWith();
    const fab = await makeFab(fabFiles());

    const result = await runCli(["import", fab.root, "--agents", "claude", "--json"], {
      cwd: repo.root,
    });

    expect(result.code).toBe(0);
    const payload = parseJson(result);
    expect(payload.ok).toBe(true);
    expect(payload.command).toBe("import");
    expect(payload.exitCode).toBe(0);
    expect(payload.summary).toBeUndefined();
    expect(payload.upstream).toEqual({
      kind: "unversioned",
      source: fab.root,
    });
    const review = payload.review as { title: string; groups: { key: string }[]; footer: string };
    expect(review.title).toBe(`Imported ${fab.root}`);
    expect(review.groups.map((group) => group.key)).toContain("workflows");
    expect(review.groups.map((group) => group.key)).toContain("skills");
    expect(review.footer).toBe("Nothing was committed. Review the changes with git diff.");
  });

  test("an invalid fab leaves git status clean", async () => {
    const repo = await repoWith({ "README.md": "# Repository\n" });
    await runGitIn(repo.root, ["add", "-A"]);
    await runGitIn(repo.root, ["commit", "-qm", "initial"]);

    const fab = await makeFab({
      ".factory/skills/broken/SKILL.md": "# Broken\n",
    });

    const result = await runCli(["import", fab.root, "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(4);
    expect(await runGitIn(repo.root, ["status", "--porcelain"])).toBe("");
    expect(await pathExists(repo.path(".factory"))).toBe(false);
  });

  test("a failing fetch leaves git status clean", async () => {
    const repo = await repoWith({ "README.md": "# Repository\n" });
    await runGitIn(repo.root, ["add", "-A"]);
    await runGitIn(repo.root, ["commit", "-qm", "initial"]);

    const result = await runCli(
      ["import", path.join(repo.root, "missing-fab"), "--agents", "claude"],
      { cwd: repo.root },
    );

    expect(result.code).toBe(3);
    expect(await runGitIn(repo.root, ["status", "--porcelain"])).toBe("");
  });

  test("import without a source fails", async () => {
    const repo = await repoWith();

    const result = await runCli(["import", "--json"], { cwd: repo.root });

    expect(result.code).toBe(1);
    const payload = parseJson(result);
    expect(payload.problems).toEqual([
      {
        level: "error",
        file: "metafab",
        message: "The import command requires a source.",
        fix: "Run metafab import <source>",
      },
    ]);
  });
});

describe("adoption during import", () => {
  test("requires --adopt without a terminal and changes nothing", async () => {
    const repo = await repoWith({ ".claude/skills/release/SKILL.md": skill("release") });
    const fab = await makeFab(fabFiles());
    const before = await snapshot(repo.root);

    const result = await runCli(["import", fab.root, "--agents", "claude", "--json"], {
      cwd: repo.root,
    });

    expect(result.code).toBe(2);
    const required = parseJson(result).required as Record<string, unknown>[];
    expect(required[0]!.flag).toBe("--adopt");
    expect(required[0]!.moves).toEqual([
      {
        name: "release",
        from: [".claude/skills/release"],
        to: ".factory/skills/release",
      },
    ]);
    expect(await snapshot(repo.root)).toEqual(before);
    expect(await pathExists(repo.path(".factory"))).toBe(false);
  });

  test("--adopt moves an existing skill and builds it beside the fab", async () => {
    const repo = await repoWith({ ".claude/skills/release/SKILL.md": skill("release") });
    const fab = await makeFab(fabFiles());

    const result = await runCli(["import", fab.root, "--agents", "claude", "--adopt"], {
      cwd: repo.root,
    });

    expect(result.code).toBe(0);
    expect(await readFile(repo.path(".factory", "skills", "release", "SKILL.md"), "utf8")).toBe(
      skill("release"),
    );
    expect(await pathExists(repo.path(".claude", "skills", "release", "SKILL.md"))).toBe(true);
  });

  test("an adopted skill that overlaps the fab follows the conflict rule", async () => {
    const repo = await repoWith({
      ".claude/skills/release/SKILL.md": skill("release", "Adopted body."),
    });
    const fab = await makeFab({
      ...fabFiles(),
      ".factory/skills/release/SKILL.md": skill("release", "Fab body."),
    });
    const before = await snapshot(repo.root);

    const stopped = await runCli(["import", fab.root, "--agents", "claude", "--adopt"], {
      cwd: repo.root,
    });

    expect(stopped.code).toBe(5);
    expect(stopped.stderr).toContain(".claude/skills/release/SKILL.md");
    expect(await snapshot(repo.root)).toEqual(before);

    const forced = await runCli(
      ["import", fab.root, "--agents", "claude", "--adopt", "--force"],
      { cwd: repo.root },
    );

    expect(forced.code).toBe(0);
    expect(await readFile(repo.path(".factory", "skills", "release", "SKILL.md"), "utf8")).toBe(
      skill("release", "Fab body."),
    );
    // The adopted copy moved into the factory and was then replaced by the fab.
    expect(await readFile(repo.path(".claude", "skills", "release", "SKILL.md"), "utf8")).toContain(
      "Generated by metafab build",
    );
  });

  test("an adopted skill identical to the fab needs no --force", async () => {
    const repo = await repoWith({ ".claude/skills/release/SKILL.md": skill("release") });
    const fab = await makeFab({
      ...fabFiles(),
      ".factory/skills/release/SKILL.md": skill("release"),
    });

    const result = await runCli(["import", fab.root, "--agents", "claude", "--adopt"], {
      cwd: repo.root,
    });

    expect(result.code).toBe(0);
    expect(await readFile(repo.path(".factory", "skills", "release", "SKILL.md"), "utf8")).toBe(
      skill("release"),
    );
  });
});

describe("temporary fetch directories", () => {
  test("a successful import from a local path removes its fetch directory", async () => {
    const repo = await repoWith();
    const fab = await makeFab(fabFiles());

    const result = await withScratchTemp(async (scratch) => {
      const run = await runCli(["import", fab.root, "--agents", "claude"], { cwd: repo.root });
      expect(await readdir(scratch)).toEqual([]);
      return run;
    });

    expect(result.code).toBe(0);
  });

  test("a file conflict stops the import and removes its fetch directory", async () => {
    const repo = await repoWith({
      ".factory/skills/guide/SKILL.md": skill("guide", "Local body."),
    });
    const fab = await makeFab(fabFiles("Fab body."));

    const result = await withScratchTemp(async (scratch) => {
      const run = await runCli(["import", fab.root, "--agents", "claude"], { cwd: repo.root });
      expect(await readdir(scratch)).toEqual([]);
      return run;
    });

    expect(result.code).toBe(5);
  });

  test("exit 2 for adoption consent removes its fetch directory", async () => {
    const repo = await repoWith({ ".claude/skills/release/SKILL.md": skill("release") });
    const fab = await makeFab(fabFiles());

    const result = await withScratchTemp(async (scratch) => {
      const run = await runCli(["import", fab.root, "--agents", "claude"], { cwd: repo.root });
      expect(await readdir(scratch)).toEqual([]);
      return run;
    });

    expect(result.code).toBe(2);
  });
});

describe("import into an existing factory", () => {
  test("keeps local files the fab does not carry and records the upstream", async () => {
    const repo = await repoWith({
      ".factory/factory.yaml": "format: 1\nname: local\n",
      ".factory/local-note.md": "Local note\n",
    });
    const fab = await makeFab(fabFiles());

    const result = await runCli(["import", fab.root, "--agents", "claude", "--force"], {
      cwd: repo.root,
    });

    expect(result.code).toBe(0);
    expect(await readFile(repo.path(".factory", "local-note.md"), "utf8")).toBe("Local note\n");
    expect(await readFile(repo.path(".factory", "factory.yaml"), "utf8")).toContain("name: demo-fab");
  });
});

describe("copying a fab", () => {
  test("keeps file modes and symlinks", async () => {
    const repo = await repoWith();
    const fab = await makeFab(fabFiles());
    await writeRepoFiles(fab.root, {
      ".factory/scripts/run.sh": "#!/bin/sh\necho run\n",
      ".factory/notes.md": "notes\n",
    });
    await chmod(fab.path(".factory", "scripts", "run.sh"), 0o755);
    await symlink("notes.md", fab.path(".factory", "notes-link.md"));

    const result = await runCli(["import", fab.root, "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(0);
    expect((await stat(repo.path(".factory", "scripts", "run.sh"))).mode & 0o111).not.toBe(0);
    expect(await readlink(repo.path(".factory", "notes-link.md"))).toBe("notes.md");
  });
});
