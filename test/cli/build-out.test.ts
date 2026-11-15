import { createHash } from "node:crypto";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode } from "../../src/errors.js";
import { copyTree, listFiles, pathExists, toPosixPath } from "../../src/util/fs.js";
import { isolateGitConfig } from "../core/hooks/helpers.js";
import { makeRepo } from "../helpers/makeRepo.js";
import type { TempRepo } from "../helpers/makeRepo.js";
import { runCli } from "../helpers/runCli.js";

/**
 * `metafab build --out <dir>` through the command: it writes the compiled skills
 * for a selection into a directory of its own and changes nothing else.
 *
 * The fixture's `hello` skill switches on `harness` and its `amp-threads` skill
 * exists only for Amp, so a preview shows the difference a selection makes.
 */
const FIXTURE = fileURLToPath(new URL("../fixtures/env/build", import.meta.url));

/** Symlinks need a privilege Windows CI may not grant. */
const onWindows = process.platform === "win32";

const repos: TempRepo[] = [];
let isolation: Awaited<ReturnType<typeof isolateGitConfig>>;
let savedEnvironment: [string, string | undefined][] = [];

function track(repo: TempRepo): TempRepo {
  repos.push(repo);
  return repo;
}

beforeEach(async () => {
  isolation = await isolateGitConfig();
  // No developer's FACTORY_ENV_* may decide a test's selection.
  savedEnvironment = Object.entries(process.env).filter(([key]) =>
    key.toUpperCase().startsWith("FACTORY_ENV_"),
  );
  for (const [key] of savedEnvironment) delete process.env[key];
});

afterEach(async () => {
  for (const [key, value] of savedEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnvironment = [];
  isolation.restore();
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

/** The fixture in a Git repository, writing for both skill destinations. */
async function previewRepo(files: Record<string, string> = {}): Promise<TempRepo> {
  const repo = track(await makeRepo({}, { git: true }));
  await copyTree(FIXTURE, repo.root);

  const overrides: Record<string, string> = {
    ".factory/metafab.yaml": "agents: [claude, codex]\nmetafab-skill: false\n",
    ...files,
  };
  for (const [relative, content] of Object.entries(overrides)) {
    const target = repo.path(...relative.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return repo;
}

/** A directory outside the repository for a preview to write into. */
async function outside(): Promise<TempRepo> {
  return track(await makeRepo({}, { prefix: "metafab-preview-" }));
}

/** Every file in the tree with its SHA-256, so one changed byte shows up. */
async function snapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const relative of await listFiles(root)) {
    const content = await readFile(path.join(root, ...relative.split("/")));
    files[relative] = createHash("sha256").update(content).digest("hex");
  }
  return files;
}

function build(argv: readonly string[], cwd: string): ReturnType<typeof runCli> {
  return runCli(["build", ...argv], { cwd, tty: false });
}

describe("metafab build --out", () => {
  test("previews the selection and changes nothing in the repository", async () => {
    const repo = await previewRepo();
    const output = await outside();
    const ampOut = path.join(output.root, "amp");
    const opencodeOut = path.join(output.root, "opencode");
    const before = await snapshot(repo.root);

    const amp = await build(["--env", "harness=amp", "--out", ampOut], repo.root);

    expect(amp.code).toBe(ExitCode.Ok);
    expect(amp.stderr).toBe("");

    // Both selected agents get the skill, rendered for the selection.
    const ampHello = await readFile(
      path.join(ampOut, ".agents", "skills", "hello", "SKILL.md"),
      "utf8",
    );
    expect(ampHello).toContain("Start an Amp thread and run the skill there.");
    expect(ampHello).not.toContain("Run `opencode` in the repository root.");
    expect(
      await readFile(path.join(ampOut, ".claude", "skills", "hello", "SKILL.md"), "utf8"),
    ).toBe(ampHello);
    expect(await pathExists(path.join(ampOut, ".agents", "skills", "amp-threads", "SKILL.md"))).toBe(
      true,
    );

    // The summary names each file it wrote and the selection it rendered for.
    expect(amp.stdout).toContain(`+ ${toPosixPath(ampOut)}/.agents/skills/hello/SKILL.md`);
    expect(amp.stdout).toContain(
      `Previewed 7 files in ${toPosixPath(ampOut)} for harness=amp, workspace=orca,orb.`,
    );

    const opencode = await build(["--env", "harness=opencode", "--out", opencodeOut], repo.root);

    expect(opencode.code).toBe(ExitCode.Ok);
    const opencodeHello = await readFile(
      path.join(opencodeOut, ".agents", "skills", "hello", "SKILL.md"),
      "utf8",
    );
    expect(opencodeHello).toContain("Run `opencode` in the repository root.");
    expect(opencodeHello).not.toContain("Start an Amp thread");
    // The skill whose condition is false for this selection is not installed.
    expect(await pathExists(path.join(opencodeOut, ".agents", "skills", "amp-threads"))).toBe(false);
    expect(opencode.stdout).toContain(
      `Previewed 5 files in ${toPosixPath(opencodeOut)} for harness=opencode, workspace=orca,orb.`,
    );

    // The block is rendered for every value, so both previews hold the same bytes.
    const block = await readFile(path.join(ampOut, "AGENTS.md"), "utf8");
    expect(await readFile(path.join(opencodeOut, "AGENTS.md"), "utf8")).toBe(block);
    expect(block.startsWith("<!-- factory:start -->\n")).toBe(true);
    expect(block).toContain("Orca starts each worktree with a setup script.");

    // Neither preview touched the repository: no root files, skills or hooks.
    expect(await snapshot(repo.root)).toEqual(before);

    // And the block is byte for byte the one a real build writes.
    const built = await build(["--env", "harness=opencode"], repo.root);
    expect(built.code).toBe(ExitCode.Ok);
    expect(await readFile(repo.path("AGENTS.md"), "utf8")).toBe(block);
  });

  test("exits 5 for a non-empty directory and leaves it untouched", async () => {
    const repo = await previewRepo();
    const output = await outside();
    const out = path.join(output.root, "preview");
    await mkdir(out);
    await writeFile(path.join(out, "keep.txt"), "mine\n", "utf8");

    const result = await build(["--env", "harness=amp", "--out", out], repo.root);

    expect(result.code).toBe(ExitCode.NotOwned);
    expect(result.stderr).toContain(`--out ${out} is not empty`);
    expect(result.stderr).toContain("fix: Choose a new directory or empty it");
    expect(await listFiles(out)).toEqual(["keep.txt"]);
    expect(await readFile(path.join(out, "keep.txt"), "utf8")).toBe("mine\n");
  });

  test("exits 1 for a directory build would find, writing nothing", async () => {
    const repo = await previewRepo();

    for (const relative of [".factory/preview", ".claude/skills/preview", ".agents/skills/preview"]) {
      const result = await build(["--out", relative], repo.root);

      expect(result.code, relative).toBe(ExitCode.Failed);
      expect(result.stderr).toContain("where build would find it");
      expect(await pathExists(repo.path(...relative.split("/")))).toBe(false);
    }

    const empty = await build(["--out", ""], repo.root);
    expect(empty.code).toBe(ExitCode.Failed);
    expect(empty.stderr).toContain("--out needs a directory");
  });

  test.skipIf(onWindows)("exits 1 when a link leads into .factory/", async () => {
    const repo = await previewRepo();
    const output = await outside();
    const link = path.join(output.root, "link");
    await symlink(repo.path(".factory"), link);

    const result = await build(["--out", path.join(link, "preview")], repo.root);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("where build would find it");
    expect(await pathExists(repo.path(".factory", "preview"))).toBe(false);
  });

  test("exits 1 without creating the directory when the factory has an error", async () => {
    const repo = await previewRepo({
      ".factory/skills/hello/broken.md": [
        "# Broken",
        "",
        "<!-- factory:when env.harness == amp -->",
        "No end.",
        "",
      ].join("\n"),
    });
    const output = await outside();
    const out = path.join(output.root, "preview");

    const result = await build(["--env", "harness=amp", "--out", out], repo.root);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("is never closed in this file");
    expect(await pathExists(out)).toBe(false);
  });

  test("says nothing to preview when agents is empty", async () => {
    const repo = await previewRepo({
      ".factory/metafab.yaml": "agents: []\nmetafab-skill: false\n",
    });
    const output = await outside();
    const out = path.join(output.root, "preview");

    const result = await build(["--env", "harness=amp", "--out", out], repo.root);

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toBe("Nothing to preview: agents is empty.\n");
    expect(result.stderr).toBe("");
    expect(await pathExists(out)).toBe(false);
  });

  test("reports out, written and env in JSON, without changed or hooks", async () => {
    const repo = await previewRepo();
    const output = await outside();
    const out = path.join(output.root, "preview");

    const result = await build(["--env", "harness=amp", "--json", "--out", out], repo.root);

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stderr).toBe("");
    const json = JSON.parse(result.stdout) as {
      ok: boolean;
      command: string;
      exitCode: number;
      out?: string;
      written?: string[];
      env?: { name: string; selected: string[] }[];
      changed?: unknown;
      hooks?: unknown;
      summary?: unknown;
    };

    expect(json.ok).toBe(true);
    expect(json.command).toBe("build");
    expect(json.exitCode).toBe(ExitCode.Ok);
    expect(json.out).toBe(toPosixPath(out));
    expect([...(json.written ?? [])].sort()).toEqual([
      ".agents/skills/amp-threads/SKILL.md",
      ".agents/skills/hello/SKILL.md",
      ".agents/skills/hello/notes.md",
      ".claude/skills/amp-threads/SKILL.md",
      ".claude/skills/hello/SKILL.md",
      ".claude/skills/hello/notes.md",
      "AGENTS.md",
    ]);
    expect(json.env?.map((variable) => [variable.name, variable.selected])).toEqual([
      ["harness", ["amp"]],
      ["workspace", ["orca", "orb"]],
    ]);
    // Nothing in the repository changed, so neither field applies.
    expect(json).not.toHaveProperty("changed");
    expect(json).not.toHaveProperty("hooks");
    expect(json).not.toHaveProperty("summary");
  });

  test("build --help lists --out <dir>", async () => {
    const repo = await previewRepo();

    const result = await runCli(["build", "--help"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toContain("--out <dir>");
    expect(result.stdout).toContain(
      "Usage: metafab build [--env <variable>=<values>]... [--out <dir>]",
    );
  });
});
