import { afterEach, describe, expect, it } from "vitest";
import type { Problem } from "../../../src/errors.js";
import { runCli } from "../../helpers/runCli.js";
import type { TempRepo } from "../../helpers/makeRepo.js";
import { makePublishRepo } from "./fixtures.js";

interface PublishJson {
  ok: boolean;
  command: string;
  exitCode: number;
  problems?: Problem[];
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function track(repo: TempRepo): TempRepo {
  cleanups.push(() => repo.cleanup());
  return repo;
}

function parsed(stdout: string): PublishJson {
  return JSON.parse(stdout) as PublishJson;
}

const PUBLISH_WITH_EXCLUDE = [
  "publish:",
  '  name: "@seasb/fab-imports"',
  "  version: 1.2.0",
  "  exclude:",
  "    - partials/x.md",
  "",
].join("\n");

const FACTORY_YAML = [
  "format: 2",
  "name: demo",
  "description: A demo factory.",
  "pipeline:",
  "  - plan",
  "  - build: { stop: The lead approves the result }",
  "",
].join("\n");

const PLAN_SKILL = [
  "---",
  "name: plan",
  "description: Plan a slice. Use when starting.",
  "---",
  "",
  "# Plan",
  "",
  "<!-- factory:import ../../partials/x.md -->",
  "",
].join("\n");

describe("publish with imports", () => {
  it("refuses a dry run when an exclude removes an imported partial", async () => {
    const repo = track(
      await makePublishRepo({
        publish: PUBLISH_WITH_EXCLUDE,
        files: {
          ".factory/factory.yaml": FACTORY_YAML,
          ".factory/partials/x.md": "# Shared\n\nShared text.\n",
          ".factory/workflows/plan/SKILL.md": PLAN_SKILL,
        },
      }),
    );

    const built = await runCli(["build"], { cwd: repo.root });
    expect(built.code).toBe(0);

    const result = await runCli(["publish", "--dry-run", "--json"], { cwd: repo.root });
    const json = parsed(result.stdout);

    expect(result.code).toBe(4);
    expect(json).toMatchObject({ ok: false, command: "publish", exitCode: 4 });
    expect(json.problems).toEqual([
      {
        level: "error",
        file: ".factory/workflows/plan/SKILL.md",
        line: 8,
        message: 'Import "../../partials/x.md" does not exist',
        fix: "Add the file, or write the path of a file in .factory/",
      },
    ]);
  });
});
