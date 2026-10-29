import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, describe, expect, test } from "vitest";
import { applyBuild, planBuild } from "../../../src/core/build/index.js";
import { runCheck } from "../../../src/core/check/index.js";
import { loadConfig } from "../../../src/core/config/load.js";
import { loadFactory } from "../../../src/core/factory/index.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";

const require = createRequire(import.meta.url);
const PACKAGE_VERSION = (require("../../../package.json") as { version: string }).version;

const DEMO_SKILL =
  "---\nname: demo\ndescription: Demo. Use when testing.\n---\n\n# Demo\n";

const repos: TempRepo[] = [];

function track(repo: TempRepo): TempRepo {
  repos.push(repo);
  return repo;
}

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

function checkRepo(files: RepoFiles = {}): Promise<TempRepo> {
  return makeRepo({
    ".factory/factory.yaml": "format: 1\nname: demo\n",
    ".factory/metafab.yaml": "agents: [codex]\nmetafab-skill: false\n",
    ".factory/skills/demo/SKILL.md": DEMO_SKILL,
    ...files,
  }).then(track);
}

async function build(root: string, cliVersion = PACKAGE_VERSION): Promise<void> {
  const factory = await loadFactory(root);
  const config = await loadConfig(factory.dir);
  await applyBuild(await planBuild(factory, config, cliVersion));
}

describe("runCheck", () => {
  test("a valid built fixture has no problems", async () => {
    const target = await checkRepo({
      ".factory/metafab.yaml": "agents: [claude, codex]\n",
    });

    await build(target.root);

    expect(await runCheck(target.root, PACKAGE_VERSION)).toEqual([]);
  });

  test("a fresh clone reports one missing-skills problem per destination", async () => {
    const target = await checkRepo({
      ".factory/metafab.yaml": "agents: [claude, codex]\nmetafab-skill: false\n",
      ".factory/skills/alpha/SKILL.md":
        "---\nname: alpha\ndescription: Alpha. Use when testing.\n---\n\n# Alpha\n",
    });
    await build(target.root);
    await rm(target.path(".claude"), { recursive: true, force: true });
    await rm(target.path(".agents"), { recursive: true, force: true });

    const problems = await runCheck(target.root, PACKAGE_VERSION);

    expect(problems).toHaveLength(2);
    expect(problems.map((problem) => problem.file).sort()).toEqual([
      ".agents/skills",
      ".claude/skills",
    ]);
    for (const problem of problems) {
      expect(problem.level).toBe("error");
      expect(problem.message).toContain("missing from");
      expect(problem.fix).toBe("Run metafab build");
    }
  });

  test("a hand edit points at the source", async () => {
    const target = await checkRepo({
      ".factory/metafab.yaml": "agents: [claude, codex]\nmetafab-skill: false\n",
    });
    await build(target.root);
    const installed = target.path(".claude", "skills", "demo", "SKILL.md");
    await writeFile(installed, `${await readFile(installed, "utf8")}\nHand edit.\n`);

    const problems = await runCheck(target.root, PACKAGE_VERSION);

    expect(problems).toEqual([
      {
        level: "error",
        file: ".claude/skills/demo/SKILL.md",
        line: 1,
        message: ".claude/skills/demo/SKILL.md differs from the build output",
        fix: "Edit .factory/skills/demo/ instead, then run metafab build",
      },
    ]);
  });

  test("a conflict marker is reported with its path and line", async () => {
    const target = await checkRepo();
    await build(target.root);
    await writeFile(
      target.path(".factory", "notes.md"),
      "# Notes\n\n<<<<<<< HEAD\nleft\n=======\nright\n>>>>>>> branch\n",
    );

    const problems = await runCheck(target.root, PACKAGE_VERSION);

    expect(problems).toEqual([
      {
        level: "error",
        file: ".factory/notes.md",
        line: 3,
        message: "Unresolved conflict marker",
        fix: "Resolve the conflict, then run metafab build",
      },
    ]);
  });

  test("a .upstream file is reported with its path and line", async () => {
    const target = await checkRepo();
    await build(target.root);
    await writeFile(target.path(".factory", "notes.md.upstream"), "theirs\n");

    const problems = await runCheck(target.root, PACKAGE_VERSION);

    expect(problems).toEqual([
      {
        level: "error",
        file: ".factory/notes.md.upstream",
        line: 1,
        message: "Unresolved .upstream conflict file",
        fix: "Merge or delete the file, then run metafab build",
      },
    ]);
  });

  test("an AGENTS.md block over 300 lines is a warning only", async () => {
    const target = await checkRepo({
      ".factory/AGENTS.md": Array.from({ length: 301 }, (_, index) => `Line ${index + 1}`).join(
        "\n",
      ),
    });
    await build(target.root);

    const problems = await runCheck(target.root, PACKAGE_VERSION);

    expect(problems).toHaveLength(1);
    expect(problems[0]?.level).toBe("warning");
    expect(problems[0]?.file).toBe("AGENTS.md");
    expect(problems[0]?.message).toContain("limit is 300");
  });

  test("an owned skill without a source is reported", async () => {
    const target = await checkRepo();
    await build(target.root);
    await rm(target.path(".factory", "skills", "demo"), { recursive: true, force: true });

    const problems = await runCheck(target.root, PACKAGE_VERSION);

    expect(problems).toEqual([
      {
        level: "error",
        file: ".agents/skills/demo",
        line: 1,
        message: ".agents/skills/demo has no source in .factory/",
        fix: "Run metafab build",
      },
    ]);
  });

  test("a removal in a deselected destination names the agent tool", async () => {
    const target = await checkRepo({
      ".factory/metafab.yaml": "agents: [claude, codex]\nmetafab-skill: false\n",
    });
    await build(target.root);
    await writeFile(
      target.path(".factory", "metafab.yaml"),
      "agents: [claude]\nmetafab-skill: false\n",
    );

    const problems = await runCheck(target.root, PACKAGE_VERSION);

    expect(problems).toContainEqual({
      level: "error",
      file: ".agents/skills/demo",
      line: 1,
      message: ".agents/skills/demo is installed for an agent tool that is no longer configured",
      fix: "Run metafab build",
    });
    expect(problems.some((problem) => problem.message.includes("has no source"))).toBe(false);
  });

  test("a removal in the other deselected destination is named too", async () => {
    const target = await checkRepo({
      ".factory/metafab.yaml": "agents: [claude, codex]\nmetafab-skill: false\n",
    });
    await build(target.root);
    await writeFile(
      target.path(".factory", "metafab.yaml"),
      "agents: [codex]\nmetafab-skill: false\n",
    );

    const problems = await runCheck(target.root, PACKAGE_VERSION);

    expect(problems).toContainEqual({
      level: "error",
      file: ".claude/skills/demo",
      line: 1,
      message: ".claude/skills/demo is installed for an agent tool that is no longer configured",
      fix: "Run metafab build",
    });
    expect(problems.some((problem) => problem.message.includes("has no source"))).toBe(false);
  });

  test("the build-output warning says how to continue", async () => {
    const target = await checkRepo({ ".factory/metafab.yaml": "agents: [nope]\n" });

    const problems = await runCheck(target.root, PACKAGE_VERSION);

    expect(problems).toContainEqual({
      level: "warning",
      file: ".factory",
      line: 1,
      message: "Build output not checked: fix the errors above first",
      fix: "Fix the errors above, then run metafab check again",
    });
  });

  test("an unowned directory in the way is reported as build reports it", async () => {
    const target = await checkRepo();
    await build(target.root);
    await mkdir(target.path(".agents", "skills", "mine"), { recursive: true });
    await writeFile(target.path(".agents", "skills", "mine", "SKILL.md"), "user content\n");

    const problems = await runCheck(target.root, PACKAGE_VERSION);

    expect(problems).toHaveLength(1);
    expect(problems[0]?.file).toBe(".agents/skills/mine");
    expect(problems[0]?.message).toBe("Unowned directory .agents/skills/mine is in the way");
    expect(problems[0]?.fix).toBe("Move it into .factory/skills/ or rename it");
  });

  test("a built-in skill from another CLI version is reported", async () => {
    const target = await checkRepo({ ".factory/metafab.yaml": "agents: [codex]\n" });
    await build(target.root);

    const problems = await runCheck(target.root, "9.9.9");

    expect(problems).toEqual([
      {
        level: "error",
        file: ".agents/skills/metafab",
        line: 1,
        message: `The installed metafab skill is from ${PACKAGE_VERSION}; this CLI is 9.9.9`,
        fix: "Run metafab build",
      },
    ]);
  });

  describe.skipIf(process.platform === "win32")("installed file modes", () => {
    test.each([
      ["0666", 0o666],
      ["0444", 0o444],
    ])("an installed file with mode %s is reported", async (display, mode) => {
      const target = await checkRepo();
      await build(target.root);
      await chmod(target.path(".agents", "skills", "demo", "SKILL.md"), mode);

      const problems = await runCheck(target.root, PACKAGE_VERSION);

      expect(problems).toEqual([
        {
          level: "error",
          file: ".agents/skills/demo/SKILL.md",
          line: 1,
          message: `.agents/skills/demo/SKILL.md has mode ${display}; expected 0644`,
          fix: "Run metafab build",
        },
      ]);
    });
  });

  const unreadableSkip = process.platform === "win32" || process.getuid?.() === 0;

  describe.skipIf(unreadableSkip)("unreadable factory paths", () => {
    test("reports one Cannot read error for a file that is neither config nor a skill", async () => {
      const target = await checkRepo();
      await build(target.root);
      const locked = target.path(".factory", "notes.md");
      await writeFile(locked, "notes\n");
      await chmod(locked, 0o000);

      try {
        const problems = await runCheck(target.root, PACKAGE_VERSION);

        expect(problems).toEqual([
          {
            level: "error",
            file: ".factory/notes.md",
            line: 1,
            message: "Cannot read .factory/notes.md",
            fix: "Check its permissions",
          },
        ]);
      } finally {
        await chmod(locked, 0o755);
      }
    });
  });

  describe.skipIf(unreadableSkip)("unreadable installed paths", () => {
    test.each([
      [".agents", "agents: [claude]\nmetafab-skill: false\n"],
      [".agents/skills", "agents: [codex]\nmetafab-skill: false\n"],
      [".agents/skills/demo", "agents: [codex]\nmetafab-skill: false\n"],
    ])("reports one Cannot read %s error and no drift", async (lockedPath, configAfter) => {
      const target = await checkRepo({
        ".factory/metafab.yaml": "agents: [claude, codex]\nmetafab-skill: false\n",
      });
      await build(target.root);
      await writeFile(target.path(".factory", "metafab.yaml"), configAfter);
      const locked = target.path(...lockedPath.split("/"));
      await chmod(locked, 0o000);

      try {
        const problems = await runCheck(target.root, PACKAGE_VERSION);
        const errors = problems.filter((problem) => problem.level === "error");

        expect(errors).toEqual([
          {
            level: "error",
            file: lockedPath,
            line: 1,
            message: `Cannot read ${lockedPath}`,
            fix: "Check its permissions",
          },
        ]);
        expect(
          problems.some(
            (problem) =>
              problem.message.includes("differs from the build output") ||
              problem.message.includes("missing from") ||
              problem.message.includes("has no source in .factory/"),
          ),
        ).toBe(false);
        expect(
          problems.some(
            (problem) =>
              problem.level === "warning" &&
              problem.message === "Build output not checked: fix the errors above first",
          ),
        ).toBe(true);
      } finally {
        await chmod(locked, 0o755);
      }
    });
  });
});
