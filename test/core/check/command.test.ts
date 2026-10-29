import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, test } from "vitest";
import { ExitCode } from "../../../src/errors.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";

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

async function build(root: string): Promise<void> {
  const result = await runCli(["build"], { cwd: root, tty: false });
  if (result.code !== ExitCode.Ok) {
    throw new Error(`build failed: ${result.stdout}${result.stderr}`);
  }
}

describe("check command", () => {
  test("a valid built fixture passes with a summary", async () => {
    const repo = await checkRepo();
    await build(repo.root);

    const result = await runCli(["check"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toBe("0 errors, 0 warnings\n");
    expect(result.stderr).toBe("");
  });

  test("a fresh clone fails with one problem per destination", async () => {
    const repo = await checkRepo({
      ".factory/metafab.yaml": "agents: [claude, codex]\nmetafab-skill: false\n",
    });
    await build(repo.root);
    await rm(repo.path(".claude"), { recursive: true, force: true });
    await rm(repo.path(".agents"), { recursive: true, force: true });

    const result = await runCli(["check"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stdout).toBe("2 errors, 0 warnings\n");
    expect(result.stderr).toContain(".claude/skills/demo:1: error: Installed skill 'demo' is missing from .claude/skills");
    expect(result.stderr).toContain(".agents/skills/demo:1: error: Installed skill 'demo' is missing from .agents/skills");
    expect(result.stderr.match(/  fix: Run metafab build/g)).toHaveLength(2);
  });

  test("a hand edit prints the file, line, level, message and fix", async () => {
    const repo = await checkRepo();
    await build(repo.root);
    const installed = repo.path(".agents", "skills", "demo", "SKILL.md");
    await writeFile(installed, `${await readFile(installed, "utf8")}\nHand edit.\n`);

    const result = await runCli(["check"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stdout).toBe("1 error, 0 warnings\n");
    expect(result.stderr).toBe(
      [
        ".agents/skills/demo/SKILL.md:1: error: .agents/skills/demo/SKILL.md differs from the build output",
        "  fix: Edit .factory/skills/demo/ instead, then run metafab build",
        "",
      ].join("\n"),
    );
  });

  test("a 301-line AGENTS.md block is a warning and exits 0", async () => {
    const repo = await checkRepo({
      ".factory/AGENTS.md": Array.from({ length: 301 }, (_, index) => `Line ${index + 1}`).join(
        "\n",
      ),
    });
    await build(repo.root);

    const result = await runCli(["check"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toBe("0 errors, 1 warning\n");
    expect(result.stderr).toContain("warning:");
    expect(result.stderr).toContain("limit is 300");
  });

  test("create, build and check pass for a new workflow", async () => {
    const repo = await checkRepo();

    const created = await runCli(
      ["create", "workflows/review-slice", "--description", "Review a slice. Use when a slice is ready."],
      { cwd: repo.root, tty: false },
    );
    expect(created.code).toBe(ExitCode.Ok);
    await build(repo.root);

    const result = await runCli(["check"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toBe("0 errors, 0 warnings\n");
    expect(result.stderr).toBe("");
  });

  test("exits 1 with a fix when there is no factory", async () => {
    const repo = track(await makeRepo({}));

    const result = await runCli(["check"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("No factory found");
    expect(result.stderr).toContain("fix: Run metafab init");
  });

  test("exits 1 without drift when the configuration does not validate", async () => {
    const repo = await checkRepo({ ".factory/metafab.yaml": "agents: [nope]\n" });

    const result = await runCli(["check"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("error:");
    expect(result.stderr).toContain("Build output not checked: fix the errors above first");
    expect(result.stderr).not.toContain("    at ");
  });

  test("writes the spec's failed check JSON shape for a misspelled pipeline entry", async () => {
    const repo = await checkRepo({
      ".factory/factory.yaml":
        "format: 1\nname: demo\npipeline:\n  - review-slices: {}\n",
      ".factory/workflows/review-slice/SKILL.md":
        "---\nname: review-slice\ndescription: Review a slice. Use when a slice is ready.\n---\n\n# Review slice\n",
    });

    const result = await runCli(["check", "--json"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toBe("");
    const json = JSON.parse(result.stdout) as {
      ok: boolean;
      command: string;
      exitCode: number;
      problems: Record<string, unknown>[];
      summary?: string;
    };

    expect(Object.keys(json).sort()).toEqual(["command", "exitCode", "ok", "problems"]);
    expect(json.ok).toBe(false);
    expect(json.command).toBe("check");
    expect(json.exitCode).toBe(ExitCode.Failed);
    expect(json.summary).toBeUndefined();

    const problem = json.problems[0];
    expect(problem).toBeDefined();
    expect(Object.keys(problem!).sort()).toEqual(["file", "fix", "level", "line", "message"]);
    expect(problem).toMatchObject({ level: "error", file: ".factory/factory.yaml", line: 4 });
    expect(String(problem!.message)).toContain("review-slices");
    expect(String(problem!.fix)).toContain("review-slice");
  });

  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "lists an unreadable installed path in problems with --json",
    async () => {
      const repo = await checkRepo();
      await build(repo.root);
      const locked = repo.path(".agents", "skills", "demo");
      await chmod(locked, 0o000);

      try {
        const result = await runCli(["check", "--json"], { cwd: repo.root, tty: false });

        expect(result.code).toBe(ExitCode.Failed);
        expect(result.stderr).toBe("");
        const json = JSON.parse(result.stdout) as {
          ok: boolean;
          command: string;
          exitCode: number;
          problems: { level: string; file: string; message: string; fix?: string }[];
        };
        expect(json.ok).toBe(false);
        expect(json.command).toBe("check");
        expect(json.problems).toContainEqual({
          level: "error",
          file: ".agents/skills/demo",
          line: 1,
          message: "Cannot read .agents/skills/demo",
          fix: "Check its permissions",
        });
        expect(json.problems).toContainEqual(
          expect.objectContaining({
            level: "warning",
            message: "Build output not checked: fix the errors above first",
          }),
        );
        expect(json.problems.some((problem) => problem.message.includes("differs"))).toBe(false);
      } finally {
        await chmod(locked, 0o755);
      }
    },
  );
});
