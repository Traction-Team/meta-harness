import { chmod, lstat, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ExitCode } from "../../../src/errors.js";
import { listFiles, pathExists } from "../../../src/util/fs.js";
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

  test("exits 5 without a stack when a skill destination is a regular file", async () => {
    const repo = await buildRepo({ ".agents/skills": "not a directory\n" });

    const result = await runCli(["build"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.NotOwned);
    expect(result.stderr).toContain(".agents/skills");
    expect(result.stderr).toContain("is a file, not a directory");
    expect(result.stderr).not.toContain("ENOTDIR");
    expect(result.stderr).not.toContain("    at ");
    expect(await readFile(repo.path(".agents", "skills"), "utf8")).toBe("not a directory\n");
    expect(await pathExists(repo.path("AGENTS.md"))).toBe(false);
  });

  test("exits 5 without a stack when a parent of a skill destination is a symlink", async () => {
    const repo = await buildRepo();
    const outside = track(await makeRepo({}, { prefix: "metafab-outside-" }));
    await symlink(outside.root, repo.path(".agents"));

    const result = await runCli(["build"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.NotOwned);
    expect(result.stderr).toContain(".agents");
    expect(result.stderr).toContain("symbolic link");
    expect(result.stderr).not.toContain("    at ");
    expect(await listFiles(outside.root)).toEqual([]);
    expect(await pathExists(repo.path("AGENTS.md"))).toBe(false);
  });

  test("exits 5 without a stack when a symlinked root file needs a change", async () => {
    const repo = await buildRepo();
    const outside = track(await makeRepo({}, { prefix: "metafab-outside-" }));
    const outsideAgents = path.join(outside.root, "AGENTS.md");
    await writeFile(outsideAgents, "# Outside\n");
    await symlink(outsideAgents, repo.path("AGENTS.md"));

    const result = await runCli(["build"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.NotOwned);
    expect(result.stderr).toContain("AGENTS.md");
    expect(result.stderr).toContain("symbolic link");
    expect(result.stderr).not.toContain("    at ");
    expect(await readFile(outsideAgents, "utf8")).toBe("# Outside\n");
    expect((await lstat(repo.path("AGENTS.md"))).isSymbolicLink()).toBe(true);
    expect(await pathExists(repo.path(".agents"))).toBe(false);
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

  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "reports an unreadable root file as a problem with the failure JSON shape",
    async () => {
      const repo = await buildRepo({ "AGENTS.md": "# user\n" });
      const agents = repo.path("AGENTS.md");
      await chmod(agents, 0o000);

      try {
        const result = await runCli(["build", "--json"], { cwd: repo.root, tty: false });

        expect(result.code).toBe(ExitCode.Failed);
        expect(result.stderr).toBe("");
        const json = JSON.parse(result.stdout) as {
          ok: boolean;
          command: string;
          changed: unknown[];
          problems: { level: string; file: string; fix?: string }[];
        };
        expect(json.ok).toBe(false);
        expect(json.command).toBe("build");
        expect(json.changed).toEqual([]);
        expect(json.problems).toContainEqual(
          expect.objectContaining({
            level: "error",
            file: "AGENTS.md",
            fix: "Check its permissions",
          }),
        );
      } finally {
        await chmod(agents, 0o644);
      }
    },
  );

  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "reports an unreadable destination directory as a problem, not a stack",
    async () => {
      const repo = await buildRepo();
      const skills = repo.path(".agents", "skills");
      await mkdir(skills, { recursive: true });
      await chmod(skills, 0o000);

      try {
        const result = await runCli(["build"], { cwd: repo.root, tty: false });

        expect(result.code).toBe(ExitCode.Failed);
        expect(result.stderr).toContain(".agents/skills");
        expect(result.stderr).toContain("Check its permissions");
        expect(result.stderr).not.toContain("    at ");
        expect(await pathExists(repo.path("AGENTS.md"))).toBe(false);
      } finally {
        await chmod(skills, 0o755);
      }
    },
  );

  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "reports an unreadable metafab.yaml as one problem, not a crash",
    async () => {
      const repo = await buildRepo();
      const configFile = repo.path(".factory", "metafab.yaml");
      await chmod(configFile, 0o000);

      try {
        const result = await runCli(["build", "--json"], { cwd: repo.root, tty: false });

        expect(result.code).toBe(ExitCode.Failed);
        expect(result.stderr).toBe("");
        const json = JSON.parse(result.stdout) as {
          ok: boolean;
          command: string;
          exitCode: number;
          changed: unknown[];
          problems: { level: string; file: string; line: number; message: string; fix?: string }[];
        };
        expect(json.ok).toBe(false);
        expect(json.command).toBe("build");
        expect(json.exitCode).toBe(ExitCode.Failed);
        expect(json.changed).toEqual([]);
        expect(json.problems).toEqual([
          {
            level: "error",
            file: ".factory/metafab.yaml",
            line: 1,
            message: "Cannot read .factory/metafab.yaml",
            fix: "Check its permissions",
          },
        ]);
        expect(await pathExists(repo.path(".agents"))).toBe(false);
        expect(await pathExists(repo.path("AGENTS.md"))).toBe(false);
      } finally {
        await chmod(configFile, 0o644);
      }
    },
  );

  test("failure JSON always includes an empty changed list", async () => {
    const invalid = await buildRepo({ ".factory/metafab.yaml": "agents: [nope]\n" });
    const conflict = await buildRepo({
      ".factory/metafab.yaml": "agents: [claude]\nmetafab-skill: false\n",
      ".claude/skills/demo/SKILL.md": "user content\n",
    });

    for (const repo of [invalid, conflict]) {
      const result = await runCli(["build", "--json"], { cwd: repo.root, tty: false });
      const json = JSON.parse(result.stdout) as {
        ok: boolean;
        command: string;
        changed: unknown[];
        problems: unknown[];
      };

      expect(result.code).not.toBe(ExitCode.Ok);
      expect(json.ok).toBe(false);
      expect(json.command).toBe("build");
      expect(json.changed).toEqual([]);
      expect(Array.isArray(json.problems)).toBe(true);
    }
  });
});
