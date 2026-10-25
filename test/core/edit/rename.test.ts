import { chmod, readFile } from "node:fs/promises";
import { afterEach, describe, expect, test } from "vitest";
import { loadFactory } from "../../../src/core/factory/load.js";
import { renameSkill } from "../../../src/core/edit/index.js";
import { pathExists } from "../../../src/util/fs.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";

const FACTORY_YAML = `format: 1
name: mark4
description: Plan, build, and review work in slices.

# The pipeline runs in order.
pipeline:
  # File the work first.
  - file-work
  - review-slice: { stop: The code owner approves the PR } # tail comment
`;

const REVIEW_SKILL = `---
# Who reviews
name: review-slice # keep this comment
description: Review a slice.
metadata:
  owner: team
---

# Review slice

Read the pull request.
`;

const FILE_WORK_SKILL = `---
name: file-work
description: File work.
---

# File work
`;

const repos: TempRepo[] = [];

async function repo(files: Record<string, string> = {}): Promise<TempRepo> {
  const created = await makeRepo({
    ".factory/factory.yaml": FACTORY_YAML,
    ".factory/workflows/review-slice/SKILL.md": REVIEW_SKILL,
    ".factory/workflows/file-work/SKILL.md": FILE_WORK_SKILL,
    ...files,
  });
  repos.push(created);
  return created;
}

afterEach(async () => {
  await Promise.all(repos.splice(0).map((created) => created.cleanup()));
});

describe("rename", () => {
  test("moves the skill, updates its name, and keeps the pipeline stop and comments", async () => {
    const created = await repo();

    const result = await runCli(["rename", "review-slice", "review-plan"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Renamed review-slice to review-plan");
    expect(result.stdout).toContain(".factory/workflows/review-plan");
    expect(result.stdout).toContain("Run metafab build to install the change.");

    expect(await pathExists(created.path(".factory/workflows/review-slice"))).toBe(false);
    expect(await readFile(created.path(".factory/workflows/review-plan/SKILL.md"), "utf8")).toBe(`---
# Who reviews
name: review-plan # keep this comment
description: Review a slice.
metadata:
  owner: team
---

# Review slice

Read the pull request.
`);

    expect(await readFile(created.path(".factory/factory.yaml"), "utf8")).toBe(`format: 1
name: mark4
description: Plan, build, and review work in slices.

# The pipeline runs in order.
pipeline:
  # File the work first.
  - file-work
  - review-plan: { stop: The code owner approves the PR } # tail comment
`);

    const factory = await loadFactory(created.root);
    expect(factory.problems).toEqual([]);
    expect(factory.factoryYaml?.pipeline).toEqual([
      { workflow: "file-work", line: 8 },
      { workflow: "review-plan", stop: "The code owner approves the PR", line: 9 },
    ]);
  });

  test("reports the pipeline update in JSON output", async () => {
    const created = await repo();

    const result = await runCli(["rename", "review-slice", "review-plan", "--json"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      command: "rename",
      exitCode: 0,
      from: "review-slice",
      to: "review-plan",
      path: ".factory/workflows/review-plan",
      pipeline: true,
    });
  });

  test("warns about other factory files that mention the old name without editing them", async () => {
    const agentsMd = "Use review-slice before a merge.\n";
    const created = await repo({ ".factory/AGENTS.md": agentsMd });

    const result = await runCli(["rename", "review-slice", "review-plan"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toContain('.factory/AGENTS.md:1: warning: Mentions the old skill name "review-slice"');
    expect(result.stderr).toContain('Update it to "review-plan"');
    expect(await readFile(created.path(".factory/AGENTS.md"), "utf8")).toBe(agentsMd);
  });

  test("does not warn about a substring of a longer name", async () => {
    const created = await repo({ ".factory/AGENTS.md": "Use review-slicer.\n" });

    const result = await runCli(["rename", "review-slice", "review-plan"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("reports a clear error when the new name matches the old name", async () => {
    const created = await repo();

    const result = await runCli(["rename", "review-slice", "review-slice"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('The skill is already named "review-slice".');
    expect(result.stderr).not.toContain("destination");
    expect(await pathExists(created.path(".factory/workflows/review-slice/SKILL.md"))).toBe(true);
  });

  test.skipIf(typeof process.getuid === "function" && process.getuid() === 0)(
    "succeeds when an unrelated factory directory cannot be read",
    async () => {
      const created = await repo({ ".factory/notes/readme.txt": "See review-slice.\n" });
      const notes = created.path(".factory/notes");
      await chmod(notes, 0o000);

      try {
        const result = await runCli(["rename", "review-slice", "review-plan"], {
          cwd: created.root,
          tty: false,
        });

        expect(result.code).toBe(0);
        expect(await readFile(created.path(".factory/workflows/review-plan/SKILL.md"), "utf8")).toContain(
          "name: review-plan",
        );
      } finally {
        await chmod(notes, 0o755);
      }
    },
  );

  test("rolls the directory back when writing the moved skill fails", async () => {
    const created = await repo();

    await expect(
      renameSkill(created.root, "review-slice", "review-plan", {
        writeSkillText: async () => {
          throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
        },
      }),
    ).rejects.toMatchObject({
      code: "rename-failed",
      problems: [
        {
          file: ".factory/workflows/review-plan/SKILL.md",
          message: 'Could not rename "review-slice" to "review-plan": could not write .factory/workflows/review-plan/SKILL.md (ENOSPC).',
        },
      ],
    });

    expect(await pathExists(created.path(".factory/workflows/review-plan"))).toBe(false);
    expect(await readFile(created.path(".factory/workflows/review-slice/SKILL.md"), "utf8")).toBe(REVIEW_SKILL);
    expect(await readFile(created.path(".factory/factory.yaml"), "utf8")).toBe(FACTORY_YAML);
  });

  test("rolls back and blames factory.yaml when its write fails", async () => {
    const created = await repo();

    await expect(
      renameSkill(created.root, "review-slice", "review-plan", {
        writeFactoryText: async () => {
          throw Object.assign(new Error("permission denied"), { code: "EACCES" });
        },
      }),
    ).rejects.toMatchObject({
      code: "rename-failed",
      problems: [
        {
          file: ".factory/factory.yaml",
          message: 'Could not rename "review-slice" to "review-plan": could not write .factory/factory.yaml (EACCES).',
        },
      ],
    });

    expect(await pathExists(created.path(".factory/workflows/review-plan"))).toBe(false);
    expect(await readFile(created.path(".factory/workflows/review-slice/SKILL.md"), "utf8")).toBe(REVIEW_SKILL);
    expect(await readFile(created.path(".factory/factory.yaml"), "utf8")).toBe(FACTORY_YAML);
  });

  test("fails when the new name already exists", async () => {
    const created = await repo();

    const result = await runCli(["rename", "review-slice", "file-work"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('A skill named "file-work" already exists');
    expect(await pathExists(created.path(".factory/workflows/review-slice"))).toBe(true);
  });

  test("fails when the new name is not a valid skill name", async () => {
    const created = await repo();

    const result = await runCli(["rename", "review-slice", "Review Slice"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(1);
    expect(await pathExists(created.path(".factory/workflows/review-slice"))).toBe(true);
  });

  test("suggests a name when the skill does not exist", async () => {
    const created = await repo();

    const result = await runCli(["rename", "review-slic", "review-plan"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('No skill named "review-slic"');
    expect(result.stderr).toContain('Did you mean "review-slice"?');
  });

  test("leaves a non-workflow skill out of the pipeline", async () => {
    const created = await repo({ ".factory/review/security/SKILL.md": REVIEW_SKILL.replace(/review-slice/g, "security") });

    const result = await runCli(["rename", "security", "safety"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(0);
    expect(await readFile(created.path(".factory/factory.yaml"), "utf8")).toBe(FACTORY_YAML);
  });
});
