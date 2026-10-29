import { chmod, readFile } from "node:fs/promises";
import { Readable, PassThrough } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { loadFactory } from "../../../src/core/factory/load.js";
import { listFiles, pathExists } from "../../../src/util/fs.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";

const FACTORY_YAML = "format: 1\nname: mark4\n";

const cannotTestPermissions = process.platform === "win32" || process.getuid?.() === 0;

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

  test("re-asks the description prompt when the answer is empty", async () => {
    const created = await repo();
    const stdin = new PassThrough();

    const pending = runCli(["create", "skills/advise"], {
      cwd: created.root,
      tty: true,
      stdin,
    });
    stdin.write("\n");
    await new Promise((resolve) => setTimeout(resolve, 50));
    stdin.write("Advise on slices.\n");
    stdin.end();
    const result = await pending;

    expect(result.code).toBe(0);
    expect(result.stderr).toContain("A description is required.");
    expect(await readFile(created.path(".factory/skills/advise/SKILL.md"), "utf8")).toContain(
      "description: Advise on slices.",
    );
  });

  test("gives up after repeated empty answers at the prompt", async () => {
    const created = await repo();
    const stdin = new PassThrough();

    const pending = runCli(["create", "skills/advise"], {
      cwd: created.root,
      tty: true,
      stdin,
    });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      stdin.write("\n");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    stdin.end();
    const result = await pending;

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("A description is required.");
    expect(await pathExists(created.path(".factory/skills/advise/SKILL.md"))).toBe(false);
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
    const created = await repo({ ".factory/review/child/SKILL.md": SKILL("child") });

    const result = await runCli(
      ["create", "review", "--description", "A parent."],
      { cwd: created.root, tty: false },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('would contain the skill "child"');
    expect(await pathExists(created.path(".factory/review/SKILL.md"))).toBe(false);
  });

  test("fails when the path would contain a skill nested below a child directory", async () => {
    const created = await repo({ ".factory/review/deep/child/SKILL.md": SKILL("child") });

    const result = await runCli(["create", "review", "--description", "A parent."], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('would contain the skill "deep/child"');
    expect(await pathExists(created.path(".factory/review/SKILL.md"))).toBe(false);
  });

  test.each(["workflows", "skills", "rules"])("refuses the reserved path %s", async (dir) => {
    const created = await repo();
    const before = await listFiles(created.root);

    const result = await runCli(["create", dir, "--description", "No.", "--json"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(1);
    const output = JSON.parse(result.stdout) as { ok: boolean; code: string };
    expect(output.ok).toBe(false);
    expect(output.code).toBe("create-reserved-path");
    expect(await listFiles(created.root)).toEqual(before);
  });

  test("creates a workflow when the reserved container holds a SKILL.md", async () => {
    const created = await repo({ ".factory/workflows/SKILL.md": SKILL("workflows") });

    const result = await runCli(
      ["create", "workflows/review-slice", "--description", "Review a slice."],
      { cwd: created.root, tty: false },
    );

    expect(result.code).toBe(0);
    expect(await pathExists(created.path(".factory/workflows/review-slice/SKILL.md"))).toBe(true);
  });

  test("fails when an unparseable skill directory holds the name", async () => {
    const created = await repo({
      ".factory/skills/security/SKILL.md": "---\nname: [unterminated\n---\n",
    });

    const result = await runCli(
      ["create", "review/security", "--description", "Check security.", "--json"],
      { cwd: created.root, tty: false },
    );

    expect(result.code).toBe(1);
    const output = JSON.parse(result.stdout) as { ok: boolean; code: string; summary: string };
    expect(output.ok).toBe(false);
    expect(output.code).toBe("create-duplicate-name");
    expect(output.summary).toBe(
      '.factory/skills/security may hold a skill named "security", but it cannot be read',
    );
    expect(await pathExists(created.path(".factory/review/security/SKILL.md"))).toBe(false);
  });

  test.skipIf(cannotTestPermissions)("fails when an unreadable directory holds the name", async () => {
    const created = await repo({ ".factory/skills/security/SKILL.md": SKILL("security") });
    const directory = created.path(".factory", "skills", "security");
    try {
      await chmod(directory, 0o000);

      const result = await runCli(
        ["create", "review/security", "--description", "Check security.", "--json"],
        { cwd: created.root, tty: false },
      );

      expect(result.code).toBe(1);
      const output = JSON.parse(result.stdout) as { ok: boolean; code: string; summary: string };
      expect(output.ok).toBe(false);
      expect(output.code).toBe("create-duplicate-name");
      expect(output.summary).toBe(
        '.factory/skills/security may hold a skill named "security", but it cannot be read',
      );
      expect(await pathExists(created.path(".factory/review/security/SKILL.md"))).toBe(false);
    } finally {
      await chmod(directory, 0o755);
    }
  });

  test("refuses a path with a hidden segment that discovery would skip", async () => {
    const created = await repo();

    const result = await runCli(["create", ".hidden/secret", "--description", "Secret."], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('must not include the hidden directory ".hidden"');
    expect(await pathExists(created.path(".factory/.hidden/secret/SKILL.md"))).toBe(false);
  });

  test("reports an ancestor that is a file as a problem, not a raw error", async () => {
    const created = await repo({ ".factory/skills": "not a directory\n" });

    const result = await runCli(["create", "skills/advise", "--description", "Advise.", "--json"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(1);
    const output = JSON.parse(result.stdout) as { ok: boolean; exitCode: number; problems: { message: string }[] };
    expect(output.ok).toBe(false);
    expect(output.exitCode).toBe(1);
    expect(output.problems[0]?.message).toContain(".factory/skills is not a directory");
    expect(result.stderr).toBe("");
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
