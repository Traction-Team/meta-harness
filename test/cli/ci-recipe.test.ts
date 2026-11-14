import { chmod, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode } from "../../src/errors.js";
import type { Problem } from "../../src/errors.js";
import { copyFileWithMode, listFiles } from "../../src/util/fs.js";
import { runGit } from "../../src/util/git.js";
import type { GitResult } from "../../src/util/git.js";
import { isolateGitConfig } from "../core/hooks/helpers.js";
import { makeRepo, writeRepoFiles } from "../helpers/makeRepo.js";
import type { TempRepo } from "../helpers/makeRepo.js";
import { runCli } from "../helpers/runCli.js";
import type { RunCliResult } from "../helpers/runCli.js";

/**
 * The spec's CI recipe (docs/specs/building.md: Repeatability) against the
 * `mark4-like` fixture, in an LF checkout and in CRLF checkouts with and without
 * the `.gitattributes` `eol=lf` lines (Building: Line endings), plus the failure
 * cases Plan 1.022, Design → "Spec CI recipe against mark4-like", describes.
 *
 * `build` runs in process through `runCli`; Git runs through `runGit`. Every
 * repository is local, so no test reaches the network.
 */

const FIXTURES = fileURLToPath(new URL("../fixtures", import.meta.url));
const MARK4_SOURCE = path.join(FIXTURES, "build", "mark4-like", "source");

/** The three `eol=lf` lines `init` writes to `.gitattributes` (Building: Line endings). */
const EOL_ATTRIBUTES = [
  ".factory/** text=auto eol=lf",
  ".claude/skills/** text=auto eol=lf",
  ".agents/skills/** text=auto eol=lf",
  "",
].join("\n");

/** The paths the recipe checks after `build` (Building: Repeatability). */
const RECIPE_PATHS = ["AGENTS.md", "CLAUDE.md", ".gitignore", ".gitattributes"];

const INSTALLED_SKILL = ".claude/skills/git-conventions/SKILL.md";

/** An executable factory skill file: the spec installs it with mode 0755. */
const RUN_SH = "#!/bin/sh\necho \"git conventions\"\n";

/** Where the test tree lives inside a team repository. */
const SKILL_SOURCE = ".factory/skills/git-conventions";

/**
 * The settings every team-repository command gets, so the developer's own Git
 * configuration cannot change a result. `core.autocrlf=false` here keeps the
 * committed tree LF; clones pass their own `core.autocrlf` and must not inherit
 * this one, so clone commands do not use this list.
 */
const TEAM_GIT_CONFIG = [
  "-c",
  "user.name=test",
  "-c",
  "user.email=test@example.invalid",
  "-c",
  "core.autocrlf=false",
  "-c",
  "core.longpaths=true",
  "-c",
  "commit.gpgsign=false",
];

type LineEndings = "lf" | "crlf" | "mixed";

interface BuildJson {
  ok: boolean;
  command: string;
  exitCode: number;
  changed?: { path: string; action: string }[];
  problems?: Problem[];
}

interface CheckJson {
  ok: boolean;
  command: string;
  exitCode: number;
  problems?: Problem[];
}

const repos: TempRepo[] = [];

let env!: Awaited<ReturnType<typeof isolateGitConfig>>;
let plain!: TempRepo;
let eol!: TempRepo;

async function teamGit(cwd: string, ...args: string[]): Promise<GitResult> {
  return runGit([...TEAM_GIT_CONFIG, ...args], { cwd });
}

async function teamGitOk(cwd: string, ...args: string[]): Promise<GitResult> {
  const result = await teamGit(cwd, ...args);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result;
}

/** Copies the fixture tree, renaming its `gitignore.txt` to `.gitignore`. */
async function copyFixture(source: string, destination: string): Promise<void> {
  for (const relativePath of await listFiles(source)) {
    const segments = relativePath.split("/");
    if (segments[segments.length - 1] === "gitignore.txt") segments[segments.length - 1] = ".gitignore";
    await copyFileWithMode(
      path.join(source, ...relativePath.split("/")),
      path.join(destination, ...segments),
    );
  }
}

/**
 * One team repository: the fixture, an executable factory skill file, and, for
 * `eol`, the root `.gitattributes`. It is built, committed, and marked in the
 * index so the executable bit survives a clone on every operating system.
 */
async function makeTeam(options: { eol?: boolean; files?: Record<string, string> } = {}): Promise<TempRepo> {
  // The space and `é` cover the Windows path check (W3) on every operating system.
  const repo = await makeRepo({}, { git: true, prefix: "metafab recipe é-" });
  repos.push(repo);

  await copyFixture(MARK4_SOURCE, repo.root);
  const runSh = path.join(repo.root, ...`${SKILL_SOURCE}/run.sh`.split("/"));
  await writeFile(runSh, RUN_SH);
  // Build installs 0755 from this bit on POSIX; the index bit carries it through the clone.
  await chmod(runSh, 0o755);
  if (options.eol === true) await writeFile(repo.path(".gitattributes"), EOL_ATTRIBUTES);
  await writeRepoFiles(repo.root, options.files ?? {});

  const built = await runCli(["build"], { cwd: repo.root, tty: false });
  expect(built.code, built.stderr).toBe(ExitCode.Ok);

  await teamGitOk(repo.root, "add", "-A");
  await teamGitOk(repo.root, "update-index", "--chmod=+x", `${SKILL_SOURCE}/run.sh`);
  await teamGitOk(repo.root, "commit", "--quiet", "-m", "factory");

  return repo;
}

/**
 * A local clone of a team repository. `-c` after `clone` writes the setting
 * into the clone's own configuration, so a later `git diff` converts line
 * endings exactly as the checkout did. `core.longpaths=true` lets Git for
 * Windows check out a long path.
 */
async function cloneTeam(source: TempRepo, autocrlf: boolean, label: string): Promise<TempRepo> {
  const clone = await makeRepo({}, { prefix: `metafab recipe ${label} é-` });
  repos.push(clone);

  const result = await runGit([
    "clone",
    "--quiet",
    "-c",
    "core.longpaths=true",
    "-c",
    `core.autocrlf=${autocrlf ? "true" : "false"}`,
    source.root,
    clone.root,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`git clone ${source.root} failed: ${result.stderr.trim()}`);
  }
  return clone;
}

/** Counts the bytes, so a CRLF checkout is asserted where it lands on disk. */
async function lineEndings(file: string): Promise<LineEndings> {
  const bytes = await readFile(file);
  let crlf = 0;
  let lf = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0x0a) continue;
    if (index > 0 && bytes[index - 1] === 0x0d) crlf += 1;
    else lf += 1;
  }
  if (crlf === 0) return "lf";
  return lf === 0 ? "crlf" : "mixed";
}

async function buildJson(cwd: string): Promise<{ run: RunCliResult; json: BuildJson }> {
  const run = await runCli(["build", "--json"], { cwd, tty: false });
  return { run, json: JSON.parse(run.stdout) as BuildJson };
}

async function checkJson(cwd: string): Promise<{ run: RunCliResult; json: CheckJson }> {
  const run = await runCli(["check", "--json"], { cwd, tty: false });
  return { run, json: JSON.parse(run.stdout) as CheckJson };
}

/** The recipe from Building: Repeatability, with `npx @seasb/metafab` run in process. */
async function expectRecipePasses(cwd: string): Promise<void> {
  const build = await runCli(["build"], { cwd, tty: false });
  expect(build.code, build.stderr).toBe(ExitCode.Ok);

  const diff = await runGit(["diff", "--exit-code", "--", ...RECIPE_PATHS], { cwd });
  expect(diff.exitCode, `${diff.stdout}${diff.stderr}`).toBe(ExitCode.Ok);

  const check = await checkJson(cwd);
  expect(check.run.code, check.run.stderr).toBe(ExitCode.Ok);
  expect(check.json.exitCode).toBe(ExitCode.Ok);
  expect(check.json.problems?.filter((problem) => problem.level === "error") ?? []).toEqual([]);

  // A second run with unchanged inputs makes no changes (Building: Repeatability).
  const again = await buildJson(cwd);
  expect(again.run.code, again.run.stderr).toBe(ExitCode.Ok);
  expect(again.json.changed).toEqual([]);
}

describe("ci recipe against mark4-like", { timeout: 60_000 }, () => {
  // Each case clones and builds several times, which is slow on Windows runners,
  // so the setup gets the same budget as the case.
  beforeEach(async () => {
    repos.length = 0;
    env = await isolateGitConfig();
    plain = await makeTeam();
    eol = await makeTeam({ eol: true });
  }, 60_000);

  afterEach(async () => {
    if (env !== undefined) {
      env.restore();
      await rm(env.dir, { recursive: true, force: true });
    }
    await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
  });

  test("the recipe passes in an LF checkout", async () => {
    const clone = await cloneTeam(plain, false, "lf");
    expect(await lineEndings(clone.path("AGENTS.md"))).toBe("lf");
    expect(await lineEndings(clone.path(".factory", "AGENTS.md"))).toBe("lf");
    await expectRecipePasses(clone.root);
  });

  test("the recipe passes in a CRLF checkout with the eol=lf lines", async () => {
    const clone = await cloneTeam(eol, true, "crlf eol");
    // The eol=lf lines keep `.factory/` LF; the root files are not matched, so Git converts them.
    expect(await lineEndings(clone.path("AGENTS.md"))).toBe("crlf");
    expect(await lineEndings(clone.path("CLAUDE.md"))).toBe("crlf");
    expect(await lineEndings(clone.path(".factory", "AGENTS.md"))).toBe("lf");
    await expectRecipePasses(clone.root);
  });

  test("the recipe passes in a CRLF checkout without the eol=lf lines", async () => {
    const clone = await cloneTeam(plain, true, "crlf plain");
    expect(await lineEndings(clone.path("AGENTS.md"))).toBe("crlf");
    expect(await lineEndings(clone.path(".factory", "AGENTS.md"))).toBe("crlf");
    await expectRecipePasses(clone.root);
  });

  test("a stale committed AGENTS.md block makes git diff exit 1 after build", async () => {
    // Edit the source and commit without a rebuild: the committed block is stale.
    const source = plain.path(".factory", "AGENTS.md");
    await writeFile(source, `${await readFile(source, "utf8")}\nA note added without a rebuild.\n`);
    await teamGitOk(plain.root, "add", "-A");
    await teamGitOk(plain.root, "commit", "--quiet", "-m", "stale block");

    for (const autocrlf of [false, true]) {
      const clone = await cloneTeam(plain, autocrlf, autocrlf ? "stale crlf" : "stale lf");

      const build = await runCli(["build"], { cwd: clone.root, tty: false });
      expect(build.code, build.stderr).toBe(ExitCode.Ok);

      const diff = await runGit(["diff", "--exit-code", "--", ...RECIPE_PATHS], { cwd: clone.root });
      expect(diff.exitCode, `${diff.stdout}${diff.stderr}`).toBe(ExitCode.Failed);

      const names = await runGit(["diff", "--name-only"], { cwd: clone.root });
      expect(names.stdout.split("\n").filter((line) => line !== "")).toEqual(["AGENTS.md"]);
    }
  });

  test("check reports an edited installed skill with a / separated file and a fix", async () => {
    const clone = await cloneTeam(plain, false, "stale skill");
    const build = await runCli(["build"], { cwd: clone.root, tty: false });
    expect(build.code, build.stderr).toBe(ExitCode.Ok);

    const installed = clone.path(INSTALLED_SKILL);
    await writeFile(installed, `${await readFile(installed, "utf8")}\nEdited by hand.\n`);

    const check = await checkJson(clone.root);
    expect(check.run.code, check.run.stderr).toBe(ExitCode.Failed);
    expect(check.json.exitCode).toBe(ExitCode.Failed);

    const errors = check.json.problems?.filter((problem) => problem.level === "error") ?? [];
    expect(errors.length).toBeGreaterThan(0);
    for (const problem of errors) {
      expect(problem.file).not.toContain("\\");
      expect(problem.fix).toBeTruthy();
    }
    const problem = errors.find((entry) => entry.file === INSTALLED_SKILL);
    expect(problem, `no problem names ${INSTALLED_SKILL}: ${check.run.stdout}`).toBeDefined();
  });

  test("an executable skill file installs with mode 0755 on POSIX", async () => {
    const clone = await cloneTeam(plain, false, "executable");
    const build = await runCli(["build"], { cwd: clone.root, tty: false });
    expect(build.code, build.stderr).toBe(ExitCode.Ok);

    if (process.platform === "win32") {
      // On Windows only content is compared (Building: Repeatability).
      const check = await runCli(["check"], { cwd: clone.root, tty: false });
      expect(check.code, check.stderr).toBe(ExitCode.Ok);
      return;
    }

    const installed = clone.path(".claude", "skills", "git-conventions", "run.sh");
    expect((await stat(installed)).mode & 0o777).toBe(0o755);
  });

  test("a skill file whose installed path is at least 300 characters builds and checks", async () => {
    // Directories of 40 characters each, so the installed path clears 300 on every
    // operating system; Git for Windows needs core.longpaths=true to check it out.
    const segments = Array.from({ length: 7 }, (_, index) =>
      `deep-${String(index + 1).padStart(2, "0")}`.padEnd(40, "-"),
    );
    const nested = [..."skills/git-conventions".split("/"), ...segments].join("/");
    const team = await makeTeam({ files: { [`.factory/${nested}/notes.md`]: "# Deep note\n" } });

    const teamCheck = await runCli(["check"], { cwd: team.root, tty: false });
    expect(teamCheck.code, teamCheck.stderr).toBe(ExitCode.Ok);

    const clone = await cloneTeam(team, false, "long paths");
    const build = await runCli(["build"], { cwd: clone.root, tty: false });
    expect(build.code, build.stderr).toBe(ExitCode.Ok);

    const check = await runCli(["check"], { cwd: clone.root, tty: false });
    expect(check.code, check.stderr).toBe(ExitCode.Ok);

    const source = team.path(...`.factory/${nested}/notes.md`.split("/"));
    const installed = clone.path(".claude", "skills", "git-conventions", ...segments, "notes.md");
    expect(path.resolve(installed).length).toBeGreaterThanOrEqual(300);
    expect((await readFile(installed)).equals(await readFile(source))).toBe(true);
  });

  test("a global core.autocrlf=true does not change the LF case", async () => {
    // A developer's own configuration sets autocrlf; the clone's own setting must win.
    await writeFile(path.join(env.dir, "global.gitconfig"), "[core]\n\tautocrlf = true\n");

    const clone = await cloneTeam(plain, false, "global autocrlf lf");
    const local = await runGit(["config", "--local", "--get", "core.autocrlf"], { cwd: clone.root });
    expect(local.stdout.trim()).toBe("false");

    expect(await lineEndings(clone.path("AGENTS.md"))).toBe("lf");
    expect(await lineEndings(clone.path(".factory", "AGENTS.md"))).toBe("lf");
    await expectRecipePasses(clone.root);
  });
});
