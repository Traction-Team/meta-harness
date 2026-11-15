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
});
