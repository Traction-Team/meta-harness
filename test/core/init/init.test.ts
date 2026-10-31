import { chmod, mkdir, readFile, symlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { deriveFactoryName } from "../../../src/core/init/name.js";
import { listFiles, pathExists } from "../../../src/util/fs.js";
import { makeRepo, writeRepoFiles } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";
import type { RunCliResult } from "../../helpers/runCli.js";

const repos: TempRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

async function gitRepo(files: RepoFiles = {}): Promise<TempRepo> {
  const repo = await makeRepo(files, { git: true });
  repos.push(repo);
  return repo;
}

function skill(name: string, description = `Use ${name} when the task needs it.`): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;
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

describe("metafab init", () => {
  test("creates the factory files, gitattributes lines, gitignore block and built-in skills", async () => {
    const repo = await gitRepo();

    const result = await runCli(["init", "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Created .factory/factory.yaml");
    expect(result.stdout).not.toContain("Already initialised");

    const name = deriveFactoryName(path.basename(repo.root));
    expect(await readFile(repo.path(".factory", "factory.yaml"), "utf8")).toBe(
      `format: 1\nname: ${name}\n`,
    );
    expect(await readFile(repo.path(".factory", "AGENTS.md"), "utf8")).toBe("");
    expect(await readFile(repo.path(".factory", "metafab.yaml"), "utf8")).toBe("agents: [claude]\n");
    expect(await readFile(repo.path(".gitattributes"), "utf8")).toBe(
      [
        ".factory/** text=auto eol=lf",
        ".claude/skills/** text=auto eol=lf",
        ".agents/skills/** text=auto eol=lf",
        "",
      ].join("\n"),
    );

    const gitignore = await readFile(repo.path(".gitignore"), "utf8");
    expect(gitignore).toContain("# metafab:start\n.claude/skills/\n# metafab:end\n");
    expect(gitignore).not.toContain(".agents/skills/");

    const installed = await readFile(
      repo.path(".claude", "skills", "metafab", "SKILL.md"),
      "utf8",
    );
    expect(installed).toContain("name: metafab");
    expect(await pathExists(repo.path(".agents"))).toBe(false);
  });

  test("creates .factory at the repository root when run in a subdirectory", async () => {
    const repo = await gitRepo();
    await mkdir(repo.path("packages", "app"), { recursive: true });

    const result = await runCli(["init", "--agents", "claude"], {
      cwd: repo.path("packages", "app"),
    });

    expect(result.code).toBe(0);
    expect(await pathExists(repo.path(".factory", "factory.yaml"))).toBe(true);
    expect(await pathExists(repo.path("packages", "app", ".factory"))).toBe(false);
  });

  test("a second run changes nothing and reports Already initialised", async () => {
    const repo = await gitRepo();
    await runCli(["init", "--agents", "claude"], { cwd: repo.root });
    const before = await snapshot(repo.root);

    const result = await runCli(["init", "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("Already initialised\n");
    expect(await snapshot(repo.root)).toEqual(before);
  });

  test("selects all targets without --agents and without a terminal", async () => {
    const repo = await gitRepo();

    const result = await runCli(["init"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(0);
    expect(await readFile(repo.path(".factory", "metafab.yaml"), "utf8")).toBe("agents: all\n");
    expect(await pathExists(repo.path(".claude", "skills", "metafab", "SKILL.md"))).toBe(true);
    expect(await pathExists(repo.path(".agents", "skills", "metafab", "SKILL.md"))).toBe(true);
  });

  test("--adopt moves an existing skill and installs the generated copy", async () => {
    const repo = await gitRepo({
      ".claude/skills/release/SKILL.md": skill("release"),
      ".claude/skills/release/run.sh": "#!/bin/sh\necho release\n",
    });

    const result = await runCli(["init", "--agents", "claude", "--adopt"], { cwd: repo.root });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Moved .claude/skills/release -> .factory/skills/release");
    expect(await readFile(repo.path(".factory", "skills", "release", "SKILL.md"), "utf8")).toBe(
      skill("release"),
    );
    expect(await readFile(repo.path(".factory", "skills", "release", "run.sh"), "utf8")).toBe(
      "#!/bin/sh\necho release\n",
    );

    const installed = await readFile(repo.path(".claude", "skills", "release", "SKILL.md"), "utf8");
    expect(installed).toContain("Generated by metafab build from .factory/skills/release/");
    expect(await pathExists(repo.path(".claude", "skills", "release", "run.sh"))).toBe(true);
    expect(await readFile(repo.path(".gitignore"), "utf8")).toContain(
      "# metafab:start\n.claude/skills/\n# metafab:end\n",
    );
  });

  test("requires --adopt without a terminal and changes nothing", async () => {
    const repo = await gitRepo({
      ".claude/skills/release/SKILL.md": skill("release"),
    });
    const before = await snapshot(repo.root);

    const result = await runCli(["init", "--agents", "claude", "--json"], { cwd: repo.root });

    expect(result.code).toBe(2);
    const payload = parseJson(result);
    const required = payload.required as Record<string, unknown>[];
    expect(required).toEqual([
      {
        name: "adopt",
        flag: "--adopt",
        description: "Move existing repository skills into .factory/skills/ and ignore the generated copies",
        moves: [
          {
            name: "release",
            from: [".claude/skills/release"],
            to: ".factory/skills/release",
          },
        ],
      },
    ]);
    expect(await snapshot(repo.root)).toEqual(before);
    expect(await pathExists(repo.path(".factory"))).toBe(false);
  });

  test("declining the adoption question changes nothing", async () => {
    const repo = await gitRepo({
      ".claude/skills/release/SKILL.md": skill("release"),
    });
    const before = await snapshot(repo.root);

    const result = await runCli(["init", "--agents", "claude"], {
      cwd: repo.root,
      tty: true,
      stdin: Readable.from(["n\n"]),
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Adoption declined");
    expect(await snapshot(repo.root)).toEqual(before);
    expect(await pathExists(repo.path(".factory"))).toBe(false);
  });

  test("accepting the adoption question moves the skill", async () => {
    const repo = await gitRepo({
      ".claude/skills/release/SKILL.md": skill("release"),
    });

    const result = await runCli(["init", "--agents", "claude"], {
      cwd: repo.root,
      tty: true,
      stdin: Readable.from(["y\n"]),
    });

    expect(result.code).toBe(0);
    expect(await pathExists(repo.path(".factory", "skills", "release", "SKILL.md"))).toBe(true);
    expect(await pathExists(repo.path(".claude", "skills", "release", "SKILL.md"))).toBe(true);
  });

  test("a stray file blocks adoption with exit 5 and writes nothing", async () => {
    const repo = await gitRepo({
      ".claude/skills/README.md": "notes\n",
    });
    const before = await snapshot(repo.root);

    const result = await runCli(["init", "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(5);
    expect(result.stdout).toBe("Adoption is blocked by 1 entry.\n");
    expect(result.stderr).toContain("Unowned file .claude/skills/README.md");
    expect(await snapshot(repo.root)).toEqual(before);
    expect(await pathExists(repo.path(".factory"))).toBe(false);
  });

  test("a factory skill's declared name blocks adoption with exit 5 and writes nothing", async () => {
    const repo = await gitRepo({
      ".factory/skills/alpha/SKILL.md": skill("beta"),
      ".claude/skills/beta/SKILL.md": skill("beta"),
    });
    const before = await snapshot(repo.root);

    const result = await runCli(["init", "--agents", "claude", "--adopt"], { cwd: repo.root });

    expect(result.code).toBe(5);
    expect(result.stdout).toBe("Adoption is blocked by 1 entry.\n");
    expect(result.stderr).toContain('Skill "beta" already exists in .factory/');
    expect(await snapshot(repo.root)).toEqual(before);
    expect(await pathExists(repo.path(".factory", "skills", "beta"))).toBe(false);
  });

  test("adopts a skill added directly to a managed destination later", async () => {
    const repo = await gitRepo();
    await runCli(["init", "--agents", "claude"], { cwd: repo.root });
    await writeRepoFiles(repo.root, {
      ".claude/skills/later/SKILL.md": skill("later"),
    });

    const result = await runCli(["init", "--agents", "claude", "--adopt"], { cwd: repo.root });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Moved .claude/skills/later -> .factory/skills/later");
    expect(await readFile(repo.path(".factory", "skills", "later", "SKILL.md"), "utf8")).toBe(
      skill("later"),
    );
    expect(await pathExists(repo.path(".claude", "skills", "later", "SKILL.md"))).toBe(true);
  });

  test("generated skill directories are not adoption candidates", async () => {
    const repo = await gitRepo();
    await runCli(["init", "--agents", "claude"], { cwd: repo.root });

    const result = await runCli(["init", "--agents", "claude", "--json"], { cwd: repo.root });

    expect(result.code).toBe(0);
    const payload = parseJson(result);
    expect(payload.moved).toEqual([]);
    expect(payload.created).toEqual([]);
    expect(payload.updated).toEqual([]);
    expect(payload.gitattributes).toEqual([]);
    expect(payload.changed).toEqual([]);
    expect(payload.declined).toBe(false);
  });

  test("reports a declined adoption as declined in JSON", async () => {
    const repo = await gitRepo({
      ".claude/skills/release/SKILL.md": skill("release"),
    });

    const result = await runCli(["init", "--agents", "claude", "--json"], {
      cwd: repo.root,
      tty: true,
      stdin: Readable.from(["n\n"]),
    });

    expect(result.code).toBe(0);
    const payload = parseJson(result);
    expect(payload.declined).toBe(true);
    expect(payload.moved).toEqual([]);
    expect(await pathExists(repo.path(".factory"))).toBe(false);
  });

  test("keeps an existing factory and adds only missing entries", async () => {
    const repo = await gitRepo({
      ".factory/factory.yaml": "format: 1\nname: custom\n",
    });

    const result = await runCli(["init", "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(0);
    expect(await readFile(repo.path(".factory", "factory.yaml"), "utf8")).toBe(
      "format: 1\nname: custom\n",
    );
    expect(await pathExists(repo.path(".factory", "AGENTS.md"))).toBe(true);
    expect(await pathExists(repo.path(".factory", "metafab.yaml"))).toBe(true);
  });

  test("blocks a skill whose frontmatter name differs from its directory before moving it", async () => {
    const repo = await gitRepo({
      ".claude/skills/wrong-name/SKILL.md":
        "---\nname: bar\ndescription: Use bar when the task needs it.\n---\n\n# bar\n",
    });
    const before = await snapshot(repo.root);

    const result = await runCli(["init", "--agents", "claude", "--adopt"], { cwd: repo.root });

    expect(result.code).toBe(5);
    expect(result.stderr).toContain(
      'Skill name "bar" does not match its directory "wrong-name"',
    );
    expect(await snapshot(repo.root)).toEqual(before);
    expect(await pathExists(repo.path(".factory"))).toBe(false);
    expect(await pathExists(repo.path(".claude", "skills", "wrong-name", "SKILL.md"))).toBe(true);
  });

  test("blocks a skill without a description before moving it", async () => {
    const repo = await gitRepo({
      ".claude/skills/release/SKILL.md": "---\nname: release\n---\n\n# release\n",
    });
    const before = await snapshot(repo.root);

    const result = await runCli(["init", "--agents", "claude", "--adopt"], { cwd: repo.root });

    expect(result.code).toBe(5);
    expect(result.stderr).toContain('SKILL.md is missing a "description" field');
    expect(await snapshot(repo.root)).toEqual(before);
    expect(await pathExists(repo.path(".factory"))).toBe(false);
  });

  test("blocks a skill with a symlink outside the skill before moving it", async () => {
    const repo = await gitRepo({
      ".claude/skills/release/SKILL.md": skill("release"),
      "README.md": "# Repository\n",
    });
    await symlink("../../../README.md", repo.path(".claude", "skills", "release", "link"));
    const before = await snapshot(repo.root);

    const result = await runCli(["init", "--agents", "claude", "--adopt"], { cwd: repo.root });

    expect(result.code).toBe(5);
    expect(result.stderr).toContain("points outside the skill directory");
    expect(await snapshot(repo.root)).toEqual(before);
    expect(await pathExists(repo.path(".factory"))).toBe(false);
    expect(await pathExists(repo.path(".claude", "skills", "release", "SKILL.md"))).toBe(true);
  });

  test("blocks a symlink loop before moving the skill", async () => {
    const repo = await gitRepo({
      ".claude/skills/release/SKILL.md": skill("release"),
    });
    await symlink(".", repo.path(".claude", "skills", "release", "loop"));
    const before = await snapshot(repo.root);

    const result = await runCli(["init", "--agents", "claude", "--adopt"], { cwd: repo.root });

    expect(result.code).toBe(5);
    expect(result.stderr).toContain("creates a loop");
    expect(await snapshot(repo.root)).toEqual(before);
    expect(await pathExists(repo.path(".factory"))).toBe(false);
    expect(await pathExists(repo.path(".claude", "skills", "release", "loop"))).toBe(true);
  });

  test("blocks a symlink that resolves through a symlinked directory into .factory", async () => {
    const repo = await gitRepo({
      ".claude/skills/release/SKILL.md": skill("release"),
      "outside/notes.md": "outside notes\n",
    });
    await mkdir(repo.path(".factory"), { recursive: true });
    await symlink("../outside", repo.path(".factory", "shared"), "dir");
    await symlink(
      "../../../.factory/shared/notes.md",
      repo.path(".claude", "skills", "release", "notes-link.md"),
    );
    const before = await snapshot(repo.root);

    const result = await runCli(["init", "--agents", "claude", "--adopt"], { cwd: repo.root });

    expect(result.code).toBe(5);
    expect(result.stderr).toContain("points outside the skill directory");
    expect(await snapshot(repo.root)).toEqual(before);
    expect(await pathExists(repo.path(".claude", "skills", "release", "SKILL.md"))).toBe(true);
  });

  test.skipIf(process.platform === "win32")(
    "blocks an unreadable supporting file before moving the skill",
    async () => {
      const repo = await gitRepo({
        ".claude/skills/release/SKILL.md": skill("release"),
        ".claude/skills/release/notes.md": "notes\n",
      });
      await chmod(repo.path(".claude", "skills", "release", "notes.md"), 0o000);

      const result = await runCli(["init", "--agents", "claude", "--adopt"], { cwd: repo.root });

      expect(result.code).toBe(5);
      expect(result.stderr).toContain("Cannot read file .claude/skills/release/notes.md");
      expect(await pathExists(repo.path(".factory"))).toBe(false);
      expect(await pathExists(repo.path(".gitattributes"))).toBe(false);
      expect(await pathExists(repo.path(".claude", "skills", "release", "notes.md"))).toBe(true);
    },
  );

  test("creates missing entries despite an unrelated factory validation error", async () => {
    const repo = await gitRepo({
      ".factory/factory.yaml": "format: 1\nname: demo\n",
      ".factory/skills/foo/SKILL.md": "---\nname: foo\n---\n\n# foo\n",
    });

    const result = await runCli(["init", "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('SKILL.md is missing a "description" field');
    expect(await readFile(repo.path(".factory", "AGENTS.md"), "utf8")).toBe("");
    expect(await readFile(repo.path(".factory", "metafab.yaml"), "utf8")).toBe("agents: [claude]\n");
  });

  test("reports a metafab.yaml symlink loop as a problem instead of crashing", async () => {
    const repo = await gitRepo({ ".factory/factory.yaml": "format: 1\nname: demo\n" });
    await symlink("metafab.yaml", repo.path(".factory", "metafab.yaml"));

    const result = await runCli(["init", "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Cannot read file .factory/metafab.yaml");
    expect(result.stderr).not.toContain("ELOOP");
    expect(result.stderr).not.toMatch(/\n\s+at /u);
  });

  test("a second run after adoption changes nothing and reports Already initialised", async () => {
    const repo = await gitRepo({
      ".claude/skills/release/SKILL.md": skill("release"),
      ".claude/skills/release/notes.md": "notes\n",
      ".claude/skills/release/scripts/run.sh": "#!/bin/sh\necho release\n",
    });
    await symlink("notes.md", repo.path(".claude", "skills", "release", "notes-link.md"));

    const first = await runCli(["init", "--agents", "claude", "--adopt"], { cwd: repo.root });
    expect(first.code).toBe(0);
    const before = await snapshot(repo.root);

    const second = await runCli(["init", "--agents", "claude", "--adopt"], { cwd: repo.root });

    expect(second.code).toBe(0);
    expect(second.stdout).toBe("Already initialised\n");
    expect(await snapshot(repo.root)).toEqual(before);
    expect(await pathExists(repo.path(".factory", "skills", "release", "notes-link.md"))).toBe(true);
  });

  test("refuses a symlinked .claude before creating anything", async () => {
    const repo = await gitRepo({
      "shared/skills/release/SKILL.md": skill("release"),
    });
    await symlink("shared", repo.path(".claude"), "dir");

    const result = await runCli(["init", "--agents", "claude", "--adopt"], { cwd: repo.root });

    expect(result.code).toBe(5);
    expect(result.stderr).toContain(".claude is a symbolic link, not a directory");
    expect(await pathExists(repo.path(".factory"))).toBe(false);
    expect(await pathExists(repo.path(".gitattributes"))).toBe(false);
    expect(await pathExists(repo.path("shared", "skills", "release", "SKILL.md"))).toBe(true);
  });

  test("reports a .factory file as a problem instead of crashing", async () => {
    const repo = await gitRepo({ ".factory": "not a directory\n" });

    const result = await runCli(["init", "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain(".factory is a file, not a directory");
    expect(result.stderr).not.toContain("ENOTDIR");
    expect(result.stderr).not.toMatch(/\n\s+at /u);
    expect(await readFile(repo.path(".factory"), "utf8")).toBe("not a directory\n");
  });

  test("reports an unreadable metafab.yaml as a problem instead of crashing", async () => {
    const repo = await gitRepo({
      ".factory/factory.yaml": "format: 1\nname: demo\n",
      ".factory/metafab.yaml/keep.txt": "",
    });

    const result = await runCli(["init", "--agents", "claude"], { cwd: repo.root });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Cannot read file .factory/metafab.yaml");
    expect(result.stderr).not.toMatch(/\n\s+at /u);
  });

  test("refuses a symlinked .factory/skills and moves nothing", async () => {
    const repo = await gitRepo({
      ".factory/factory.yaml": "format: 1\nname: demo\n",
      ".claude/skills/release/SKILL.md": skill("release"),
    });
    await mkdir(repo.path("outside"), { recursive: true });
    await symlink("../outside", repo.path(".factory", "skills"), "dir");

    const result = await runCli(["init", "--agents", "claude", "--adopt"], { cwd: repo.root });

    expect(result.code).toBe(5);
    expect(result.stderr).toContain(".factory/skills is a symbolic link, not a directory");
    expect(await pathExists(repo.path("outside", "release"))).toBe(false);
    expect(await pathExists(repo.path(".claude", "skills", "release", "SKILL.md"))).toBe(true);
    expect(await pathExists(repo.path(".gitattributes"))).toBe(false);
  });
});
