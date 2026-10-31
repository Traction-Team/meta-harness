import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { snapshotTree } from "../../../src/core/import/file-tree.js";
import { renderSummary, summarise } from "../../../src/core/summary.js";
import type { FileTree } from "../../../src/core/import/file-tree.js";
import { writeRepoFiles } from "../../helpers/makeRepo.js";

function skill(
  name: string,
  options: { allowedTools?: string; body?: string; title?: string } = {},
): string {
  const allowed = options.allowedTools === undefined ? "" : `allowed-tools: ${options.allowedTools}\n`;
  const title = options.title ?? name;
  return `---\nname: ${name}\ndescription: A ${name} skill\n${allowed}---\n# ${title}\n\n${options.body ?? "Body."}\n`;
}

function factoryYaml(pipeline: string[]): string {
  return `format: 1\nname: mark4\npipeline:\n${pipeline.map((name) => `  - ${name}\n`).join("")}`;
}

const KEPT = Array.from({ length: 7 }, (_, index) => `keep-${index + 1}`);

let root: string;
let before: FileTree;
let after: FileTree;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "metafab-summary-spec-"));

  const beforeDir = path.join(root, "before");
  await writeRepoFiles(beforeDir, {
    "AGENTS.md": "# Agents\n\nOld session rule.\n",
    "factory.yaml": factoryYaml(["build-slice", "review-slice"]),
    "scripts/next.mjs": `${KEPT.slice(0, 3).map((line) => `old-${line}`).join("\n")}\n${KEPT.join("\n")}\n`,
    "workflows/build-slice/SKILL.md": skill("build-slice"),
    "workflows/plan-feature/SKILL.md": skill("plan-feature"),
    "workflows/review-slice/SKILL.md": skill("review-slice", {
      allowedTools: "Read, Grep",
      body: "old-a1\nold-a2\nold-a3",
    }),
    "skills/git-conventions/SKILL.md": skill("git-conventions", { body: "old body" }),
  });

  const afterDir = path.join(root, "after");
  await writeRepoFiles(afterDir, {
    "AGENTS.md": `# Agents\n\nOld session rule.\n${Array.from({ length: 6 }, (_, index) => `New rule ${index + 1}.`).join("\n")}\n`,
    "factory.yaml": factoryYaml(["build-slice", "review-slice", "finish-slice"]),
    "scripts/next.mjs": `${KEPT.join("\n")}\n${Array.from({ length: 14 }, (_, index) => `new-${index + 1}`).join("\n")}\n`,
    "scripts/release.sh": "#!/bin/sh\necho release\n",
    "workflows/build-slice/SKILL.md": skill("build-slice"),
    "workflows/plan-feature/SKILL.md": skill("plan-feature", { body: "Conflicting body." }),
    "workflows/finish-slice/SKILL.md": skill("finish-slice", {
      title: "Finish slice",
      body: "Finish the slice.",
    }),
    "workflows/review-slice/SKILL.md": skill("review-slice", {
      allowedTools: "Read, Grep, Bash",
      body: Array.from({ length: 8 }, (_, index) => `new-b${index + 1}`).join("\n"),
    }),
    "skills/git-conventions/SKILL.md": skill("git-conventions", {
      body: "new one\nnew two\nnew three",
    }),
  });

  before = await snapshotTree(beforeDir);
  // The spec example must render the same on every platform. Windows has no
  // executable bit, and a written file there reports 0o666, so the mode is set
  // on the entry in memory rather than read back from the filesystem.
  const afterTree = await snapshotTree(afterDir);
  after = {
    ...afterTree,
    "scripts/release.sh": { ...afterTree["scripts/release.sh"]!, mode: 0o755 },
  };
}, 60_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("the spec example", () => {
  test("renders the review summary exactly", () => {
    const summary = summarise(before, after, {
      title: "@seasb/fab-mark4 1.2.0 -> 1.3.0",
      preserved: ["workflows/build-slice/SKILL.md"],
      conflicts: ["workflows/plan-feature/SKILL.md"],
    });

    expect(renderSummary(summary)).toBe(
      [
        "@seasb/fab-mark4 1.2.0 -> 1.3.0",
        "",
        "Runs code on your machines: review first",
        "  M scripts/next.mjs                       +14 -3",
        "  A scripts/release.sh                     new, executable",
        "",
        "Changes every agent session",
        "  M AGENTS.md                              +6 -0",
        "  M factory.yaml                           pipeline: finish-slice added after review-slice",
        "",
        "Workflows",
        "  A workflows/finish-slice                 Finish slice",
        "  M workflows/review-slice/SKILL.md        +9 -4    allowed-tools changed",
        "",
        "Skills",
        "  M skills/git-conventions/SKILL.md        +3 -1",
        "",
        "Local edits preserved",
        "  workflows/build-slice/SKILL.md",
        "",
        "Conflicts: 1",
        "  C workflows/plan-feature/SKILL.md        Resolve markers, then run metafab build and metafab check",
        "",
        "Nothing was committed. Review the changes with git diff.",
      ].join("\n"),
    );
  });
});
