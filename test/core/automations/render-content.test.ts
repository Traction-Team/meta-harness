import { describe, expect, test } from "vitest";
import { runCheck } from "../../../src/core/check/index.js";
import { parseMarkdown } from "../../../src/core/env/directives.js";
import type { MarkdownDocument } from "../../../src/core/env/directives.js";
import { createImportCache } from "../../../src/core/env/imports.js";
import { renderDocument, rendersContent } from "../../../src/core/env/render.js";
import { allValues } from "../../../src/core/env/scenarios.js";
import type { EnvSelection, EnvVariable } from "../../../src/core/env/types.js";
import { loadFactory } from "../../../src/core/factory/index.js";
import type { Problem } from "../../../src/errors.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";

const VARIABLES: EnvVariable[] = [
  {
    name: "harness",
    values: [
      { name: "opencode", label: "In OpenCode", line: 1 },
      { name: "amp", label: "In Amp", line: 2 },
    ],
    line: 1,
  },
];

/** A cache whose factory is not on disk: these documents import nothing. */
const IMPORTS = createImportCache("/nonexistent/.factory");

const FILE = ".factory/automations/intake/automation.md";

async function document(text: string): Promise<MarkdownDocument> {
  const parsed = await parseMarkdown(text, {
    file: FILE,
    firstLine: 1,
    variables: VARIABLES,
    imports: IMPORTS,
    route: "automations/intake/automation.md",
  });
  expect(parsed.problems).toEqual([]);
  return parsed;
}

function lines(...text: string[]): string {
  return text.join("\n");
}

const BLANK_WHEN = lines(
  "<!-- factory:when env.harness == amp -->",
  "",
  "<!-- factory:endwhen -->",
  "",
);

const BLANK_SWITCH = lines(
  "<!-- factory:switch env.harness -->",
  "<!-- factory:case opencode -->",
  "",
  "<!-- factory:case amp -->",
  "",
  "<!-- factory:endswitch -->",
  "",
);

const AMP_ONLY = lines(
  "<!-- factory:when env.harness == amp -->",
  "Amp only.",
  "<!-- factory:endwhen -->",
  "",
);

describe("rendersContent", () => {
  test("is false for a when block holding only blank lines, which still renders its label", async () => {
    const parsed = await document(BLANK_WHEN);
    const context = { variables: VARIABLES, selection: allValues(VARIABLES) };

    expect(renderDocument(parsed, context)).toContain("**In Amp:**");
    expect(rendersContent(parsed, context)).toBe(false);
  });

  test("is false for a switch whose cases hold only blank lines, which still render their labels", async () => {
    const parsed = await document(BLANK_SWITCH);
    const context = { variables: VARIABLES, selection: allValues(VARIABLES) };
    const rendered = renderDocument(parsed, context);

    expect(rendered).toContain("**In OpenCode:**");
    expect(rendered).toContain("**In Amp:**");
    expect(rendersContent(parsed, context)).toBe(false);
  });

  test("is true for one non-blank line inside a block that applies to only some values", async () => {
    const parsed = await document(AMP_ONLY);

    expect(rendersContent(parsed, { variables: VARIABLES, selection: allValues(VARIABLES) })).toBe(
      true,
    );
  });

  test("is false for a block that applies to none", async () => {
    const parsed = await document(AMP_ONLY);
    const selection: EnvSelection = new Map([["harness", ["opencode"]]]);

    expect(rendersContent(parsed, { variables: VARIABLES, selection })).toBe(false);
  });
});

const FACTORY_YAML = lines(
  "format: 2",
  "name: demo",
  "",
  "env:",
  "  harness:",
  "    values: [opencode, amp]",
  "",
);

/** Five frontmatter lines, so the body starts on line 6. */
const FRONTMATTER = lines(
  "---",
  'owner: "*"',
  "triggers:",
  '  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }',
  "---",
  "",
);

async function tempFactory(files: RepoFiles): Promise<TempRepo> {
  return makeRepo({ ".factory/factory.yaml": FACTORY_YAML, ...files });
}

/** The factory's own problems, as `check` collects them first. */
async function loadProblems(files: RepoFiles): Promise<Problem[]> {
  const repo = await tempFactory(files);
  try {
    const factory = await loadFactory(repo.root);
    return factory.problems;
  } finally {
    await repo.cleanup();
  }
}

async function checkProblems(files: RepoFiles): Promise<Problem[]> {
  const repo = await tempFactory(files);
  try {
    return await runCheck(repo.root, "2.0.0");
  } finally {
    await repo.cleanup();
  }
}

function errorsOf(problems: readonly Problem[]): Problem[] {
  return problems.filter((problem) => problem.level === "error");
}

describe("check's empty-body rule", () => {
  test("reports a body that is only a when block holding blank lines", async () => {
    const problems = await checkProblems({
      ".factory/automations/blank-when/automation.md": FRONTMATTER + BLANK_WHEN,
    });

    expect(errorsOf(problems)).toEqual([
      {
        level: "error",
        file: ".factory/automations/blank-when/automation.md",
        line: 6,
        message: "The body of blank-when is empty",
        fix: "Write what the run does in the body, below the frontmatter",
      },
    ]);
  });

  test("reports a body that is only a switch whose cases hold blank lines", async () => {
    const problems = await checkProblems({
      ".factory/automations/blank-switch/automation.md": FRONTMATTER + BLANK_SWITCH,
    });

    expect(errorsOf(problems)).toEqual([
      {
        level: "error",
        file: ".factory/automations/blank-switch/automation.md",
        line: 6,
        message: "The body of blank-switch is empty",
        fix: "Write what the run does in the body, below the frontmatter",
      },
    ]);
  });

  test("reports a body that is only the automation's own heading", async () => {
    const problems = await checkProblems({
      ".factory/automations/intake/automation.md": FRONTMATTER + lines("# intake", ""),
    });

    expect(errorsOf(problems)).toContainEqual({
      level: "error",
      file: ".factory/automations/intake/automation.md",
      line: 6,
      message: "The body of intake is empty",
      fix: "Write what the run does in the body, below the frontmatter",
    });
  });

  test("accepts a body that starts with the automation's own heading and then has text", async () => {
    const problems = await loadProblems({
      ".factory/automations/intake/automation.md":
        FRONTMATTER + lines("# intake", "", "Triage the backlog.", ""),
    });

    expect(problems).toEqual([]);
  });

  test("accepts a body with one line that applies to only some values", async () => {
    const problems = await loadProblems({
      ".factory/automations/intake/automation.md": FRONTMATTER + AMP_ONLY,
    });

    expect(problems).toEqual([]);
  });

  test("reports an empty body when the frontmatter has no valid owner", async () => {
    const problems = await checkProblems({
      ".factory/automations/intake/automation.md": lines(
        "---",
        "description: Only a description",
        "---",
        "",
      ),
    });

    expect(errorsOf(problems)).toContainEqual({
      level: "error",
      file: ".factory/automations/intake/automation.md",
      line: 4,
      message: "The body of intake is empty",
      fix: "Write what the run does in the body, below the frontmatter",
    });
  });
});
