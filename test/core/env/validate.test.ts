import { describe, expect, test } from "vitest";
import { runCheck } from "../../../src/core/check/index.js";
import { loadFactory } from "../../../src/core/factory/index.js";
import type { Problem } from "../../../src/errors.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";

const FORMAT_TWO = [
  "format: 2",
  "name: demo",
  "",
  "env:",
  "  harness:",
  "    values: [opencode, amp]",
  "",
].join("\n");

const FORMAT_ONE = "format: 1\nname: demo\n";

const METAFAB_YAML = "agents: [codex]\nmetafab-skill: false\n";

const FRONTMATTER_FIX =
  "Move the directive below the closing ---; name and description stay the same in every environment";

function skill(body: string): string {
  return `---\nname: demo\ndescription: Demo. Use when testing.\n---\n${body}`;
}

async function load(files: RepoFiles): Promise<{ repo: TempRepo; problems: Problem[] }> {
  const repo = await makeRepo(files);
  try {
    const factory = await loadFactory(repo.root);
    return { repo, problems: factory.problems };
  } catch (error) {
    await repo.cleanup();
    throw error;
  }
}

function locations(problems: readonly Problem[]): [string, number | undefined][] {
  return problems.map((problem) => [problem.file, problem.line]);
}

describe("environmentProblems", () => {
  test("accepts valid directives in SKILL.md, a supporting file and AGENTS.md", async () => {
    const { repo, problems } = await load({
      ".factory/factory.yaml": FORMAT_TWO,
      ".factory/AGENTS.md":
        "<!-- factory:when env.harness == amp -->\nAmp notes.\n<!-- factory:endwhen -->\n",
      ".factory/skills/demo/SKILL.md": skill(
        [
          "",
          "# Demo",
          "",
          "<!-- factory:switch env.harness -->",
          "<!-- factory:case amp -->",
          "Amp.",
          "<!-- factory:case opencode -->",
          "OpenCode.",
          "<!-- factory:endswitch -->",
          "",
        ].join("\n"),
      ),
      ".factory/skills/demo/notes.md": [
        "# Notes",
        "",
        "<!-- factory:when env.harness == amp -->",
        "Amp only.",
        "<!-- factory:endwhen -->",
        "",
      ].join("\n"),
    });

    try {
      expect(problems).toEqual([]);
    } finally {
      await repo.cleanup();
    }
  });

  test("reports an unclosed when in SKILL.md below its frontmatter", async () => {
    const { repo, problems } = await load({
      ".factory/factory.yaml": FORMAT_TWO,
      ".factory/skills/demo/SKILL.md": skill(
        "\n# Demo\n\n<!-- factory:when env.harness == amp -->\nAmp.\n",
      ),
    });

    try {
      expect(problems).toEqual([
        {
          level: "error",
          file: ".factory/skills/demo/SKILL.md",
          line: 8,
          message: "factory:when on line 8 is never closed in this file",
          fix: "Add <!-- factory:endwhen --> in the same file",
        },
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  test("reports a bad condition in a supporting file", async () => {
    const { repo, problems } = await load({
      ".factory/factory.yaml": FORMAT_TWO,
      ".factory/skills/demo/SKILL.md": skill("\n# Demo\n"),
      ".factory/skills/demo/notes.md":
        "# Notes\n\n<!-- factory:when env.harnes == amp -->\n<!-- factory:endwhen -->\n",
    });

    try {
      expect(problems).toEqual([
        {
          level: "error",
          file: ".factory/skills/demo/notes.md",
          line: 3,
          message: 'Condition names unknown variable "harnes"',
          fix: 'Did you mean "harness"?',
        },
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  test("reports a directive in SKILL.md frontmatter", async () => {
    const { repo, problems } = await load({
      ".factory/factory.yaml": FORMAT_TWO,
      ".factory/skills/demo/SKILL.md": [
        "---",
        "name: demo",
        "description: Demo. Use when testing.",
        "note: |",
        "  <!-- factory:when env.harness == amp -->",
        "---",
        "",
        "# Demo",
        "",
      ].join("\n"),
    });

    try {
      expect(problems).toEqual([
        {
          level: "error",
          file: ".factory/skills/demo/SKILL.md",
          line: 5,
          message: "Directives are not allowed in frontmatter",
          fix: FRONTMATTER_FIX,
        },
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  test("reports a directive in a supporting file's frontmatter", async () => {
    const { repo, problems } = await load({
      ".factory/factory.yaml": FORMAT_TWO,
      ".factory/skills/demo/SKILL.md": skill("\n# Demo\n"),
      ".factory/skills/demo/notes.md": [
        "---",
        "title: Notes",
        "<!-- factory:when env.harness == amp -->",
        "---",
        "",
        "# Notes",
        "",
      ].join("\n"),
    });

    try {
      expect(problems).toEqual([
        {
          level: "error",
          file: ".factory/skills/demo/notes.md",
          line: 3,
          message: "Directives are not allowed in frontmatter",
          fix: FRONTMATTER_FIX,
        },
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  test("warns once per file that has a directive in a format 1 factory", async () => {
    const { repo, problems } = await load({
      ".factory/factory.yaml": FORMAT_ONE,
      ".factory/AGENTS.md": "<!-- factory:when env.harness == amp -->\nAmp notes.\n",
      ".factory/skills/demo/SKILL.md": skill(
        "\n# Demo\n\n<!-- factory:when env.harness == amp -->\nAmp.\n<!-- factory:endwhen -->\n",
      ),
      ".factory/skills/demo/notes.md":
        "# Notes\n\n<!-- factory:when env.harness == amp -->\n<!-- factory:endwhen -->\n",
    });

    try {
      expect(problems).toHaveLength(3);
      expect(problems.map((problem) => problem.level)).toEqual(["warning", "warning", "warning"]);
      expect(locations(problems).sort()).toEqual([
        [".factory/AGENTS.md", 1],
        [".factory/skills/demo/SKILL.md", 8],
        [".factory/skills/demo/notes.md", 3],
      ]);
      expect(problems[0]!.message).toBe(
        ".factory/skills/demo/SKILL.md has factory: directives, which need format: 2",
      );
      expect(problems[0]!.fix).toBe(
        "Set format: 2 in .factory/factory.yaml, or remove the directives",
      );
    } finally {
      await repo.cleanup();
    }
  });

  test("a directive only inside a fence gives no warning", async () => {
    const { repo, problems } = await load({
      ".factory/factory.yaml": FORMAT_ONE,
      ".factory/skills/demo/SKILL.md": skill("\n# Demo\n"),
      ".factory/skills/demo/notes.md": [
        "# Notes",
        "",
        "```markdown",
        "<!-- factory:when env.harness == amp -->",
        "```",
        "",
      ].join("\n"),
    });

    try {
      expect(problems).toEqual([]);
    } finally {
      await repo.cleanup();
    }
  });

  test("a factory without factory.yaml is format 1 for directives", async () => {
    const { repo, problems } = await load({
      ".factory/skills/demo/SKILL.md": skill(
        "\n# Demo\n\n<!-- factory:when env.harness == amp -->\nAmp.\n<!-- factory:endwhen -->\n",
      ),
    });

    try {
      expect(problems).toEqual([
        {
          level: "warning",
          file: ".factory/skills/demo/SKILL.md",
          line: 8,
          message: ".factory/skills/demo/SKILL.md has factory: directives, which need format: 2",
          fix: "Set format: 2 in .factory/factory.yaml, or remove the directives",
        },
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  test("reports an AGENTS.md directive problem in a format 2 factory", async () => {
    const { repo, problems } = await load({
      ".factory/factory.yaml": FORMAT_TWO,
      ".factory/AGENTS.md": "# Demo factory\n\n<!-- factory:switch env.harness -->\n<!-- factory:case amp -->\nAmp.\n<!-- factory:endswitch -->\n",
    });

    try {
      expect(problems).toEqual([
        {
          level: "error",
          file: ".factory/AGENTS.md",
          line: 3,
          message: "factory:switch over env.harness has no case for opencode",
          fix: "Add a case for each, or a factory:default",
        },
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  test("parses AGENTS.md whole, so a leading --- is not frontmatter", async () => {
    const { repo, problems } = await load({
      ".factory/factory.yaml": FORMAT_TWO,
      ".factory/AGENTS.md": [
        "---",
        "<!-- factory:when env.harness == amp -->",
        "Amp notes.",
        "<!-- factory:endwhen -->",
        "---",
        "",
      ].join("\n"),
    });

    try {
      expect(problems).toEqual([]);
    } finally {
      await repo.cleanup();
    }
  });

  test("names an unknown skill with a suggestion", async () => {
    const { repo, problems } = await load({
      ".factory/factory.yaml": [
        FORMAT_TWO,
        "skills:",
        "  demp: { when: env.harness == amp }",
        "",
      ].join("\n"),
      ".factory/skills/demo/SKILL.md": skill("\n# Demo\n"),
    });

    try {
      expect(problems).toEqual([
        {
          level: "error",
          file: ".factory/factory.yaml",
          line: 9,
          message: 'skills names unknown skill "demp"',
          fix: 'Did you mean "demo"?',
        },
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  test("refuses a skills entry for a workflow the pipeline names", async () => {
    const { repo, problems } = await load({
      ".factory/factory.yaml": [
        "format: 2",
        "name: demo",
        "env:",
        "  harness:",
        "    values: [opencode, amp]",
        "pipeline:",
        "  - demo",
        "skills:",
        "  demo: { when: env.harness == amp }",
        "",
      ].join("\n"),
      ".factory/workflows/demo/SKILL.md": [
        "---",
        "name: demo",
        "description: Demo. Use when testing.",
        "---",
        "",
        "# Demo",
        "",
      ].join("\n"),
    });

    try {
      expect(problems).toEqual([
        {
          level: "error",
          file: ".factory/factory.yaml",
          line: 9,
          message: '"demo" is in the pipeline, so it cannot have a skills entry',
          fix: "Remove the entry: the pipeline names installed workflows for everyone",
        },
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  test("skips a Markdown file that is not UTF-8", async () => {
    const binary = Buffer.concat([
      Buffer.from("<!-- factory:when env.harness == amp -->\n"),
      Buffer.from([0xc3, 0x28, 0xa0, 0xa1]),
    ]);

    const { repo, problems } = await load({
      ".factory/factory.yaml": FORMAT_TWO,
      ".factory/skills/demo/SKILL.md": skill("\n# Demo\n"),
      ".factory/skills/demo/data.md": binary,
    });

    try {
      expect(problems).toEqual([]);
    } finally {
      await repo.cleanup();
    }
  });

  test("a broken branch is an error whatever the selection is", async () => {
    const repo = await makeRepo({
      ".factory/factory.yaml": FORMAT_TWO,
      ".factory/metafab.yaml": METAFAB_YAML,
      ".factory/skills/demo/SKILL.md": skill(
        [
          "",
          "# Demo",
          "",
          "<!-- factory:when env.harness == amp -->",
          "<!-- factory:endwhen -->",
          "<!-- factory:endwhen -->",
          "",
        ].join("\n"),
      ),
    });

    try {
      for (const selection of ["harness=amp", "harness=opencode"]) {
        const problems = await runCheck(repo.root, "1.0.0", { env: [selection] });
        const broken = problems.filter(
          (problem) => problem.message === "factory:endwhen has no matching factory:when",
        );

        expect(broken, selection).toEqual([
          {
            level: "error",
            file: ".factory/skills/demo/SKILL.md",
            line: 10,
            message: "factory:endwhen has no matching factory:when",
            fix: "Remove the line",
          },
        ]);
      }
    } finally {
      await repo.cleanup();
    }
  });
});
