import { lstat, mkdir, readFile, rm, stat, symlink } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { MetafabError } from "../../../src/errors.js";
import { exclusionMatcher, prepareFab, stageFab } from "../../../src/core/publish/index.js";
import type { PublishTargetName, StagedFab } from "../../../src/core/publish/index.js";
import { listFiles } from "../../../src/util/fs.js";
import { loadRepo, makePublishRepo } from "./fixtures.js";
import type { PublishRepoOptions } from "./fixtures.js";
import type { TempRepo } from "../../helpers/makeRepo.js";

const repos: TempRepo[] = [];
const staged: StagedFab[] = [];

afterEach(async () => {
  await Promise.all(staged.splice(0).map((fab) => fab.cleanup()));
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

async function repo(options: PublishRepoOptions = {}): Promise<TempRepo> {
  const created = await makePublishRepo(options);
  repos.push(created);
  return created;
}

async function stage(
  options: PublishRepoOptions = {},
  exclude: string[] = [],
  targets: PublishTargetName[] = ["npm", "git"],
): Promise<{ target: TempRepo; fab: StagedFab; files: string[] }> {
  const target = await repo(options);
  const { factory } = await loadRepo(target);
  const fab = await stageFab(factory, { exclude, targets });
  staged.push(fab);
  return { target, fab, files: await listFiles(fab.root) };
}

const EXTRA_WORKFLOW = {
  ".factory/workflows/extra/SKILL.md":
    "---\nname: extra\ndescription: Extra. Use when testing.\n---\n\n# Extra\n",
};

describe("exclusionMatcher", () => {
  test("matches a file and every path below an excluded directory", () => {
    const matches = exclusionMatcher(["skills/our-api/**", "workflows/old"]);

    expect(matches("skills/our-api/SKILL.md")).toBe(true);
    expect(matches("skills/our-api-other/SKILL.md")).toBe(false);
    expect(matches("workflows/old")).toBe(true);
    expect(matches("workflows/old/SKILL.md")).toBe(true);
  });

  test("matches dot files when the glob asks for them", () => {
    const matches = exclusionMatcher(["skills/git/.*"]);

    expect(matches("skills/git/.notes")).toBe(true);
    expect(matches("skills/git/SKILL.md")).toBe(false);
  });
});

describe("stageFab", () => {
  test("never stages metafab.yaml or the factory README", async () => {
    const { files } = await stage({
      files: { ".factory/skills/git/README.md": "# A README inside a skill\n" },
    });

    expect(files).not.toContain(".factory/metafab.yaml");
    expect(files).not.toContain(".factory/README.md");
    expect(files).toContain(".factory/skills/git/README.md");
    expect(files).toContain(".factory/AGENTS.md");
  });

  test.skipIf(process.platform === "win32")("keeps file modes", async () => {
    const { fab } = await stage();

    const info = await stat(fab.factoryDir + "/scripts/release.sh");
    expect(info.mode & 0o777).toBe(0o755);
  });

  test("leaves out publish.exclude globs, including dot files", async () => {
    const { files } = await stage(
      {
        files: {
          ".factory/skills/git/.notes": "private notes\n",
          ...EXTRA_WORKFLOW,
        },
      },
      ["skills/git", "workflows/extra/**"],
    );

    expect(files).toContain(".factory/workflows/plan/SKILL.md");
    expect(files).not.toContain(".factory/skills/git/SKILL.md");
    expect(files).not.toContain(".factory/skills/git/.notes");
    expect(files).not.toContain(".factory/workflows/extra/SKILL.md");
  });

  test("a Git-only publish keeps the names npm never packs", async () => {
    const { fab, files } = await stage(
      { files: { ".factory/skills/git/.gitignore": "*.log\n" } },
      [],
      ["git"],
    );

    expect(files).toContain(".factory/skills/git/.gitignore");
    expect(fab.warnings).toEqual([]);
  });

  test("an npm publish leaves out the names npm never packs and warns for each", async () => {
    const { fab, files } = await stage(
      {
        files: {
          ".factory/skills/git/.gitignore": "*.log\n",
          ".factory/skills/git/.npmrc": "//registry.example/\n",
          ".factory/templates/repo/.git/config": "[core]\n",
        },
      },
      [],
      ["npm"],
    );

    expect(files).not.toContain(".factory/skills/git/.gitignore");
    expect(files).not.toContain(".factory/skills/git/.npmrc");
    expect(files).not.toContain(".factory/templates/repo/.git/config");
    expect(fab.warnings).toEqual([
      {
        level: "warning",
        file: ".factory/skills/git/.gitignore",
        line: 1,
        message: "npm never packs .factory/skills/git/.gitignore, so it is left out of the fab",
        fix: "Rename the path or remove it from .factory/; the name cannot be published",
      },
      {
        level: "warning",
        file: ".factory/skills/git/.npmrc",
        line: 1,
        message: "npm never packs .factory/skills/git/.npmrc, so it is left out of the fab",
        fix: "Rename the path or remove it from .factory/; the name cannot be published",
      },
      {
        level: "warning",
        file: ".factory/templates/repo/.git",
        line: 1,
        message: "npm never packs .factory/templates/repo/.git, so it is left out of the fab",
        fix: "Rename the path or remove it from .factory/; the name cannot be published",
      },
    ]);
  });

  test("fails when publish.exclude removes a required template", async () => {
    const target = await repo({
      files: {
        ".factory/factory.yaml": [
          "format: 1",
          "name: demo",
          "requires:",
          "  - path: opencode.json",
          "    description: Defines the agent-coding sub-agent",
          "    template: .factory/templates/setup/opencode.json",
          "",
        ].join("\n"),
        ".factory/templates/setup/opencode.json": "{}\n",
      },
    });
    const { factory } = await loadRepo(target);

    const error = (await stageFab(factory, { exclude: ["templates/setup/**"] }).catch(
      (failure: unknown) => failure,
    )) as MetafabError;

    expect(error).toBeInstanceOf(MetafabError);
    expect(error.code).toBe("publish-invalid-fab");
    expect(error.exitCode).toBe(4);
    expect(error.problems?.map((problem) => problem.message)).toContain(
      'Template ".factory/templates/setup/opencode.json" does not exist',
    );
  });

  test("fails when an excluded workflow is still in the pipeline", async () => {
    const target = await repo();
    const { factory } = await loadRepo(target);

    const error = (await stageFab(factory, { exclude: ["workflows/build/**"] }).catch(
      (failure: unknown) => failure,
    )) as MetafabError;

    expect(error).toBeInstanceOf(MetafabError);
    expect(error.code).toBe("publish-excluded-workflow");
    expect(error.exitCode).toBe(1);
    expect(error.problems).toEqual([
      {
        level: "error",
        file: ".factory/factory.yaml",
        line: 6,
        message: 'Pipeline names excluded workflow "build"',
        fix: 'Remove "workflows/build" from publish.exclude or the workflow from the pipeline',
      },
    ]);
  });

  test("an excluded workflow outside the pipeline is allowed", async () => {
    const { files } = await stage({ files: EXTRA_WORKFLOW }, ["workflows/extra/**"]);

    expect(files).not.toContain(".factory/workflows/extra/SKILL.md");
    expect(files).toContain(".factory/workflows/plan/SKILL.md");
  });

  test("fails when publish.exclude would leave .factory/ empty", async () => {
    const target = await repo({
      files: { ".factory/factory.yaml": "format: 1\nname: demo\n" },
    });
    const { factory } = await loadRepo(target);

    const error = (await stageFab(factory, { exclude: ["*"] }).catch(
      (failure: unknown) => failure,
    )) as MetafabError;

    expect(error).toBeInstanceOf(MetafabError);
    expect(error.code).toBe("publish-invalid-fab");
    expect(error.exitCode).toBe(4);
    expect(error.problems?.map((problem) => problem.file)).toContain(".factory");
  });

  test("refuses publish.exclude that names every pipeline workflow", async () => {
    const target = await repo();
    const { factory } = await loadRepo(target);

    const error = (await stageFab(factory, { exclude: ["*"] }).catch(
      (failure: unknown) => failure,
    )) as MetafabError;

    expect(error.code).toBe("publish-excluded-workflow");
    expect(error.problems?.map((problem) => problem.message)).toContain(
      'Pipeline names excluded workflow "plan"',
    );
  });

  test("fails on a file larger than a fab allows, naming it", async () => {
    const target = await repo({
      files: { ".factory/scripts/big.bin": new Uint8Array(1024 * 1024 + 1) },
    });
    const { factory } = await loadRepo(target);

    const error = (await stageFab(factory).catch((failure: unknown) => failure)) as MetafabError;

    expect(error).toBeInstanceOf(MetafabError);
    expect(error.code).toBe("publish-invalid-fab");
    expect(error.exitCode).toBe(4);
    expect(error.problems?.map((problem) => problem.file)).toContain(".factory/scripts/big.bin");
    expect(error.problems?.[0]?.message).toContain("1048576");
  });

  test("never stages a link named README.md at the factory root", async () => {
    const target = await repo();
    await rm(target.path(".factory", "README.md"));
    await symlink(path.join("skills", "git", "SKILL.md"), target.path(".factory", "README.md"));

    const { factory } = await loadRepo(target);
    const fab = await stageFab(factory);
    staged.push(fab);
    const files = await listFiles(fab.root);

    expect(files).not.toContain(".factory/README.md");
    expect(files).toContain(".factory/skills/git/SKILL.md");
  });

  test("reads a README link that points outside .factory/ as the fab README", async () => {
    const target = await repo({ files: { "fab-readme.md": "# Fab readme\n" } });
    await rm(target.path(".factory", "README.md"));
    await symlink(path.join("..", "fab-readme.md"), target.path(".factory", "README.md"));

    const { factory, config } = await loadRepo(target);
    const fab = await prepareFab(factory, config);
    staged.push(fab);

    expect(await listFiles(fab.root)).not.toContain(".factory/README.md");
    expect(await readFile(path.join(fab.root, "README.md"), "utf8")).toBe("# Fab readme\n");
  });

  test("copies a link inside .factory/ as its target's content", async () => {
    const target = await repo();
    await symlink(
      path.join("..", "..", "AGENTS.md"),
      target.path(".factory", "skills", "git", "AGENTS.md"),
    );

    const { factory } = await loadRepo(target);
    const fab = await stageFab(factory);
    staged.push(fab);
    const files = await listFiles(fab.root);
    const copied = path.join(fab.factoryDir, "skills", "git", "AGENTS.md");

    expect(files).toContain(".factory/skills/git/AGENTS.md");
    expect((await lstat(copied)).isSymbolicLink()).toBe(false);
    expect(await readFile(copied, "utf8")).toBe("# Agents\n");
  });

  test("copies a directory link inside .factory/ as its target's content", async () => {
    const target = await repo();
    await mkdir(target.path(".factory", "templates"), { recursive: true });
    await symlink(path.join("..", "scripts"), target.path(".factory", "templates", "scripts"), "dir");

    const { factory } = await loadRepo(target);
    const fab = await stageFab(factory);
    staged.push(fab);

    expect(await listFiles(fab.root)).toContain(".factory/templates/scripts/release.sh");
  });

  test("fails on a link that points outside .factory/, naming it", async () => {
    const target = await repo({ files: { "outside.md": "# Outside\n" } });
    await symlink(
      path.join("..", "..", "..", "outside.md"),
      target.path(".factory", "skills", "git", "outside.md"),
    );
    const { factory } = await loadRepo(target);

    const error = (await stageFab(factory).catch((failure: unknown) => failure)) as MetafabError;

    expect(error).toBeInstanceOf(MetafabError);
    expect(error.code).toBe("publish-invalid-fab");
    expect(error.exitCode).toBe(4);
    expect(error.problems?.map((problem) => problem.file)).toContain(
      ".factory/skills/git/outside.md",
    );
    expect(error.problems?.[0]?.message).toContain("points outside .factory/");
  });

  test("fails on a broken link, naming it", async () => {
    const target = await repo();
    await symlink(
      path.join("missing.md"),
      target.path(".factory", "skills", "git", "missing.md"),
    );
    const { factory } = await loadRepo(target);

    const error = (await stageFab(factory).catch((failure: unknown) => failure)) as MetafabError;

    expect(error.code).toBe("publish-invalid-fab");
    expect(error.problems?.[0]?.message).toContain("Symlink .factory/skills/git/missing.md is broken");
  });

  test("fails on an escaping link named .gitignore when npm is a target", async () => {
    const target = await repo({ files: { ".gitignore": "*.log\n" } });
    await symlink(path.join("..", "..", "..", ".gitignore"), target.path(".factory", "skills", "git", ".gitignore"));
    const { factory } = await loadRepo(target);

    const error = (await stageFab(factory, { targets: ["npm"] }).catch(
      (failure: unknown) => failure,
    )) as MetafabError;

    expect(error).toBeInstanceOf(MetafabError);
    expect(error.code).toBe("publish-invalid-fab");
    expect(error.exitCode).toBe(4);
    expect(error.problems?.map((problem) => problem.file)).toContain(
      ".factory/skills/git/.gitignore",
    );
    expect(error.problems?.[0]?.message).toContain("points outside .factory/");
  });

  test("fails on a broken link named .DS_Store when npm is a target", async () => {
    const target = await repo();
    await symlink(
      path.join("missing"),
      target.path(".factory", "skills", "git", ".DS_Store"),
    );
    const { factory } = await loadRepo(target);

    const error = (await stageFab(factory, { targets: ["npm"] }).catch(
      (failure: unknown) => failure,
    )) as MetafabError;

    expect(error.code).toBe("publish-invalid-fab");
    expect(error.problems?.[0]?.message).toContain(
      "Symlink .factory/skills/git/.DS_Store is broken",
    );
  });

  test("drops a valid link named .gitignore with a warning when npm is a target", async () => {
    const target = await repo();
    await symlink(
      path.join("SKILL.md"),
      target.path(".factory", "skills", "git", ".gitignore"),
    );
    const { factory } = await loadRepo(target);

    const fab = await stageFab(factory, { targets: ["npm", "git"] });
    staged.push(fab);

    expect(await listFiles(fab.root)).not.toContain(".factory/skills/git/.gitignore");
    expect(fab.warnings.map((warning) => warning.file)).toEqual([
      ".factory/skills/git/.gitignore",
    ]);
  });

  test("a Git-only publish refuses a path with a .git component", async () => {
    const target = await repo({
      files: { ".factory/templates/repo/.git/config": "[core]\n" },
    });
    const { factory } = await loadRepo(target);

    const error = (await stageFab(factory, { targets: ["git"] }).catch(
      (failure: unknown) => failure,
    )) as MetafabError;

    expect(error).toBeInstanceOf(MetafabError);
    expect(error.code).toBe("publish-invalid-fab");
    expect(error.exitCode).toBe(4);
    expect(error.problems?.map((problem) => problem.file)).toContain(
      ".factory/templates/repo/.git",
    );
    expect(error.problems?.[0]?.message).toContain(
      "Git cannot store .factory/templates/repo/.git",
    );
  });

  test("refuses every name Git reads as .git when Git is a target", async () => {
    for (const name of [".GIT", "git~1", "GIT~1"]) {
      const target = await repo({
        files: { [`.factory/templates/repo/${name}/config`]: "[core]\n" },
      });
      const { factory } = await loadRepo(target);

      const error = (await stageFab(factory, { targets: ["npm", "git"] }).catch(
        (failure: unknown) => failure,
      )) as MetafabError;

      expect(error, name).toBeInstanceOf(MetafabError);
      expect(error.code, name).toBe("publish-invalid-fab");
      expect(error.exitCode, name).toBe(4);
      expect(error.problems?.map((problem) => problem.file), name).toContain(
        `.factory/templates/repo/${name}`,
      );
    }
  });

  test.skipIf(process.platform === "win32")(
    "refuses a .git name with the trailing spaces and dots NTFS and HFS ignore",
    async () => {
      for (const name of [".git.", ".git "]) {
        const target = await repo({
          files: { [`.factory/templates/repo/${name}/config`]: "[core]\n" },
        });
        const { factory } = await loadRepo(target);

        const error = (await stageFab(factory, { targets: ["git"] }).catch(
          (failure: unknown) => failure,
        )) as MetafabError;

        expect(error, name).toBeInstanceOf(MetafabError);
        expect(error.exitCode, name).toBe(4);
        expect(error.problems?.map((problem) => problem.file), name).toContain(
          `.factory/templates/repo/${name}`,
        );
      }
    },
  );

  test.skipIf(process.platform === "win32")(
    "refuses the .git names HFS+ and NTFS fold into .git",
    async () => {
      // A zero-width non-joiner is not part of the name on HFS+, and NTFS drops
      // everything from a `:` stream suffix; Git reads both as `.git`.
      for (const name of [".g\u200cit", ".git\u200c", ".git:$DATA"]) {
        const target = await repo({
          files: { [`.factory/templates/repo/${name}/config`]: "[core]\n" },
        });
        const { factory } = await loadRepo(target);

        const error = (await stageFab(factory, { targets: ["git"] }).catch(
          (failure: unknown) => failure,
        )) as MetafabError;

        expect(error, name).toBeInstanceOf(MetafabError);
        expect(error.code, name).toBe("publish-invalid-fab");
        expect(error.exitCode, name).toBe(4);
        expect(error.problems?.map((problem) => problem.file), name).toContain(
          `.factory/templates/repo/${name}`,
        );
      }
    },
  );

  test("an npm-only publish leaves out every case of .git with a warning", async () => {
    for (const name of [".git", ".GIT"]) {
      const target = await repo({
        files: { [`.factory/templates/repo/${name}/config`]: "[core]\n" },
      });
      const { factory } = await loadRepo(target);

      const fab = await stageFab(factory, { targets: ["npm"] });
      staged.push(fab);

      expect(await listFiles(fab.root), name).not.toContain(
        `.factory/templates/repo/${name}/config`,
      );
      expect(fab.warnings.map((warning) => warning.file), name).toEqual([
        `.factory/templates/repo/${name}`,
      ]);
    }
  });

  test("an npm-only publish refuses a name Git reads as .git that npm would pack", async () => {
    const target = await repo({
      files: { ".factory/templates/repo/git~1/config": "[core]\n" },
    });
    const { factory } = await loadRepo(target);

    const error = (await stageFab(factory, { targets: ["npm"] }).catch(
      (failure: unknown) => failure,
    )) as MetafabError;

    expect(error).toBeInstanceOf(MetafabError);
    expect(error.code).toBe("publish-invalid-fab");
    expect(error.exitCode).toBe(4);
    expect(error.problems?.map((problem) => problem.file)).toContain(
      ".factory/templates/repo/git~1",
    );
  });

  test.skipIf(process.platform === "win32")(
    "an npm-only publish refuses the .git names HFS+ and NTFS fold into .git",
    async () => {
      // npm's own rule drops only the case spellings of `.git` itself, so a
      // name it would pack that Git still reads as `.git` stops the publish.
      for (const name of [".g\u200cit", ".git:$DATA"]) {
        const target = await repo({
          files: { [`.factory/templates/repo/${name}/config`]: "[core]\n" },
        });
        const { factory } = await loadRepo(target);

        const error = (await stageFab(factory, { targets: ["npm"] }).catch(
          (failure: unknown) => failure,
        )) as MetafabError;

        expect(error, name).toBeInstanceOf(MetafabError);
        expect(error.code, name).toBe("publish-invalid-fab");
        expect(error.exitCode, name).toBe(4);
        expect(error.problems?.map((problem) => problem.file), name).toContain(
          `.factory/templates/repo/${name}`,
        );
      }
    },
  );

  test("a publish to both targets refuses a .git path instead of warning", async () => {
    const target = await repo({
      files: { ".factory/templates/repo/.git/config": "[core]\n" },
    });
    const { factory } = await loadRepo(target);

    const error = (await stageFab(factory, { targets: ["npm", "git"] }).catch(
      (failure: unknown) => failure,
    )) as MetafabError;

    expect(error).toBeInstanceOf(MetafabError);
    expect(error.exitCode).toBe(4);
    expect(error.problems?.map((problem) => problem.file)).toContain(
      ".factory/templates/repo/.git",
    );
  });
});
