import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, test } from "vitest";
import { ExitCode } from "../../../src/errors.js";
import { pathExists } from "../../../src/util/fs.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";

const repos: TempRepo[] = [];

function track(repo: TempRepo): TempRepo {
  repos.push(repo);
  return repo;
}

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

function buildRepo(files: RepoFiles = {}): Promise<TempRepo> {
  return makeRepo({
    ".factory/factory.yaml": "format: 1\nname: demo\n",
    ".factory/metafab.yaml": "agents: [codex]\nmetafab-skill: false\n",
    ".factory/skills/demo/SKILL.md":
      "---\nname: demo\ndescription: Demo. Use when testing.\n---\n\n# Demo\n",
    ...files,
  }).then(track);
}

describe("build command", () => {
  test("creates the installed output on the first run", async () => {
    const repo = await buildRepo();

    const result = await runCli(["build"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toContain("+ .agents/skills/demo/SKILL.md");
    expect(result.stdout).toContain("+ AGENTS.md");
    expect(result.stdout).toContain("+ .gitignore");
    expect(result.stdout).toContain("3 files changed.");
    expect(result.stderr).toBe("");
    expect(await pathExists(repo.path(".agents", "skills", "demo", "SKILL.md"))).toBe(true);
    expect(await readFile(repo.path("AGENTS.md"), "utf8")).toContain("<!-- factory:start -->");
  });

  test("prints Up to date. when nothing changed", async () => {
    const repo = await buildRepo();
    await runCli(["build"], { cwd: repo.root, tty: false });

    const result = await runCli(["build"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toBe("Up to date.\n");
    expect(result.stderr).toBe("");
  });

  test("exits 5 on a conflict and writes nothing", async () => {
    const repo = await buildRepo({
      ".factory/metafab.yaml": "agents: [claude]\nmetafab-skill: false\n",
      ".claude/skills/demo/SKILL.md": "user content\n",
    });

    const result = await runCli(["build"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.NotOwned);
    expect(result.stderr).toContain("Unowned directory .claude/skills/demo");
    expect(await readFile(repo.path(".claude", "skills", "demo", "SKILL.md"), "utf8")).toBe(
      "user content\n",
    );
    expect(await pathExists(repo.path(".agents"))).toBe(false);
    expect(await pathExists(repo.path("AGENTS.md"))).toBe(false);
    expect(await pathExists(repo.path(".gitignore"))).toBe(false);
  });

  test("writes the JSON shape expected by the spec", async () => {
    const repo = await buildRepo();

    const first = await runCli(["build", "--json"], { cwd: repo.root, tty: false });
    expect(first.code).toBe(ExitCode.Ok);
    expect(first.stderr).toBe("");

    const created = JSON.parse(first.stdout) as {
      ok: boolean;
      command: string;
      changed: { path: string; action: string }[];
      problems: unknown[];
      summary?: string;
    };
    expect(created.ok).toBe(true);
    expect(created.command).toBe("build");
    expect(created.problems).toEqual([]);
    expect(created.summary).toBeUndefined();
    expect(created.changed).toContainEqual({
      path: ".agents/skills/demo/SKILL.md",
      action: "created",
    });

    const second = await runCli(["build", "--json"], { cwd: repo.root, tty: false });
    const unchanged = JSON.parse(second.stdout) as { changed: unknown[]; problems: unknown[] };
    expect(second.code).toBe(ExitCode.Ok);
    expect(unchanged.changed).toEqual([]);
    expect(unchanged.problems).toEqual([]);
  });

  test("exits 1 when the factory or config does not validate", async () => {
    const repo = await buildRepo({ ".factory/metafab.yaml": "agents: [nope]\n" });

    const result = await runCli(["build"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("error:");
    expect(await pathExists(repo.path(".agents"))).toBe(false);
    expect(await pathExists(repo.path("AGENTS.md"))).toBe(false);
  });
});
