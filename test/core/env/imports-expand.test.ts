import { mkdir, readFile, realpath, symlink } from "node:fs/promises";
import { afterEach, describe, expect, test, vi } from "vitest";
import { planBuild } from "../../../src/core/build/index.js";
import { loadConfig } from "../../../src/core/config/load.js";
import { parseMarkdown } from "../../../src/core/env/directives.js";
import type { MarkdownDocument } from "../../../src/core/env/directives.js";
import { createImportCache } from "../../../src/core/env/imports.js";
import type { ImportCache } from "../../../src/core/env/imports.js";
import { markdownParts } from "../../../src/core/env/markdown.js";
import { renderDocument } from "../../../src/core/env/render.js";
import { resolveSelection } from "../../../src/core/env/select.js";
import type { EnvSelection, EnvVariable } from "../../../src/core/env/types.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

const WINDOWS = process.platform === "win32";

const HARNESS: EnvVariable[] = [
  {
    name: "harness",
    values: [
      { name: "opencode", label: "In OpenCode", line: 1 },
      { name: "claude", label: "In Claude Code", line: 2 },
      { name: "amp", label: "In Amp", line: 3 },
    ],
    line: 1,
  },
];

const CYCLE_FIX = "Remove one of these imports, so the chain does not lead back to itself";
const MISSING_FIX = "Add the file, or write the path of a file in .factory/";
const FRONTMATTER_FIX =
  "Move the directive below the closing ---; name and description stay the same in every environment";
const COMBINATION_FIX = "Import it outside the enclosing blocks, or split the condition";

const SUB_AGENTS = [
  "---",
  "title: Sub-agents",
  "---",
  "Start a sub-agent.",
  "<!-- factory:switch env.harness -->",
  "<!-- factory:case opencode -->",
  "Run opencode run.",
  "<!-- factory:case claude -->",
  "Run claude -p.",
  "<!-- factory:case amp -->",
  "Start an Amp thread.",
  "<!-- factory:endswitch -->",
  "",
].join("\n");

function workflowImporting(argument: string): string {
  return [
    "---",
    "name: build-plan",
    "description: Build a plan. Use when building one.",
    "---",
    "",
    "# Build plan",
    "",
    `<!-- factory:import ${argument} -->`,
    "After the import.",
    "",
  ].join("\n");
}

const WORKFLOW = workflowImporting("../../partials/sub-agents.md");

const repos: TempRepo[] = [];

function track(repo: TempRepo): TempRepo {
  repos.push(repo);
  return repo;
}

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

async function repoWith(files: RepoFiles): Promise<TempRepo> {
  return track(await makeRepo(files));
}

function cacheOf(repo: TempRepo): ImportCache {
  return createImportCache(repo.path(".factory"));
}

/** Parses a file the way `build` and `check` do: its body, below any frontmatter. */
async function parseBody(
  repo: TempRepo,
  display: string,
  options: { variables?: readonly EnvVariable[]; cache?: ImportCache } = {},
): Promise<MarkdownDocument> {
  const text = await readFile(repo.path(...display.split("/")), "utf8");
  const parts = markdownParts(text);
  return parseMarkdown(parts.body, {
    file: display,
    firstLine: parts.firstLine,
    variables: options.variables ?? HARNESS,
    imports: options.cache ?? cacheOf(repo),
    route: display.replace(/^\.factory\//, ""),
  });
}

function render(
  document: MarkdownDocument,
  values: Record<string, string[]>,
  variables: readonly EnvVariable[] = HARNESS,
): string {
  const selection: EnvSelection = new Map(Object.entries(values));
  return renderDocument(document, { variables, selection });
}

describe("import expansion", () => {
  test("a workflow imports a partial whose switch renders only the selected case", async () => {
    const repo = await repoWith({
      ".factory/workflows/build-plan/SKILL.md": WORKFLOW,
      ".factory/partials/sub-agents.md": SUB_AGENTS,
    });

    const document = await parseBody(repo, ".factory/workflows/build-plan/SKILL.md");
    expect(document.problems).toEqual([]);

    // The partial's frontmatter is gone, its switch keeps one case, and the
    // import replaces exactly one line: no blank line is added.
    expect(render(document, { harness: ["amp"] })).toBe(
      [
        "",
        "# Build plan",
        "",
        "Start a sub-agent.",
        "Start an Amp thread.",
        "After the import.",
        "",
      ].join("\n"),
    );
  });

  test("two selected values keep both cases, each labelled", async () => {
    const repo = await repoWith({
      ".factory/workflows/build-plan/SKILL.md": WORKFLOW,
      ".factory/partials/sub-agents.md": SUB_AGENTS,
    });

    const document = await parseBody(repo, ".factory/workflows/build-plan/SKILL.md");

    expect(render(document, { harness: ["opencode", "amp"] })).toBe(
      [
        "",
        "# Build plan",
        "",
        "Start a sub-agent.",
        "**In OpenCode:**",
        "Run opencode run.",
        "**In Amp:**",
        "Start an Amp thread.",
        "After the import.",
        "",
      ].join("\n"),
    );
  });

  test("a partial imports another, resolved from its own route", async () => {
    const repo = await repoWith({
      ".factory/workflows/build-plan/SKILL.md": [
        "---",
        "name: build-plan",
        "description: Build a plan. Use when building one.",
        "---",
        "",
        "# Build plan",
        "",
        "<!-- factory:import ../../partials/one.md -->",
        "End.",
        "",
      ].join("\n"),
      ".factory/partials/one.md": "One.\n<!-- factory:import ./two.md -->\n",
      ".factory/partials/two.md": "Two.\n",
    });

    const document = await parseBody(repo, ".factory/workflows/build-plan/SKILL.md");

    expect(document.problems).toEqual([]);
    expect(render(document, { harness: ["amp"] })).toBe("\n# Build plan\n\nOne.\nTwo.\nEnd.\n");
  });

  test("an import inside a case branch is expanded for that case only", async () => {
    const repo = await repoWith({
      ".factory/workflows/build-plan/SKILL.md": [
        "---",
        "name: build-plan",
        "description: Build a plan. Use when building one.",
        "---",
        "",
        "# Build plan",
        "",
        "<!-- factory:switch env.harness -->",
        "<!-- factory:case opencode -->",
        "OpenCode steps.",
        "<!-- factory:case claude -->",
        "Claude steps.",
        "<!-- factory:case amp -->",
        "<!-- factory:import ../../partials/amp.md -->",
        "<!-- factory:endswitch -->",
        "",
      ].join("\n"),
      ".factory/partials/amp.md": "Start an Amp thread.\n",
    });

    const document = await parseBody(repo, ".factory/workflows/build-plan/SKILL.md");

    expect(document.problems).toEqual([]);
    expect(render(document, { harness: ["amp"] })).toBe(
      "\n# Build plan\n\nStart an Amp thread.\n",
    );
    expect(render(document, { harness: ["opencode"] })).toBe("\n# Build plan\n\nOpenCode steps.\n");
  });

  test("a loop of two files is one error listing the chain, on the line that closes it", async () => {
    const repo = await repoWith({
      ".factory/workflows/build-plan/SKILL.md": workflowImporting("../../partials/a.md"),
      ".factory/partials/a.md": "<!-- factory:import ./b.md -->\n",
      ".factory/partials/b.md": "B.\n<!-- factory:import ./a.md -->\n",
    });

    const document = await parseBody(repo, ".factory/workflows/build-plan/SKILL.md");

    expect(document.problems).toEqual([
      {
        level: "error",
        file: ".factory/partials/b.md",
        line: 2,
        message: "Import cycle: .factory/partials/a.md → .factory/partials/b.md → .factory/partials/a.md",
        fix: CYCLE_FIX,
      },
    ]);
  });

  test("a loop of three files lists all three", async () => {
    const repo = await repoWith({
      ".factory/workflows/build-plan/SKILL.md": workflowImporting("../../partials/a.md"),
      ".factory/partials/a.md": "<!-- factory:import ./b.md -->\n",
      ".factory/partials/b.md": "<!-- factory:import ./c.md -->\n",
      ".factory/partials/c.md": "<!-- factory:import ./a.md -->\n",
    });

    const document = await parseBody(repo, ".factory/workflows/build-plan/SKILL.md");

    expect(document.problems).toEqual([
      {
        level: "error",
        file: ".factory/partials/c.md",
        line: 1,
        message:
          "Import cycle: .factory/partials/a.md → .factory/partials/b.md → .factory/partials/c.md → .factory/partials/a.md",
        fix: CYCLE_FIX,
      },
    ]);
  });

  test("a diamond is not a loop: one partial imported through two others", async () => {
    const repo = await repoWith({
      ".factory/workflows/build-plan/SKILL.md": [
        "---",
        "name: build-plan",
        "description: Build a plan. Use when building one.",
        "---",
        "",
        "# Build plan",
        "",
        "<!-- factory:import ../../partials/a.md -->",
        "<!-- factory:import ../../partials/b.md -->",
        "End.",
        "",
      ].join("\n"),
      ".factory/partials/a.md": "A.\n<!-- factory:import ./c.md -->\n",
      ".factory/partials/b.md": "B.\n<!-- factory:import ./c.md -->\n",
      ".factory/partials/c.md": "Shared.\n",
    });

    const document = await parseBody(repo, ".factory/workflows/build-plan/SKILL.md");

    expect(document.problems).toEqual([]);
    expect(render(document, { harness: ["amp"] })).toBe(
      "\n# Build plan\n\nA.\nShared.\nB.\nShared.\nEnd.\n",
    );
  });

  test("an import inside a removed block is not inserted, but a missing one is still an error", async () => {
    const repo = await repoWith({
      ".factory/workflows/build-plan/SKILL.md": [
        "---",
        "name: build-plan",
        "description: Build a plan. Use when building one.",
        "---",
        "",
        "# Build plan",
        "",
        "<!-- factory:when env.harness == amp -->",
        "<!-- factory:import ../../partials/note.md -->",
        "<!-- factory:endwhen -->",
        "",
      ].join("\n"),
      ".factory/partials/note.md": "Only for Amp.\n",
    });

    const document = await parseBody(repo, ".factory/workflows/build-plan/SKILL.md");

    expect(document.problems).toEqual([]);
    expect(render(document, { harness: ["opencode"] })).toBe("\n# Build plan\n\n");
    expect(render(document, { harness: ["amp"] })).toBe("\n# Build plan\n\nOnly for Amp.\n");

    const missing = await repoWith({
      ".factory/workflows/build-plan/SKILL.md": [
        "---",
        "name: build-plan",
        "description: Build a plan. Use when building one.",
        "---",
        "",
        "# Build plan",
        "",
        "<!-- factory:when env.harness == amp -->",
        "<!-- factory:import ../../partials/missing.md -->",
        "<!-- factory:endwhen -->",
        "",
      ].join("\n"),
    });

    const broken = await parseBody(missing, ".factory/workflows/build-plan/SKILL.md");

    expect(broken.problems).toEqual([
      {
        level: "error",
        file: ".factory/workflows/build-plan/SKILL.md",
        line: 9,
        message: 'Import "../../partials/missing.md" does not exist',
        fix: MISSING_FIX,
      },
    ]);
  });
});

describe("import aliases", () => {
  test.skipIf(WINDOWS)("each route resolves its own nested import, and the file is read once", async () => {
    const repo = await repoWith({
      ".factory/workflows/build-plan/SKILL.md": [
        "---",
        "name: build-plan",
        "description: Build a plan. Use when building one.",
        "---",
        "",
        "# Build plan",
        "",
        "<!-- factory:import ../../a/link/x.md -->",
        "<!-- factory:import ../../b/link/x.md -->",
        "",
      ].join("\n"),
      ".factory/real/x.md": "<!-- factory:import ../n.md -->\nX.\n",
      ".factory/a/n.md": "From a.\n",
      ".factory/b/n.md": "From b.\n",
    });
    for (const name of ["a", "b"]) {
      await mkdir(repo.path(".factory", name), { recursive: true });
      await symlink("../real", repo.path(".factory", name, "link"), "dir");
    }

    const cache = cacheOf(repo);
    vi.mocked(readFile).mockClear();
    const document = await parseBody(repo, ".factory/workflows/build-plan/SKILL.md", { cache });

    expect(document.problems).toEqual([]);
    expect(render(document, { harness: ["amp"] })).toBe(
      "\n# Build plan\n\nFrom a.\nX.\nFrom b.\nX.\n",
    );

    const target = await realpath(repo.path(".factory", "real", "x.md"));
    const reads = vi
      .mocked(readFile)
      .mock.calls.filter(([file]) => String(file) === target);
    expect(reads).toHaveLength(1);
  });

  test.skipIf(WINDOWS)("a nested import missing through one route names that route", async () => {
    const repo = await repoWith({
      ".factory/workflows/build-plan/SKILL.md": [
        "---",
        "name: build-plan",
        "description: Build a plan. Use when building one.",
        "---",
        "",
        "# Build plan",
        "",
        "<!-- factory:import ../../a/link/x.md -->",
        "<!-- factory:import ../../b/link/x.md -->",
        "",
      ].join("\n"),
      ".factory/real/x.md": "<!-- factory:import ../n.md -->\nX.\n",
      ".factory/a/n.md": "From a.\n",
    });
    for (const name of ["a", "b"]) {
      await mkdir(repo.path(".factory", name), { recursive: true });
      await symlink("../real", repo.path(".factory", name, "link"), "dir");
    }

    const document = await parseBody(repo, ".factory/workflows/build-plan/SKILL.md");

    expect(document.problems).toEqual([
      {
        level: "error",
        file: ".factory/b/link/x.md",
        line: 1,
        message: 'Import "../n.md" does not exist',
        fix: MISSING_FIX,
      },
    ]);
    // The `a` route still resolves its own nested import; the `b` route keeps
    // the rest of its body and drops only the line it could not import.
    expect(render(document, { harness: ["amp"] })).toBe("\n# Build plan\n\nFrom a.\nX.\nX.\n");
  });
});

describe("imports in .factory/AGENTS.md", () => {
  test("render every case, labelled, in the root block", async () => {
    const repo = await repoWith({
      ".factory/factory.yaml": [
        "format: 2",
        "name: demo",
        "env:",
        "  harness:",
        "    values:",
        "      opencode: { label: In OpenCode }",
        "      claude: { label: In Claude Code }",
        "      amp: { label: In Amp }",
        "",
      ].join("\n"),
      ".factory/metafab.yaml": "agents: [codex]\nmetafab-skill: false\n",
      ".factory/AGENTS.md": "# Demo\n\n<!-- factory:import ./partials/sub-agents.md -->\n",
      ".factory/partials/sub-agents.md": SUB_AGENTS,
    });

    const { loadFactory } = await import("../../../src/core/factory/index.js");
    const factory = await loadFactory(repo.root);
    const config = await loadConfig(factory.dir);
    const selection = await resolveSelection(factory.factoryYaml?.env ?? [], {
      root: repo.root,
      options: ["harness=amp"],
      processEnv: {},
    });
    const plan = await planBuild(factory, config, "1.0.0", { selection });

    expect(plan.errors).toEqual([]);
    const text = plan.writes.find((entry) => entry.path === "AGENTS.md")?.content.toString("utf8");
    // The root block is the same for every developer, so every case appears,
    // labelled, whichever harness is selected locally.
    expect(text).toContain(
      [
        "# Demo",
        "",
        "Start a sub-agent.",
        "**In OpenCode:**",
        "Run opencode run.",
        "**In Claude Code:**",
        "Run claude -p.",
        "**In Amp:**",
        "Start an Amp thread.",
      ].join("\n"),
    );
    expect(text).not.toContain("factory:import");
    expect(text).not.toContain("title: Sub-agents");
  });
});

describe("import validation", () => {
  const FORMAT_TWO = [
    "format: 2",
    "name: demo",
    "env:",
    "  harness: { values: [opencode, amp] }",
    "",
  ].join("\n");

  function workflow(name: string, body: string): string {
    return [
      "---",
      `name: ${name}`,
      `description: ${name}. Use when testing.`,
      "---",
      "",
      `# ${name}`,
      "",
      body,
      "",
    ].join("\n");
  }

  test("a partial with an unbalanced when reports its own file and line once", async () => {
    const repo = await repoWith({
      ".factory/factory.yaml": FORMAT_TWO,
      ".factory/skills/a/SKILL.md": workflow("a", "<!-- factory:import ../../partials/broken.md -->"),
      ".factory/skills/b/SKILL.md": workflow("b", "<!-- factory:import ../../partials/broken.md -->"),
      ".factory/skills/c/SKILL.md": workflow("c", "<!-- factory:import ../../partials/broken.md -->"),
      ".factory/partials/broken.md": "# Broken\n\n<!-- factory:when env.harness == amp -->\nAmp.\n",
    });

    const { loadFactory } = await import("../../../src/core/factory/index.js");
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([
      {
        level: "error",
        file: ".factory/partials/broken.md",
        line: 3,
        message: "factory:when on line 3 is never closed in this file",
        fix: "Add <!-- factory:endwhen --> in the same file",
      },
    ]);
  });

  test("a directive in a partial's frontmatter reports once, and its body is still inserted", async () => {
    const repo = await repoWith({
      ".factory/factory.yaml": FORMAT_TWO,
      ".factory/skills/a/SKILL.md": workflow("a", "<!-- factory:import ../../partials/front.md -->"),
      ".factory/skills/b/SKILL.md": workflow("b", "<!-- factory:import ../../partials/front.md -->"),
      ".factory/partials/front.md": [
        "---",
        "title: Front",
        "<!-- factory:when env.harness == amp -->",
        "---",
        "Body line.",
        "",
      ].join("\n"),
    });

    const { loadFactory } = await import("../../../src/core/factory/index.js");
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([
      {
        level: "error",
        file: ".factory/partials/front.md",
        line: 3,
        message: "Directives are not allowed in frontmatter",
        fix: FRONTMATTER_FIX,
      },
    ]);

    const document = await parseBody(repo, ".factory/skills/a/SKILL.md");
    expect(render(document, { harness: ["amp"] })).toBe("\n# a\n\nBody line.\n");
  });

  test("a block inside an import may not push the importer over 1024 combinations", async () => {
    const variables = Array.from({ length: 11 }, (_, index) => `  v${index + 1}: { values: [a, b] }`);
    const condition = (from: number, to: number): string =>
      Array.from({ length: to - from + 1 }, (_, index) => `env.v${from + index} == a`).join(" and ");

    const repo = await repoWith({
      ".factory/factory.yaml": ["format: 2", "name: demo", "env:", ...variables, ""].join("\n"),
      ".factory/skills/inside/SKILL.md": workflow(
        "inside",
        ["<!-- factory:when " + condition(1, 5) + " -->", "<!-- factory:import ../../partials/six.md -->", "<!-- factory:endwhen -->"].join(
          "\n",
        ),
      ),
      ".factory/skills/top/SKILL.md": workflow("top", "<!-- factory:import ../../partials/six.md -->"),
      ".factory/partials/six.md": [
        `<!-- factory:when ${condition(6, 11)} -->`,
        "Six.",
        "<!-- factory:endwhen -->",
        "",
      ].join("\n"),
    });

    const { loadFactory } = await import("../../../src/core/factory/index.js");
    const factory = await loadFactory(repo.root);

    // The partial alone spans 64 combinations and the workflow's own block 32;
    // together they span 2048, so the import line is the error. The same
    // partial imported at top level is fine.
    expect(factory.problems).toEqual([
      {
        level: "error",
        file: ".factory/skills/inside/SKILL.md",
        line: 9,
        message:
          "Condition on line 1 of .factory/partials/six.md spans too many combinations here: 2048 over v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11; the limit is 1024",
        fix: COMBINATION_FIX,
      },
    ]);
  });

  test("copies an import line as text in a format 1 factory, warning once", async () => {
    const repo = await repoWith({
      ".factory/factory.yaml": "format: 1\nname: demo\n",
      ".factory/metafab.yaml": "agents: [codex]\nmetafab-skill: false\n",
      ".factory/skills/hello/SKILL.md": [
        "---",
        "name: hello",
        "description: Say hello. Use when testing the build.",
        "---",
        "",
        "# Hello",
        "",
        "<!-- factory:import ../../partials/sub-agents.md -->",
        "",
      ].join("\n"),
      ".factory/partials/sub-agents.md": SUB_AGENTS,
    });

    const { loadFactory } = await import("../../../src/core/factory/index.js");
    const factory = await loadFactory(repo.root);

    expect(factory.problems).toEqual([
      {
        level: "warning",
        file: ".factory/skills/hello/SKILL.md",
        line: 8,
        message: ".factory/skills/hello/SKILL.md has factory: directives, which need format: 2",
        fix: "Set format: 2 in .factory/factory.yaml, or remove the directives",
      },
    ]);

    const config = await loadConfig(factory.dir);
    const selection = await resolveSelection([], { root: repo.root, processEnv: {} });
    const plan = await planBuild(factory, config, "1.0.0", { selection });
    const installed = plan.writes.find((entry) => entry.path === ".agents/skills/hello/SKILL.md");

    expect(plan.errors).toEqual([]);
    // Format 1 copies directives as text, imports included.
    expect(installed?.content.toString("utf8")).toContain(
      "<!-- factory:import ../../partials/sub-agents.md -->",
    );
  });
});

describe("import errors", () => {
  test("two imports that do not resolve in one file give two problems", async () => {
    const repo = await repoWith({
      ".factory/workflows/build-plan/SKILL.md": [
        "---",
        "name: build-plan",
        "description: Build a plan. Use when building one.",
        "---",
        "",
        "# Build plan",
        "",
        "<!-- factory:import ../../partials/one.md -->",
        "<!-- factory:import ../../partials/two.md -->",
        "",
      ].join("\n"),
    });

    const document = await parseBody(repo, ".factory/workflows/build-plan/SKILL.md");

    expect(document.problems).toEqual([
      {
        level: "error",
        file: ".factory/workflows/build-plan/SKILL.md",
        line: 8,
        message: 'Import "../../partials/one.md" does not exist',
        fix: MISSING_FIX,
      },
      {
        level: "error",
        file: ".factory/workflows/build-plan/SKILL.md",
        line: 9,
        message: 'Import "../../partials/two.md" does not exist',
        fix: MISSING_FIX,
      },
    ]);
  });
});
