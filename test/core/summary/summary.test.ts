import { describe, expect, test } from "vitest";
import {
  CONFLICT_INSTRUCTION,
  SUMMARY_FOOTER,
  renderSummary,
  summarise,
} from "../../../src/core/summary.js";
import type { Summary, SummaryContext, SummaryEntry } from "../../../src/core/summary.js";
import type { RequirementResult } from "../../../src/core/requires/inspect.js";
import { binaryFile, linkFile, makeTree, textFile } from "./trees.js";

const CONTEXT: SummaryContext = { title: "@seasb/fab-mark4 1.2.0 -> 1.3.0" };

function skillFile(name: string, options: { allowedTools?: string; body?: string } = {}): string {
  const allowed = options.allowedTools === undefined ? "" : `allowed-tools: ${options.allowedTools}\n`;
  return `---\nname: ${name}\ndescription: A skill\n${allowed}---\n# ${name}\n\n${options.body ?? "Body."}\n`;
}

function factoryYaml(pipeline: string[]): string {
  return `format: 1\nname: mark4\npipeline:\n${pipeline.map((name) => `  - ${name}\n`).join("")}`;
}

function entryAt(summary: Summary, path: string): SummaryEntry | undefined {
  for (const group of summary.groups) {
    const entry = group.entries.find((candidate) => candidate.path === path);
    if (entry !== undefined) return entry;
  }
  return undefined;
}

function groupOf(summary: Summary, path: string): string | undefined {
  return summary.groups.find((group) => group.entries.some((entry) => entry.path === path))?.key;
}

function lines(summary: Summary): string[] {
  return renderSummary(summary).split("\n");
}

function expectRow(rendered: string[], start: string, detail: string): void {
  const found = rendered.some((line) => line.startsWith(`  ${start}`) && line.endsWith(detail));
  expect(found, `no row "  ${start} ... ${detail}" in:\n${rendered.join("\n")}`).toBe(true);
}

describe("summarise", () => {
  test("groups changes by risk in the spec order", () => {
    const before = makeTree({
      "AGENTS.md": textFile("# Agents\n"),
      "factory.yaml": textFile(factoryYaml(["build-slice", "review-slice"])),
      "scripts/next.mjs": textFile("old\n"),
      "workflows/review-slice/SKILL.md": textFile(skillFile("review-slice")),
      "skills/git-conventions/SKILL.md": textFile(skillFile("git-conventions")),
      "workflows/build-slice/SKILL.md": textFile(skillFile("build-slice")),
      "workflows/plan-feature/SKILL.md": textFile(skillFile("plan-feature")),
    });
    const after = makeTree({
      ...before,
      "AGENTS.md": textFile("# Agents\n\nMore.\n"),
      "factory.yaml": textFile(factoryYaml(["build-slice", "review-slice", "finish-slice"])),
      "scripts/next.mjs": textFile("new\n"),
      "workflows/review-slice/SKILL.md": textFile(skillFile("review-slice", { body: "Changed." })),
      "skills/git-conventions/SKILL.md": textFile(skillFile("git-conventions", { body: "Changed." })),
      "templates/report.md": textFile("# Report\n"),
    });

    const summary = summarise(before, after, {
      ...CONTEXT,
      preserved: ["workflows/build-slice/SKILL.md"],
      conflicts: ["workflows/plan-feature/SKILL.md"],
    });

    expect(summary.groups.map((group) => group.key)).toEqual([
      "code",
      "session",
      "workflows",
      "skills",
      "other",
      "preserved",
      "conflicts",
    ]);
    expect(summary.groups.map((group) => group.heading)).toEqual([
      "Runs code on your machines: review first",
      "Changes every agent session",
      "Workflows",
      "Skills",
      "Other",
      "Local edits preserved",
      "Conflicts: 1",
    ]);
    expect(entryAt(summary, "workflows/plan-feature/SKILL.md")).toMatchObject({
      status: "C",
      description: CONFLICT_INSTRUCTION,
    });
    expect(entryAt(summary, "workflows/build-slice/SKILL.md")).toEqual({
      path: "workflows/build-slice/SKILL.md",
    });
  });

  test("runs code: scripts/, the executable bit, and non-Markdown files in a skill directory", () => {
    const skill = textFile(skillFile("review-slice"));
    const before = makeTree({
      "workflows/review-slice/SKILL.md": skill,
      "skills/helper/SKILL.md": textFile(skillFile("helper")),
    });
    const after = makeTree({
      ...before,
      "scripts/README.md": textFile("# Scripts\n"),
      "skills/helper/run.sh": textFile("#!/bin/sh\n", 0o755),
      "skills/helper/notes.txt": textFile("Notes\n"),
      "skills/helper/extra.md": textFile("# Extra\n"),
      "workflows/review-slice/SKILL.md": textFile(skillFile("review-slice", { body: "Changed." })),
    });

    const summary = summarise(before, after, CONTEXT);

    expect(groupOf(summary, "scripts/README.md")).toBe("code");
    expect(groupOf(summary, "skills/helper/run.sh")).toBe("code");
    expect(groupOf(summary, "skills/helper/notes.txt")).toBe("code");
    expect(groupOf(summary, "skills/helper/extra.md")).toBe("skills");
    expect(entryAt(summary, "skills/helper/run.sh")).toMatchObject({
      status: "A",
      executable: true,
    });
  });

  test("marks added, modified, and deleted files", () => {
    const before = makeTree({
      "AGENTS.md": textFile("keep\n"),
      "workflows/old/SKILL.md": textFile(skillFile("old")),
      "scripts/next.mjs": textFile("one\ntwo\nthree\nfour\n"),
    });
    const after = makeTree({
      "AGENTS.md": textFile("keep\n"),
      "scripts/next.mjs": textFile("one\nTWO\nthree\nfour\nfive\n"),
      "templates/report.md": textFile("# Report\n"),
    });

    const summary = summarise(before, after, CONTEXT);

    expect(entryAt(summary, "scripts/next.mjs")).toMatchObject({
      status: "M",
      added: 2,
      removed: 1,
    });
    expect(entryAt(summary, "templates/report.md")).toMatchObject({
      status: "A",
      added: 1,
      removed: 0,
    });
    expect(entryAt(summary, "workflows/old/SKILL.md")).toMatchObject({
      status: "D",
      added: 0,
      removed: 7,
    });
    expect(entryAt(summary, "AGENTS.md")).toBeUndefined();
  });

  test("renders line counts, new files, and executables in the detail column", () => {
    const before = makeTree({
      "scripts/run.mjs": textFile("a\nb\nc\n"),
      "templates/logo.png": binaryFile(Uint8Array.from([0, 1, 2])),
    });
    const after = makeTree({
      "scripts/run.mjs": textFile("a\nB\nc\nd\n"),
      "scripts/release.sh": textFile("#!/bin/sh\n", 0o755),
      "templates/guide.md": textFile("# Guide\n"),
      "templates/logo.png": binaryFile(Uint8Array.from([0, 1, 3])),
    });

    const rendered = lines(summarise(before, after, CONTEXT));

    expectRow(rendered, "M scripts/run.mjs", "+2 -1");
    expectRow(rendered, "A scripts/release.sh", "new, executable");
    expectRow(rendered, "A templates/guide.md", "+1 -0");
    expectRow(rendered, "M templates/logo.png", "binary");
  });

  test("reports a change to the executable bit alone", () => {
    const before = makeTree({
      "skills/helper/SKILL.md": textFile(skillFile("helper"), 0o644),
      "skills/helper/run.sh": textFile("#!/bin/sh\n", 0o755),
    });
    const after = makeTree({
      "skills/helper/SKILL.md": textFile(skillFile("helper"), 0o755),
      "skills/helper/run.sh": textFile("#!/bin/sh\n", 0o644),
    });

    const rendered = lines(summarise(before, after, CONTEXT));

    expectRow(rendered, "M skills/helper/SKILL.md", "executable");
    expectRow(rendered, "M skills/helper/run.sh", "not executable");
  });

  test("ignores a change between 0644 and 0664", () => {
    const before = makeTree({ "templates/note.md": textFile("# Note\n", 0o644) });
    const after = makeTree({ "templates/note.md": textFile("# Note\n", 0o664) });

    expect(summarise(before, after, CONTEXT).groups).toEqual([]);
  });

  test("describes factory.yaml pipeline changes instead of counting lines", () => {
    const before = makeTree({
      "factory.yaml": textFile(factoryYaml(["build-slice", "review-slice"])),
    });
    const after = makeTree({
      "factory.yaml": textFile(factoryYaml(["build-slice", "review-slice", "finish-slice"])),
    });

    const summary = summarise(before, after, CONTEXT);

    expect(entryAt(summary, "factory.yaml")).toMatchObject({
      status: "M",
      description: "pipeline: finish-slice added after review-slice",
    });
    expectRow(
      lines(summary),
      "M factory.yaml",
      "pipeline: finish-slice added after review-slice",
    );
  });

  test("counts lines when factory.yaml changes outside the pipeline", () => {
    const before = makeTree({ "factory.yaml": textFile(factoryYaml(["build-slice"])) });
    const after = makeTree({
      "factory.yaml": textFile(`format: 1\nname: mark5\npipeline:\n  - build-slice\n`),
    });

    const summary = summarise(before, after, CONTEXT);

    expect(entryAt(summary, "factory.yaml")).toMatchObject({ status: "M", added: 1, removed: 1 });
    expect(entryAt(summary, "factory.yaml")?.description).toBeUndefined();
  });

  test("annotates a changed allowed-tools field on SKILL.md", () => {
    const before = makeTree({
      "workflows/review-slice/SKILL.md": textFile(skillFile("review-slice", { allowedTools: "Read" })),
      "skills/git-conventions/SKILL.md": textFile(
        skillFile("git-conventions", { allowedTools: "Read" }),
      ),
    });
    const after = makeTree({
      "workflows/review-slice/SKILL.md": textFile(
        skillFile("review-slice", { allowedTools: "Read, Grep" }),
      ),
      "skills/git-conventions/SKILL.md": textFile(
        skillFile("git-conventions", { allowedTools: "Read", body: "Changed." }),
      ),
    });

    const summary = summarise(before, after, CONTEXT);

    expect(entryAt(summary, "workflows/review-slice/SKILL.md")?.annotations).toEqual([
      "allowed-tools changed",
    ]);
    expect(entryAt(summary, "skills/git-conventions/SKILL.md")?.annotations).toBeUndefined();
    expectRow(lines(summary), "M workflows/review-slice/SKILL.md", "allowed-tools changed");
  });

  test("an added allowed-tools field counts as a change", () => {
    const before = makeTree({
      "skills/git-conventions/SKILL.md": textFile(skillFile("git-conventions")),
    });
    const after = makeTree({
      "skills/git-conventions/SKILL.md": textFile(
        skillFile("git-conventions", { allowedTools: "Read" }),
      ),
    });

    expect(entryAt(summarise(before, after, CONTEXT), "skills/git-conventions/SKILL.md")?.annotations).toEqual([
      "allowed-tools changed",
    ]);
  });

  test("shows a new workflow as one line with its title", () => {
    const before = makeTree({ "workflows/review-slice/SKILL.md": textFile(skillFile("review-slice")) });
    const after = makeTree({
      ...before,
      "workflows/finish-slice/SKILL.md": textFile(
        `---\nname: finish-slice\ndescription: Finish\nafter: [review-slice]\n---\n# Finish slice\n\nBody.\n`,
      ),
      "workflows/finish-slice/notes.md": textFile("# Notes\n"),
    });

    const summary = summarise(before, after, CONTEXT);

    expect(summary.groups.find((group) => group.key === "workflows")?.entries).toEqual([
      { status: "A", path: "workflows/finish-slice", title: "Finish slice" },
    ]);
    expectRow(lines(summary), "A workflows/finish-slice", "Finish slice");
  });

  test("renders a new workflow without a title", () => {
    const before = makeTree({});
    const after = makeTree({ "workflows/finish-slice/SKILL.md": textFile("No frontmatter.\n") });

    expect(lines(summarise(before, after, CONTEXT))).toContain("  A workflows/finish-slice");
  });

  test("lists a new file in an existing workflow on its own line", () => {
    const before = makeTree({ "workflows/review-slice/SKILL.md": textFile(skillFile("review-slice")) });
    const after = makeTree({
      ...before,
      "workflows/review-slice/checklist.md": textFile("# Checklist\n"),
    });

    const summary = summarise(before, after, CONTEXT);

    expect(summary.groups.find((group) => group.key === "workflows")?.entries).toEqual([
      { status: "A", path: "workflows/review-slice/checklist.md", added: 1, removed: 0 },
    ]);
  });

  test("never lists a conflict path in its normal group", () => {
    const before = makeTree({ "workflows/review-slice/SKILL.md": textFile(skillFile("review-slice")) });
    const after = makeTree({
      "workflows/review-slice/SKILL.md": textFile(skillFile("review-slice", { body: "Changed." })),
    });

    const summary = summarise(before, after, {
      ...CONTEXT,
      conflicts: ["workflows/review-slice/SKILL.md"],
    });

    expect(summary.groups.map((group) => group.key)).toEqual(["conflicts"]);
    expect(summary.groups[0]?.heading).toBe("Conflicts: 1");
  });

  test("pluralises the conflicts heading", () => {
    const summary = summarise(makeTree({}), makeTree({}), {
      ...CONTEXT,
      conflicts: ["workflows/a/SKILL.md", "workflows/b/SKILL.md"],
    });

    expect(summary.groups[0]?.heading).toBe("Conflicts: 2");
    expect(summary.groups[0]?.entries.map((entry) => entry.path)).toEqual([
      "workflows/a/SKILL.md",
      "workflows/b/SKILL.md",
    ]);
  });

  test("lists added, removed, and repointed symbolic links", () => {
    const before = makeTree({
      "notes-link.md": linkFile("notes.md"),
      "old-link.md": linkFile("old.md"),
    });
    const after = makeTree({
      "notes-link.md": linkFile("other-notes.md"),
      "new-link.md": linkFile("new.md"),
    });

    const summary = summarise(before, after, CONTEXT);

    expect(entryAt(summary, "new-link.md")).toMatchObject({ status: "A", link: "new.md" });
    expect(entryAt(summary, "old-link.md")).toMatchObject({ status: "D", link: "old.md" });
    expect(entryAt(summary, "notes-link.md")).toMatchObject({
      status: "M",
      link: "other-notes.md",
    });
    expectRow(lines(summary), "A new-link.md", "-> new.md");
    expectRow(lines(summary), "D old-link.md", "-> old.md");
    expectRow(lines(summary), "M notes-link.md", "-> other-notes.md");
    expect(groupOf(summary, "new-link.md")).toBe("other");
    expect(groupOf(summary, "old-link.md")).toBe("other");
  });

  test("groups a symbolic link by its path, never by the executable bit", () => {
    const before = makeTree({ "skills/demo/SKILL.md": textFile(skillFile("demo")) });
    const after = makeTree({
      ...before,
      // macOS reports 0755 and Linux 0777 for every link.
      "skills/demo/notes-link.md": linkFile("../other/notes.md", 0o755),
      "skills/demo/run": linkFile("../../scripts/run.sh", 0o777),
      "notes-link.md": linkFile("notes.md", 0o755),
    });

    const summary = summarise(before, after, CONTEXT);

    expect(groupOf(summary, "skills/demo/notes-link.md")).toBe("skills");
    expect(groupOf(summary, "skills/demo/run")).toBe("code");
    expect(groupOf(summary, "notes-link.md")).toBe("other");
    expect(entryAt(summary, "skills/demo/notes-link.md")).toMatchObject({
      status: "A",
      link: "../other/notes.md",
    });
    expect(entryAt(summary, "skills/demo/notes-link.md")?.executable).toBeUndefined();
    expect(lines(summary).some((line) => line.includes("new, executable"))).toBe(false);
  });

  test("renders notes before the footer and the footer last", () => {
    const summary = summarise(makeTree({}), makeTree({ "AGENTS.md": textFile("# Agents\n") }), {
      ...CONTEXT,
      notes: ["Left .gitattributes unchanged."],
    });
    const rendered = renderSummary(summary);

    expect(rendered.endsWith(`Left .gitattributes unchanged.\n\n${SUMMARY_FOOTER}`)).toBe(true);
  });

  test("is JSON-serialisable without losing groups", () => {
    const before = makeTree({ "scripts/next.mjs": textFile("old\n") });
    const after = makeTree({ "scripts/next.mjs": textFile("new\n") });
    const summary = summarise(before, after, { ...CONTEXT, conflicts: ["workflows/a/SKILL.md"] });

    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });

  test("renders only the title and footer when nothing changed", () => {
    expect(renderSummary(summarise(makeTree({}), makeTree({}), CONTEXT))).toBe(
      `${CONTEXT.title}\n\n${SUMMARY_FOOTER}`,
    );
  });

  test("puts the setup group after session and before workflows, in factory.yaml order", () => {
    const before = makeTree({});
    const after = makeTree({
      "AGENTS.md": textFile("# Agents\n"),
      "workflows/build-slice/SKILL.md": textFile(skillFile("build-slice")),
    });
    const requirements: RequirementResult[] = [
      { path: "orca.yaml", description: "Runs metafab build in each new Orca worktree", state: "present" },
      {
        path: "docs/roadmap.md",
        description: "The roadmap that prioritise-roadmap writes",
        state: "missing",
      },
    ];

    const summary = summarise(before, after, { ...CONTEXT, requirements });

    expect(summary.groups.map((group) => group.key)).toEqual(["session", "setup", "workflows"]);
    expect(summary.groups[1]?.heading).toBe("Repository files the factory needs");
    // Path order would put docs/roadmap.md first; the group keeps the factory's order.
    expect(summary.groups[1]?.entries.map((entry) => entry.path)).toEqual([
      "orca.yaml",
      "docs/roadmap.md",
    ]);
  });

  test("renders one line per requirement state", () => {
    const requirements: RequirementResult[] = [
      {
        path: "opencode.json",
        description: "Defines the agent-coding sub-agent",
        template: ".factory/templates/setup/opencode.json",
        state: "created",
      },
      {
        path: "orca.yaml",
        description: "Runs metafab build in each new Orca worktree",
        template: ".factory/templates/orca.yaml",
        state: "present",
      },
      { path: "settings.json", description: "Settings", state: "present" },
      { path: "docs/factory.md", description: "The repository settings", state: "missing" },
      {
        path: "LICENSE",
        description: "The licence",
        template: ".factory/templates/LICENSE",
        state: "declined",
      },
      {
        path: "ops.yaml",
        description: "Operations",
        state: "blocked",
        reason: "ops.yaml is a directory",
      },
      {
        path: "run.sh",
        description: "The setup script",
        template: ".factory/templates/run.sh",
        state: "failed",
        reason: "EACCES",
      },
    ];

    const rendered = lines(summarise(makeTree({}), makeTree({}), { ...CONTEXT, requirements }));

    expectRow(rendered, "A opencode.json", "created from .factory/templates/setup/opencode.json");
    expectRow(rendered, "orca.yaml", "present: Runs metafab build in each new Orca worktree");
    expectRow(rendered, "settings.json", "present");
    expectRow(rendered, "docs/factory.md", "missing: The repository settings");
    expectRow(rendered, "LICENSE", "not created: declined");
    expectRow(rendered, "ops.yaml", "blocked: ops.yaml is a directory");
    expectRow(rendered, "run.sh", "not created: EACCES");
  });
});
