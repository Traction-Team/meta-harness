import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";

const FIXTURE = fileURLToPath(
  new URL("../../fixtures/factories/mark4-like", import.meta.url),
);

const paths: string[] = [];

async function fixtureRepo(): Promise<string> {
  const parent = await mkdtemp(path.join(tmpdir(), "metafab-map-"));
  paths.push(parent);
  const root = path.join(parent, "mark4-like");
  await cp(FIXTURE, root, { recursive: true });
  return root;
}

const repos: TempRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((created) => created.cleanup()));
  await Promise.all(paths.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

describe("map", () => {
  test("writes the factory map as one JSON object", async () => {
    const root = await fixtureRepo();

    const result = await runCli(["map", "--json"], { cwd: root, tty: false });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchSnapshot();
  });

  test("prints the pipeline, standalone workflows and grouped skills", async () => {
    const root = await fixtureRepo();
    await mkdir(path.join(root, ".factory/workflows/hotfix"), { recursive: true });
    await writeFile(
      path.join(root, ".factory/workflows/hotfix/SKILL.md"),
      "---\nname: hotfix\ndescription: Fix one urgent bug.\n---\n\n# Hotfix\n",
    );

    const result = await runCli(["map"], { cwd: root, tty: false });

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(`mark4 — Plan, build, and review work in slices with a person at each decision.

Pipeline
  1. file-work
  2. triage-ideas  stop: The product lead picks the next item
  3. plan-feature  stop: The tech lead approves the plan as a documentation PR
  4. build-slice
  5. review-slice  stop: The code owner approves the PR
  6. finish-slice

Standalone workflows
  hotfix

Skills
  review/   security
  skills/   git-conventions
`);
  });

  test("prints a top-level skill under (top level), last", async () => {
    const created = await makeRepo({
      ".factory/factory.yaml": "format: 1\nname: tiny\ndescription: A tiny factory.\n",
      ".factory/hotfix/SKILL.md":
        "---\nname: hotfix\ndescription: Fix one urgent bug.\n---\n\n# Hotfix\n",
    });
    repos.push(created);

    const result = await runCli(["map"], { cwd: created.root, tty: false });

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(`tiny — A tiny factory.

Skills
  (top level)   hotfix
`);
  });

  test("keeps a top-level skill's group in the JSON object", async () => {
    const created = await makeRepo({
      ".factory/factory.yaml": "format: 1\nname: tiny\ndescription: A tiny factory.\n",
      ".factory/hotfix/SKILL.md":
        "---\nname: hotfix\ndescription: Fix one urgent bug.\n---\n\n# Hotfix\n",
      ".factory/skills/git-conventions/SKILL.md":
        "---\nname: git-conventions\ndescription: Use conventional commit messages.\n---\n\n# Git conventions\n",
    });
    repos.push(created);

    const result = await runCli(["map", "--json"], { cwd: created.root, tty: false });

    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout) as {
      skills: { name: string; group: string; path: string }[];
    };
    expect(output.skills.map(({ name, group, path }) => ({ name, group, path }))).toEqual([
      { name: "hotfix", group: "hotfix", path: ".factory/hotfix" },
      { name: "git-conventions", group: "skills", path: ".factory/skills/git-conventions" },
    ]);
  });

  test("prints the same JSON object before and after the command name", async () => {
    const root = await fixtureRepo();

    const before = await runCli(["--json", "map"], { cwd: root, tty: false });
    const after = await runCli(["map", "--json"], { cwd: root, tty: false });

    expect(before.code).toBe(0);
    expect(after.code).toBe(0);
    expect(JSON.parse(before.stdout)).toEqual(JSON.parse(after.stdout));
    expect(before.stdout).toBe(after.stdout);
  });

  test("works on an invalid factory and includes its problems", async () => {
    const created = await makeRepo({
      ".factory/factory.yaml": `format: 1
name: broken
pipeline:
  - missing-workflow
`,
    });
    repos.push(created);

    const result = await runCli(["map", "--json"], { cwd: created.root, tty: false });

    expect(result.code).toBe(1);
    const output = JSON.parse(result.stdout) as {
      ok: boolean;
      factory: { name: string };
      pipeline: { workflow: string }[];
      problems: { message: string }[];
    };
    expect(output.ok).toBe(false);
    expect(output.factory.name).toBe("broken");
    expect(output.pipeline).toEqual([{ workflow: "missing-workflow" }]);
    expect(output.problems[0]?.message).toContain('unknown workflow "missing-workflow"');
  });
});
