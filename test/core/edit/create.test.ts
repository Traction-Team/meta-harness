import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { loadFactory } from "../../../src/core/factory/load.js";
import { listFiles, pathExists } from "../../../src/util/fs.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";

const FACTORY_YAML = "format: 1\nname: mark4\n";

const SKILL = (name: string) =>
  `---\nname: ${name}\ndescription: Does a thing.\n---\n\n# ${name}\n`;

const repos: TempRepo[] = [];

async function repo(files: Record<string, string> = {}): Promise<TempRepo> {
  const created = await makeRepo({ ".factory/factory.yaml": FACTORY_YAML, ...files });
  repos.push(created);
  return created;
}

afterEach(async () => {
  await Promise.all(repos.splice(0).map((created) => created.cleanup()));
});

describe("create", () => {
  test("writes a valid workflow skill that the Plan 02 loader accepts", async () => {
    const created = await repo();

    const result = await runCli(
      ["create", "workflows/review-slice", "--description", "Review a slice before it merges."],
      { cwd: created.root, tty: false },
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(".factory/workflows/review-slice/SKILL.md");
    expect(result.stdout).toContain("Run metafab build to install the change.");

    const text = await readFile(created.path(".factory/workflows/review-slice/SKILL.md"), "utf8");
    expect(text).toBe(`---
name: review-slice
description: Review a slice before it merges.
---

# Review slice
`);

    // `build` and `check` are not implemented yet, so validate with the Plan 02 loader.
    const factory = await loadFactory(created.root);
    expect(factory.problems).toEqual([]);
    expect(factory.skills).toHaveLength(1);
    expect(factory.skills[0]?.name).toBe("review-slice");
    expect(factory.skills[0]?.isWorkflow).toBe(true);
  });

  test("accepts a description from the terminal prompt", async () => {
    const created = await repo();

    const result = await runCli(["create", "skills/advise", "--description", "   "], {
      cwd: created.root,
      tty: false,
    });
    expect(result.code).toBe(1);
    expect(await pathExists(created.path(".factory/skills/advise/SKILL.md"))).toBe(false);

    const prompted = await runCli(["create", "skills/advise"], {
      cwd: created.root,
      tty: true,
      stdin: Readable.from(["Advise on slices.\n"]),
    });
    expect(prompted.code).toBe(0);
    expect(await readFile(created.path(".factory/skills/advise/SKILL.md"), "utf8")).toContain(
      "description: Advise on slices.",
    );
  });

  test("prints its result as one JSON object", async () => {
    const created = await repo();

    const result = await runCli(
      ["create", "review/security", "--description", "Check security.", "--json"],
      { cwd: created.root, tty: false },
    );

    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      command: "create",
      exitCode: 0,
      path: ".factory/review/security/SKILL.md",
      name: "security",
      description: "Check security.",
    });
  });

  test("fails when the name already exists elsewhere in the factory", async () => {
    const created = await repo({ ".factory/skills/security/SKILL.md": SKILL("security") });

    const result = await runCli(
      ["create", "review/security", "--description", "Check security."],
      { cwd: created.root, tty: false },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('A skill named "security" already exists');
    expect(await pathExists(created.path(".factory/review/security/SKILL.md"))).toBe(false);
  });

  test("fails when the path is inside an existing skill", async () => {
    const created = await repo({ ".factory/workflows/a/SKILL.md": SKILL("a") });

    const result = await runCli(
      ["create", "workflows/a/b", "--description", "Nested."],
      { cwd: created.root, tty: false },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('is inside the skill "workflows/a"');
    expect(await pathExists(created.path(".factory/workflows/a/b"))).toBe(false);
  });

  test("fails when the path would contain an existing skill", async () => {
    const created = await repo({ ".factory/skills/child/SKILL.md": SKILL("child") });

    const result = await runCli(
      ["create", "skills", "--description", "A parent."],
      { cwd: created.root, tty: false },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('would contain the skill "child"');
    expect(await pathExists(created.path(".factory/skills/SKILL.md"))).toBe(false);
  });

  test("exits 2 and writes nothing without a description in a non-TTY", async () => {
    const created = await repo();
    const before = await listFiles(created.root);

    const result = await runCli(["create", "workflows/review-slice"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--description");
    expect(await listFiles(created.root)).toEqual(before);
  });

  test("rejects an empty description", async () => {
    const created = await repo();

    const result = await runCli(["create", "workflows/empty", "--description", ""], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("A description is required.");
    expect(await pathExists(created.path(".factory/workflows/empty/SKILL.md"))).toBe(false);
  });

  test("rejects a multi-line description", async () => {
    const created = await repo();

    const result = await runCli(
      ["create", "workflows/two-lines", "--description", "First line.\nSecond line."],
      { cwd: created.root, tty: false },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("must be a single line");
    expect(await pathExists(created.path(".factory/workflows/two-lines/SKILL.md"))).toBe(false);
  });
});
