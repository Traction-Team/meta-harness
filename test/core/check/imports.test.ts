import { createRequire } from "node:module";
import { afterEach, describe, expect, test } from "vitest";
import { runCheck } from "../../../src/core/check/index.js";
import { ExitCode } from "../../../src/errors.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";

const require = createRequire(import.meta.url);
const PACKAGE_VERSION = (require("../../../package.json") as { version: string }).version;

const repos: TempRepo[] = [];

function track(repo: TempRepo): TempRepo {
  repos.push(repo);
  return repo;
}

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

describe("check with imports", () => {
  test("reports a missing import on the directive's line and exits 1", async () => {
    const repo = track(
      await makeRepo({
        ".factory/factory.yaml": [
          "format: 2",
          "name: demo",
          "env:",
          "  harness: { values: [amp, claude] }",
          "",
        ].join("\n"),
        ".factory/metafab.yaml": "agents: [codex]\nmetafab-skill: false\n",
        ".factory/workflows/plan/SKILL.md": [
          "---",
          "name: plan",
          "description: Plan a slice. Use when starting.",
          "---",
          "",
          "# Plan",
          "",
          "<!-- factory:import ../../partials/missing.md -->",
          "",
        ].join("\n"),
      }),
    );

    const problems = await runCheck(repo.root, PACKAGE_VERSION, { env: ["harness=amp"] });

    expect(problems.filter((problem) => problem.level === "error")).toEqual([
      {
        level: "error",
        file: ".factory/workflows/plan/SKILL.md",
        line: 8,
        message: 'Import "../../partials/missing.md" does not exist',
        fix: "Add the file, or write the path of a file in .factory/",
      },
    ]);

    const result = await runCli(["check"], { cwd: repo.root, tty: false });

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain(
      '.factory/workflows/plan/SKILL.md:8: error: Import "../../partials/missing.md" does not exist',
    );
  });

  test("reports the combination limit across nested imports instead of rendering it", async () => {
    // Three files, eight two-value variables each: every file is within the
    // limit alone, but the blocks nest through the imports to 2^16 and 2^24.
    const variables = Array.from({ length: 24 }, (_, index) => `  v${index + 1}: { values: [a, b] }`);
    const condition = (from: number, to: number): string =>
      Array.from({ length: to - from + 1 }, (_, index) => `env.v${from + index} == a`).join(" and ");
    const named = (from: number, to: number): string =>
      Array.from({ length: to - from + 1 }, (_, index) => `v${from + index}`).join(", ");
    const block = (from: number, to: number, body: readonly string[]): string =>
      [
        `<!-- factory:when ${condition(from, to)} -->`,
        ...body,
        "<!-- factory:endwhen -->",
        "",
      ].join("\n");

    const repo = track(
      await makeRepo({
        ".factory/factory.yaml": ["format: 2", "name: demo", "env:", ...variables, ""].join("\n"),
        ".factory/metafab.yaml": "agents: [codex]\nmetafab-skill: false\n",
        ".factory/skills/inside/SKILL.md": [
          "---",
          "name: inside",
          "description: Inside. Use when inside.",
          "---",
          "",
          ...block(1, 8, ["<!-- factory:import ../../partials/p.md -->"]).split("\n"),
        ].join("\n"),
        ".factory/partials/p.md": block(9, 16, ["<!-- factory:import ./q.md -->"]),
        ".factory/partials/q.md": block(17, 24, ["Deep."]),
      }),
    );

    // No `--env`, so every variable keeps both values and rendering the three
    // blocks together would enumerate 2^24 scenarios. `check` reports the two
    // imports that pass the limit, and neither it nor `build` renders the file.
    const problems = await runCheck(repo.root, PACKAGE_VERSION);

    expect(problems.filter((problem) => problem.level === "error")).toEqual([
      {
        level: "error",
        file: ".factory/skills/inside/SKILL.md",
        line: 7,
        message: `Condition on line 1 of .factory/partials/p.md spans too many combinations here: 65536 over ${named(1, 16)}; the limit is 1024`,
        fix: "Import it outside the enclosing blocks, or split the condition",
      },
      {
        level: "error",
        file: ".factory/partials/p.md",
        line: 2,
        message: `Condition on line 1 of .factory/partials/q.md spans too many combinations here: 16777216 over ${named(1, 24)}; the limit is 1024`,
        fix: "Import it outside the enclosing blocks, or split the condition",
      },
    ]);

    const checked = await runCli(["check"], { cwd: repo.root, tty: false });
    expect(checked.code).toBe(ExitCode.Failed);

    const built = await runCli(["build"], { cwd: repo.root, tty: false });
    expect(built.code).toBe(ExitCode.Failed);
  });
});
