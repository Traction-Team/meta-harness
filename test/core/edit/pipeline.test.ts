import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, test } from "vitest";
import { deriveFactoryName } from "../../../src/core/edit/index.js";
import { pathExists } from "../../../src/util/fs.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";

const SOURCE = `format: 1
name: mark4

# The pipeline runs in order.
pipeline:
  # File the work first.
  - y # first workflow
  - z
`;

const SKILL = (name: string) =>
  `---\nname: ${name}\ndescription: Does a thing.\n---\n\n# ${name}\n`;

const repos: TempRepo[] = [];

async function repo(files: Record<string, string> = {}): Promise<TempRepo> {
  const created = await makeRepo({
    ".factory/factory.yaml": SOURCE,
    ".factory/workflows/x/SKILL.md": SKILL("x"),
    ".factory/workflows/y/SKILL.md": SKILL("y"),
    ".factory/workflows/z/SKILL.md": SKILL("z"),
    ...files,
  });
  repos.push(created);
  return created;
}

afterEach(async () => {
  await Promise.all(repos.splice(0).map((created) => created.cleanup()));
});

describe("pipeline add", () => {
  test("inserts after an entry with a stop, keeping comments", async () => {
    const created = await repo();

    const result = await runCli(
      ["pipeline", "add", "x", "--after", "y", "--stop", "The tech lead approves the plan"],
      { cwd: created.root, tty: false },
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Added x to the pipeline.");
    expect(result.stdout).toContain("Run metafab build to install the change.");

    expect(await readFile(created.path(".factory/factory.yaml"), "utf8")).toBe(`format: 1
name: mark4

# The pipeline runs in order.
pipeline:
  # File the work first.
  - y # first workflow
  - x: { stop: The tech lead approves the plan }
  - z
`);
  });

  test("appends a workflow without --after", async () => {
    const created = await repo();

    const result = await runCli(["pipeline", "add", "x"], { cwd: created.root, tty: false });

    expect(result.code).toBe(0);
    expect(await readFile(created.path(".factory/factory.yaml"), "utf8")).toBe(`${SOURCE}  - x
`);
  });

  test("creates factory.yaml with a derived name when it is missing", async () => {
    const created = await makeRepo({
      "My Factory/.factory/workflows/x/SKILL.md": SKILL("x"),
    });
    repos.push(created);

    const result = await runCli(["pipeline", "add", "x"], {
      cwd: created.path("My Factory"),
      tty: false,
    });

    expect(result.code).toBe(0);
    expect(await readFile(created.path("My Factory/.factory/factory.yaml"), "utf8")).toBe(
      "format: 1\nname: my-factory\n\npipeline:\n  - x\n",
    );
    expect(deriveFactoryName("My Factory")).toBe("my-factory");
  });

  test("reports the edit as one JSON object", async () => {
    const created = await repo();

    const result = await runCli(["pipeline", "add", "x", "--after", "y", "--json"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      command: "pipeline add",
      exitCode: 0,
      path: ".factory/factory.yaml",
      workflow: "x",
      after: "y",
      created: false,
      pipeline: ["y", "x", "z"],
    });
  });

  test("fails when the workflow does not exist, with a suggestion", async () => {
    const created = await repo();
    const before = await readFile(created.path(".factory/factory.yaml"), "utf8");

    const result = await runCli(["pipeline", "add", "w"], { cwd: created.root, tty: false });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('No workflow named "w".');
    expect(result.stderr).toContain('Did you mean "x"?');
    expect(await readFile(created.path(".factory/factory.yaml"), "utf8")).toBe(before);
  });

  test("fails when the name is a skill instead of a workflow", async () => {
    const created = await repo({ ".factory/skills/security/SKILL.md": SKILL("security") });

    const result = await runCli(["pipeline", "add", "security"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('"security" is a skill, not a workflow.');
  });

  test("fails when the workflow is already in the pipeline", async () => {
    const created = await repo();

    const result = await runCli(["pipeline", "add", "y"], { cwd: created.root, tty: false });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Pipeline already contains "y"');
  });

  test("fails when --after is not a pipeline entry, with a suggestion", async () => {
    const created = await repo();

    const result = await runCli(["pipeline", "add", "x", "--after", "zz"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Pipeline has no workflow "zz".');
    expect(result.stderr).toContain('Did you mean "z"?');
  });

  test("rejects a stop that is not a single line", async () => {
    const created = await repo();

    const result = await runCli(
      ["pipeline", "add", "x", "--stop", "One line.\nAnother line."],
      { cwd: created.root, tty: false },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("must be a non-empty single line");
  });
});

describe("pipeline remove", () => {
  test("removes an entry and keeps every comment", async () => {
    const created = await repo();

    const result = await runCli(["pipeline", "remove", "y"], { cwd: created.root, tty: false });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Removed y from the pipeline.");
    expect(result.stdout).toContain("Run metafab build to install the change.");

    expect(await readFile(created.path(".factory/factory.yaml"), "utf8")).toBe(`format: 1
name: mark4

# The pipeline runs in order.
pipeline:
  # File the work first.
  - z
`);
  });

  test("leaves the workflow file alone", async () => {
    const created = await repo();
    const before = await readFile(created.path(".factory/workflows/y/SKILL.md"), "utf8");

    const result = await runCli(["pipeline", "remove", "y"], { cwd: created.root, tty: false });

    expect(result.code).toBe(0);
    expect(await readFile(created.path(".factory/workflows/y/SKILL.md"), "utf8")).toBe(before);
    expect(await pathExists(created.path(".factory/workflows/y"))).toBe(true);
  });

  test("removing the last entry leaves an empty pipeline", async () => {
    const created = await repo({
      ".factory/factory.yaml": "format: 1\nname: mark4\npipeline:\n  - y\n",
    });

    const result = await runCli(["pipeline", "remove", "y"], { cwd: created.root, tty: false });

    expect(result.code).toBe(0);
    expect(await readFile(created.path(".factory/factory.yaml"), "utf8")).toBe(
      "format: 1\nname: mark4\npipeline: []\n",
    );
  });

  test("fails with a suggestion when the entry is absent", async () => {
    const created = await repo();
    const before = await readFile(created.path(".factory/factory.yaml"), "utf8");

    const result = await runCli(["pipeline", "remove", "yy"], { cwd: created.root, tty: false });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('The pipeline does not contain "yy".');
    expect(result.stderr).toContain('Did you mean "y"?');
    expect(await readFile(created.path(".factory/factory.yaml"), "utf8")).toBe(before);
  });

  test("fails when there is no factory.yaml", async () => {
    const created = await makeRepo({
      ".factory/workflows/y/SKILL.md": SKILL("y"),
    });
    repos.push(created);

    const result = await runCli(["pipeline", "remove", "y"], { cwd: created.root, tty: false });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('The pipeline does not contain "y".');
    expect(await pathExists(created.path(".factory/factory.yaml"))).toBe(false);
  });
});
