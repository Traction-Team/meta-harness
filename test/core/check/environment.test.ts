import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { applyBuild, planBuild } from "../../../src/core/build/index.js";
import { runCheck } from "../../../src/core/check/index.js";
import { loadConfig } from "../../../src/core/config/load.js";
import { resolveSelection } from "../../../src/core/env/index.js";
import { loadFactory } from "../../../src/core/factory/index.js";
import { copyFileWithMode, listFiles, pathExists } from "../../../src/util/fs.js";
import { runGit } from "../../../src/util/git.js";
import { isolateGitConfig } from "../hooks/helpers.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";

const require = createRequire(import.meta.url);
const PACKAGE_VERSION = (require("../../../package.json") as { version: string }).version;

const FIXTURE = fileURLToPath(new URL("../../fixtures/env/build", import.meta.url));

const repos: TempRepo[] = [];

function track(repo: TempRepo): TempRepo {
  repos.push(repo);
  return repo;
}

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

/** Copies the format 2 build fixture into a Git repository. */
async function fixtureRepo(): Promise<TempRepo> {
  const repo = track(await makeRepo({}, { git: true }));
  for (const relative of await listFiles(FIXTURE)) {
    await copyFileWithMode(
      path.join(FIXTURE, ...relative.split("/")),
      repo.path(...relative.split("/")),
    );
  }
  return repo;
}

/** Builds with the selection `--env` would give; without one, every value. */
async function build(root: string, env?: readonly string[]): Promise<void> {
  const factory = await loadFactory(root);
  const config = await loadConfig(factory.dir);
  const selection = await resolveSelection(factory.factoryYaml?.env ?? [], {
    root,
    options: env,
    processEnv: {},
  });
  await applyBuild(await planBuild(factory, config, PACKAGE_VERSION, { selection }));
}

const SKILL_DIFFERS = {
  level: "error",
  file: ".agents/skills/hello/SKILL.md",
  line: 1,
  message: ".agents/skills/hello/SKILL.md differs from the build output",
  fix: "Edit .factory/skills/hello/ instead, then run metafab build",
};

describe("runCheck with directives", () => {
  let isolation: Awaited<ReturnType<typeof isolateGitConfig>>;

  beforeEach(async () => {
    isolation = await isolateGitConfig();
  });

  afterEach(() => {
    isolation.restore();
  });

  test("reports a broken branch the selection removes", async () => {
    const skill = [
      "---",
      "name: hello",
      "description: Hello. Use when testing.",
      "---",
      "",
      "# Hello",
      "",
      "<!-- factory:when env.harness == amp -->",
      "<!-- factory:when env.harnes == amp -->",
      "Broken.",
      "<!-- factory:endwhen -->",
      "<!-- factory:endwhen -->",
      "",
    ].join("\n");
    const repo = track(
      await makeRepo({
        ".factory/factory.yaml":
          "format: 2\nname: demo\nenv:\n  harness: { values: [opencode, amp] }\n",
        ".factory/metafab.yaml": "agents: [codex]\nmetafab-skill: false\n",
        ".factory/skills/hello/SKILL.md": skill,
      }),
    );

    const problems = await runCheck(repo.root, PACKAGE_VERSION, { env: ["harness=opencode"] });

    expect(problems.filter((problem) => problem.level === "error")).toEqual([
      {
        level: "error",
        file: ".factory/skills/hello/SKILL.md",
        line: 9,
        message: 'Condition names unknown variable "harnes"',
        fix: 'Did you mean "harness"?',
      },
    ]);
  });

  test("reports drift until the output matches the selection", async () => {
    const repo = await fixtureRepo();
    await build(repo.root, ["harness=amp"]);

    expect(await runCheck(repo.root, PACKAGE_VERSION, { env: ["harness=amp"] })).toEqual([]);

    // No `--env` selects every value, so the installed copy built for Amp differs.
    expect(await runCheck(repo.root, PACKAGE_VERSION)).toContainEqual(SKILL_DIFFERS);

    // A selection written straight into Git config changes what check compares.
    await runGit(["config", "factory.env.harness", "opencode"], { cwd: repo.root });
    expect(await runCheck(repo.root, PACKAGE_VERSION)).toContainEqual(SKILL_DIFFERS);

    await build(repo.root);
    expect(await runCheck(repo.root, PACKAGE_VERSION)).toEqual([]);
  });

  test("does not report a skill its condition keeps out of the selection", async () => {
    const repo = await fixtureRepo();
    await build(repo.root, ["harness=opencode"]);

    expect(await pathExists(repo.path(".agents/skills/amp-threads"))).toBe(false);
    expect(await runCheck(repo.root, PACKAGE_VERSION, { env: ["harness=opencode"] })).toEqual([]);
    expect(await readFile(repo.path("AGENTS.md"), "utf8")).toContain("**In Amp:**");
  });
});
