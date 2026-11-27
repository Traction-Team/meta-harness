import { describe, expect, test } from "vitest";
import { loadFactory } from "../../../src/core/factory/index.js";
import type { Problem } from "../../../src/errors.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { RepoFiles } from "../../helpers/makeRepo.js";

const FACTORY_YAML = [
  "format: 2",
  "name: demo",
  "",
  "env:",
  "  harness:",
  "    values: [opencode, amp]",
  "",
].join("\n");

const AUTOMATION = [
  "---",
  'owner: "*"',
  "triggers:",
  '  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }',
  "---",
  "",
].join("\n");

async function loadProblems(files: RepoFiles): Promise<Problem[]> {
  const repo = await makeRepo({ ".factory/factory.yaml": FACTORY_YAML, ...files });
  try {
    const factory = await loadFactory(repo.root);
    return factory.problems;
  } finally {
    await repo.cleanup();
  }
}

describe("directives in run.md", () => {
  test("reports an unclosed block with its file and line", async () => {
    const problems = await loadProblems({
      ".factory/automations/run.md": [
        "# Run instructions",
        "",
        "<!-- factory:when env.harness == amp -->",
        "Ask first.",
        "",
      ].join("\n"),
    });

    expect(problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/run.md",
        line: 3,
        message: "factory:when on line 3 is never closed in this file",
        fix: "Add <!-- factory:endwhen --> in the same file",
      },
    ]);
  });

  test("reports an import that leaves .factory/", async () => {
    const problems = await loadProblems({
      ".factory/automations/run.md": [
        "# Run instructions",
        "",
        "<!-- factory:import ../../outside.md -->",
        "",
      ].join("\n"),
    });

    expect(problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/run.md",
        line: 3,
        message: 'Import "../../outside.md" leaves .factory/',
        fix: "Import a file inside .factory/",
      },
    ]);
  });
});

describe("directives in an automation body", () => {
  test("reports an unclosed block on its line in the file, not the body", async () => {
    const problems = await loadProblems({
      ".factory/automations/intake/automation.md":
        `${AUTOMATION}\n# intake\n\n<!-- factory:when env.harness == amp -->\nAsk first.\n`,
    });

    expect(problems).toEqual([
      {
        level: "error",
        file: ".factory/automations/intake/automation.md",
        line: 9,
        message: "factory:when on line 9 is never closed in this file",
        fix: "Add <!-- factory:endwhen --> in the same file",
      },
    ]);
  });

  test("reports a directive in the frontmatter", async () => {
    // The block scalar keeps the YAML valid, so the directive line itself is
    // what is reported; the multi-line description is a separate problem.
    const problems = await loadProblems({
      ".factory/automations/intake/automation.md": [
        "---",
        'owner: "*"',
        "triggers:",
        '  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }',
        "description: |",
        "  <!-- factory:when env.harness == amp -->",
        "---",
        "",
        "Body.",
        "",
      ].join("\n"),
    });

    expect(problems).toContainEqual({
      level: "error",
      file: ".factory/automations/intake/automation.md",
      line: 6,
      message: "Directives are not allowed in frontmatter",
      fix: "Move the directive below the closing ---; name and description stay the same in every environment",
    });
  });
});
