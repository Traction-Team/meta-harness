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

  test("treats an empty factory.yaml as missing and writes format and name", async () => {
    const created = await makeRepo({
      "Empty Factory/.factory/factory.yaml": "",
      "Empty Factory/.factory/workflows/x/SKILL.md": SKILL("x"),
    });
    repos.push(created);

    const result = await runCli(["pipeline", "add", "x"], {
      cwd: created.path("Empty Factory"),
      tty: false,
    });

    expect(result.code).toBe(0);
    expect(await readFile(created.path("Empty Factory/.factory/factory.yaml"), "utf8")).toBe(
      "format: 1\nname: empty-factory\n\npipeline:\n  - x\n",
    );
  });

  test("treats an empty mapping in factory.yaml as missing and writes format and name", async () => {
    const created = await makeRepo({
      "Empty Factory/.factory/factory.yaml": "{}\n",
      "Empty Factory/.factory/workflows/x/SKILL.md": SKILL("x"),
    });
    repos.push(created);

    const result = await runCli(["pipeline", "add", "x"], {
      cwd: created.path("Empty Factory"),
      tty: false,
    });

    expect(result.code).toBe(0);
    expect(await readFile(created.path("Empty Factory/.factory/factory.yaml"), "utf8")).toBe(
      "format: 1\nname: empty-factory\n\npipeline:\n  - x\n",
    );
  });

  test("treats a document marker as an empty factory.yaml", async () => {
    const created = await makeRepo({
      "Empty Factory/.factory/factory.yaml": "---\n",
      "Empty Factory/.factory/workflows/x/SKILL.md": SKILL("x"),
    });
    repos.push(created);

    const result = await runCli(["pipeline", "add", "x"], {
      cwd: created.path("Empty Factory"),
      tty: false,
    });

    expect(result.code).toBe(0);
    expect(await readFile(created.path("Empty Factory/.factory/factory.yaml"), "utf8")).toBe(
      "format: 1\nname: empty-factory\n\npipeline:\n  - x\n",
    );
  });

  test("keeps comments from a comment-only factory.yaml", async () => {
    const created = await makeRepo({
      "Empty Factory/.factory/factory.yaml": "# keep this comment\n",
      "Empty Factory/.factory/workflows/x/SKILL.md": SKILL("x"),
    });
    repos.push(created);

    const result = await runCli(["pipeline", "add", "x"], {
      cwd: created.path("Empty Factory"),
      tty: false,
    });

    expect(result.code).toBe(0);
    const text = await readFile(created.path("Empty Factory/.factory/factory.yaml"), "utf8");
    expect(text).toContain("format: 1\n");
    expect(text).toContain("name: empty-factory\n");
    expect(text).toContain("# keep this comment\n");
    expect(text).toContain("  - x\n");
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

const ALIASED_SOURCE = `format: 1
name: mark4
pipeline:
  - review-slice: &gate { stop: Wait for approval }
  - finish-slice: *gate
`;

async function aliasedRepo(files: Record<string, string> = {}): Promise<TempRepo> {
  return repo({
    ".factory/factory.yaml": ALIASED_SOURCE,
    ".factory/workflows/review-slice/SKILL.md": SKILL("review-slice"),
    ".factory/workflows/finish-slice/SKILL.md": SKILL("finish-slice"),
    ...files,
  });
}

describe("pipeline with YAML aliases", () => {
  test("adds after an aliased entry and keeps the anchor", async () => {
    const created = await aliasedRepo();

    const result = await runCli(["pipeline", "add", "x", "--after", "finish-slice", "--json"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      pipeline: ["review-slice", "finish-slice", "x"],
    });
    const text = await readFile(created.path(".factory/factory.yaml"), "utf8");
    expect(text).toContain("&gate");
    expect(text).toContain("*gate");
    expect(text.indexOf("- x")).toBeGreaterThan(text.indexOf("finish-slice"));
  });

  test("removes the aliasing entry and keeps the anchor", async () => {
    const created = await aliasedRepo();

    const result = await runCli(["pipeline", "remove", "finish-slice", "--json"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, pipeline: ["review-slice"] });
    const text = await readFile(created.path(".factory/factory.yaml"), "utf8");
    expect(text).toContain("&gate");
    expect(text).not.toContain("*gate");
  });

  test("refuses to remove the entry that holds a used anchor", async () => {
    const created = await aliasedRepo();
    const before = await readFile(created.path(".factory/factory.yaml"), "utf8");

    const result = await runCli(["pipeline", "remove", "review-slice"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Remove the alias to gate first");
    expect(await readFile(created.path(".factory/factory.yaml"), "utf8")).toBe(before);
  });

  test("add and remove refuse an unresolved alias and leave the file unchanged", async () => {
    const source = "format: 1\nname: mark4\npipeline:\n  - review-slice: *missing\n";
    const created = await repo({
      ".factory/factory.yaml": source,
      ".factory/workflows/review-slice/SKILL.md": SKILL("review-slice"),
    });

    const added = await runCli(["pipeline", "add", "x"], { cwd: created.root, tty: false });
    expect(added.code).toBe(1);
    expect(added.stderr).toContain("Alias *missing has no anchor");
    expect(added.stderr).not.toContain("    at ");

    const removed = await runCli(["pipeline", "remove", "y"], { cwd: created.root, tty: false });
    expect(removed.code).toBe(1);
    expect(removed.stderr).toContain("Alias *missing has no anchor");
    expect(removed.stderr).not.toContain("    at ");

    expect(await readFile(created.path(".factory/factory.yaml"), "utf8")).toBe(source);
  });

  test("add and remove refuse too many aliases and leave the file unchanged", async () => {
    const aliases = Array.from({ length: 120 }, (_, index) => `  - workflow-${index}: *gate`);
    const source = [
      "format: 1",
      "name: mark4",
      "pipeline:",
      "  - review-slice: &gate { stop: Wait for approval }",
      ...aliases,
    ].join("\n");
    const created = await repo({
      ".factory/factory.yaml": source,
      ".factory/workflows/review-slice/SKILL.md": SKILL("review-slice"),
      ".factory/workflows/finish-slice/SKILL.md": SKILL("finish-slice"),
    });

    const added = await runCli(["pipeline", "add", "finish-slice"], {
      cwd: created.root,
      tty: false,
    });
    expect(added.code).toBe(1);
    expect(added.stderr).toContain("Alias *gate is aliased too many times");
    expect(added.stderr).not.toContain("    at ");

    const removed = await runCli(["pipeline", "remove", "review-slice"], {
      cwd: created.root,
      tty: false,
    });
    expect(removed.code).toBe(1);
    expect(removed.stderr).toContain("Alias *gate is aliased too many times");
    expect(removed.stderr).not.toContain("    at ");

    expect(await readFile(created.path(".factory/factory.yaml"), "utf8")).toBe(source);
  });

  test("add and remove refuse a self-referencing alias and leave the file unchanged", async () => {
    const source = [
      "format: 1",
      "name: mark4",
      "tags: &t [*t]",
      "pipeline:",
      "  - review-slice",
      "  - finish-slice",
    ].join("\n");
    const created = await repo({
      ".factory/factory.yaml": source,
      ".factory/workflows/review-slice/SKILL.md": SKILL("review-slice"),
      ".factory/workflows/finish-slice/SKILL.md": SKILL("finish-slice"),
    });

    const added = await runCli(["pipeline", "add", "x"], { cwd: created.root, tty: false });
    expect(added.code).toBe(1);
    expect(added.stderr).toContain("Alias *t refers to itself");
    expect(added.stderr).not.toContain("    at ");

    const removed = await runCli(["pipeline", "remove", "review-slice"], {
      cwd: created.root,
      tty: false,
    });
    expect(removed.code).toBe(1);
    expect(removed.stderr).toContain("Alias *t refers to itself");
    expect(removed.stderr).not.toContain("    at ");

    expect(await readFile(created.path(".factory/factory.yaml"), "utf8")).toBe(source);
  });

  test("add and remove refuse a nested expansion past the alias limit and leave the file unchanged", async () => {
    const source = [
      "format: 1",
      "name: mark4",
      "pipeline:",
      "  - gate: &g { stop: Wait for approval }",
      "  - wrapped: &w { stop: *g }",
      ...Array.from({ length: 60 }, (_, index) => `  - e${index}: *w`),
    ].join("\n");
    const created = await repo({
      ".factory/factory.yaml": source,
      ".factory/workflows/gate/SKILL.md": SKILL("gate"),
      ".factory/workflows/wrapped/SKILL.md": SKILL("wrapped"),
      ".factory/workflows/finish-slice/SKILL.md": SKILL("finish-slice"),
    });

    const added = await runCli(["pipeline", "add", "finish-slice"], {
      cwd: created.root,
      tty: false,
    });
    expect(added.code).toBe(1);
    expect(added.stderr).toContain("Alias *w is aliased too many times");
    expect(added.stderr).not.toContain("    at ");

    const removed = await runCli(["pipeline", "remove", "e0"], { cwd: created.root, tty: false });
    expect(removed.code).toBe(1);
    expect(removed.stderr).toContain("Alias *w is aliased too many times");
    expect(removed.stderr).not.toContain("    at ");

    expect(await readFile(created.path(".factory/factory.yaml"), "utf8")).toBe(source);
  });
});

describe("pipeline remove on an empty factory.yaml", () => {
  test("reports pipeline-entry-missing and does not write", async () => {
    const created = await makeRepo({
      ".factory/factory.yaml": "---\n",
      ".factory/workflows/a/SKILL.md": SKILL("a"),
    });
    repos.push(created);

    const result = await runCli(["pipeline", "remove", "a", "--json"], {
      cwd: created.root,
      tty: false,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      exitCode: 1,
      code: "pipeline-entry-missing",
    });
    expect(await readFile(created.path(".factory/factory.yaml"), "utf8")).toBe("---\n");
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
