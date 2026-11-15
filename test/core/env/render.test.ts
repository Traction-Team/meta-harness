import { describe, expect, test } from "vitest";
import { parseMarkdown } from "../../../src/core/env/directives.js";
import { renderDocument } from "../../../src/core/env/render.js";
import type { EnvSelection, EnvVariable } from "../../../src/core/env/types.js";

const FILE = ".factory/skills/demo/SKILL.md";

const VARIABLES: EnvVariable[] = [
  {
    name: "harness",
    values: [
      { name: "opencode", label: "In OpenCode", line: 1 },
      { name: "claude", label: "In Claude Code", line: 2 },
      { name: "amp", label: "In Amp", line: 3 },
    ],
    line: 1,
  },
  {
    name: "workspace",
    values: [
      { name: "orca", label: "On Orca", line: 4 },
      { name: "orb", label: "On orb", line: 5 },
    ],
    line: 4,
  },
];

function render(text: string, values: Record<string, string[]>): string {
  const selection: EnvSelection = new Map(Object.entries(values));
  const document = parseMarkdown(text, { file: FILE, firstLine: 1, variables: VARIABLES });
  expect(document.problems).toEqual([]);
  return renderDocument(document, { variables: VARIABLES, selection });
}

function lines(...text: string[]): string {
  return text.join("\n");
}

const WHEN = lines(
  "<!-- factory:when env.harness == amp -->",
  "In Amp.",
  "<!-- factory:endwhen -->",
  "",
);

const SWITCH = lines(
  "<!-- factory:switch env.harness -->",
  "<!-- factory:case opencode -->",
  "OpenCode text",
  "<!-- factory:case claude -->",
  "Claude text",
  "<!-- factory:default -->",
  "Other text",
  "<!-- factory:endswitch -->",
  "",
);

describe("render a when block", () => {
  test("keeps a block that applies to every scenario, unlabelled", () => {
    expect(render(WHEN, { harness: ["amp"] })).toBe("In Amp.\n");
  });

  test("removes a block that applies to no scenario", () => {
    expect(render(WHEN, { harness: ["opencode"] })).toBe("");
  });

  test("keeps a partial match after its label line", () => {
    expect(render(WHEN, { harness: ["opencode", "amp"] })).toBe("**In Amp:**\nIn Amp.\n");
  });

  test("the label line takes the opening directive's indentation", () => {
    const text = lines(
      "  <!-- factory:when env.harness == amp -->",
      "  In Amp.",
      "  <!-- factory:endwhen -->",
      "",
    );

    expect(render(text, { harness: ["opencode", "amp"] })).toBe("  **In Amp:**\n  In Amp.\n");
  });

  test("keeps text outside blocks unchanged", () => {
    const text = lines(
      "# Skill",
      "",
      "1. First",
      "<!-- factory:when env.harness == amp -->",
      "2. Second, for Amp",
      "<!-- factory:endwhen -->",
      "3. Third",
      "",
    );

    expect(render(text, { harness: ["opencode", "amp"] })).toBe(
      "# Skill\n\n1. First\n**In Amp:**\n2. Second, for Amp\n3. Third\n",
    );
  });

  test("keeps the trailing newline of the input, and adds none", () => {
    const without = lines(
      "<!-- factory:when env.harness == amp -->",
      "In Amp.",
      "<!-- factory:endwhen -->",
    );

    expect(render(without, { harness: ["amp"] })).toBe("In Amp.");
    expect(render(`${without}\n`, { harness: ["amp"] })).toBe("In Amp.\n");
  });

  test("a directive inside a fence is text", () => {
    const text = lines(
      "```md",
      "<!-- factory:when env.harness == amp -->",
      "<!-- factory:endwhen -->",
      "```",
      "",
    );

    expect(render(text, { harness: ["opencode"] })).toBe(text);
  });

  test("a nested block is labelled only by its own variable", () => {
    const text = lines(
      "<!-- factory:when env.harness == amp -->",
      "<!-- factory:when env.workspace == orb -->",
      "Orb text",
      "<!-- factory:endwhen -->",
      "<!-- factory:endwhen -->",
      "",
    );

    expect(render(text, { harness: ["amp"], workspace: ["orca", "orb"] })).toBe(
      "**On orb:**\nOrb text\n",
    );
  });
});

describe("an empty partial match", () => {
  test("a block with no lines writes no label line", () => {
    const text = lines(
      "<!-- factory:when env.harness == amp -->",
      "<!-- factory:endwhen -->",
      "",
    );

    expect(render(text, { harness: ["opencode", "amp"] })).toBe("");
  });

  test("a block whose only content is a removed block writes no label line", () => {
    const text = lines(
      "<!-- factory:when env.harness == amp -->",
      "<!-- factory:when env.harness == claude -->",
      "Not this",
      "<!-- factory:endwhen -->",
      "<!-- factory:endwhen -->",
      "",
    );

    expect(render(text, { harness: ["opencode", "amp"] })).toBe("");
  });

  test("a case with no lines writes no label line", () => {
    const text = lines(
      "<!-- factory:switch env.harness -->",
      "<!-- factory:case amp -->",
      "<!-- factory:case opencode -->",
      "OpenCode text",
      "<!-- factory:default -->",
      "Other text",
      "<!-- factory:endswitch -->",
      "",
    );

    expect(render(text, { harness: ["opencode", "amp"] })).toBe(
      "**In OpenCode:**\nOpenCode text\n",
    );
  });
});

describe("render a switch", () => {
  test("one selected value keeps one branch, unlabelled", () => {
    expect(render(SWITCH, { harness: ["opencode"] })).toBe("OpenCode text\n");
  });

  test("a case and the default each keep their text after their label", () => {
    expect(render(SWITCH, { harness: ["opencode", "amp"] })).toBe(
      "**In OpenCode:**\nOpenCode text\n**In Amp:**\nOther text\n",
    );
  });

  test("the default is removed when every selected value has a case", () => {
    expect(render(SWITCH, { harness: ["opencode", "claude"] })).toBe(
      "**In OpenCode:**\nOpenCode text\n**In Claude Code:**\nClaude text\n",
    );
  });

  test("a case for several values joins their labels with or", () => {
    const text = lines(
      "<!-- factory:switch env.harness -->",
      "<!-- factory:case opencode claude -->",
      "Both text",
      "<!-- factory:default -->",
      "Other text",
      "<!-- factory:endswitch -->",
      "",
    );

    expect(render(text, { harness: ["opencode", "claude", "amp"] })).toBe(
      "**In OpenCode or In Claude Code:**\nBoth text\n**In Amp:**\nOther text\n",
    );
  });

  test("removes the blank lines between a switch and its first case", () => {
    const text = lines(
      "<!-- factory:switch env.harness -->",
      "",
      "",
      "<!-- factory:case amp -->",
      "Amp text",
      "<!-- factory:default -->",
      "Other text",
      "<!-- factory:endswitch -->",
      "",
    );

    expect(render(text, { harness: ["amp"] })).toBe("Amp text\n");
  });

  test("a switch inside a when is classified in the when's scenarios", () => {
    const text = lines(
      "<!-- factory:when env.harness == amp -->",
      "<!-- factory:switch env.workspace -->",
      "<!-- factory:case orca -->",
      "Orca text",
      "<!-- factory:case orb -->",
      "Orb text",
      "<!-- factory:endswitch -->",
      "<!-- factory:endwhen -->",
      "",
    );

    expect(render(text, { harness: ["amp"], workspace: ["orca", "orb"] })).toBe(
      "**On Orca:**\nOrca text\n**On orb:**\nOrb text\n",
    );
  });

  test("a when inside a case is labelled by its own variable", () => {
    const text = lines(
      "<!-- factory:switch env.harness -->",
      "<!-- factory:case amp -->",
      "<!-- factory:when env.workspace == orb -->",
      "Orb text",
      "<!-- factory:endwhen -->",
      "<!-- factory:default -->",
      "Other text",
      "<!-- factory:endswitch -->",
      "",
    );

    expect(render(text, { harness: ["opencode", "amp"], workspace: ["orca", "orb"] })).toBe(
      "**In Amp:**\n**On orb:**\nOrb text\n**In OpenCode:**\nOther text\n",
    );
  });
});
