import { chmod, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { findSkill, loadFactory, workflows } from "../../../src/core/factory/index.js";
import { makeRepo } from "../../helpers/makeRepo.js";

const FIXTURES = fileURLToPath(new URL("../../fixtures/factories/", import.meta.url));

const SKILL = `---
name: demo
description: Demo skill. Use when testing.
---

# Demo

Body.
`;

describe("loadFactory", () => {
  test("an empty .factory is valid and has no skills", async () => {
    const factory = await loadFactory(path.join(FIXTURES, "empty"));

    expect(factory.problems).toEqual([]);
    expect(factory.skills).toEqual([]);
    expect(factory.factoryYaml).toBeUndefined();
    expect(factory.agentsMd).toBeUndefined();
  });

  test("loads the mark4-like factory", async () => {
    const factory = await loadFactory(path.join(FIXTURES, "mark4-like"));

    expect(factory.problems).toEqual([]);
    expect(factory.skills).toHaveLength(8);
    expect(factory.factoryYaml?.name).toBe("mark4");
    expect(factory.factoryYaml?.pipeline).toHaveLength(6);
    expect(factory.agentsMd).toContain("# Mark4 factory");

    const review = findSkill(factory, "review-slice");
    expect(review?.group).toBe("workflows");
    expect(review?.isWorkflow).toBe(true);
    expect(review?.title).toBe("Review slice");

    const security = findSkill(factory, "security");
    expect(security?.group).toBe("review");
    expect(security?.isWorkflow).toBe(false);

    expect(workflows(factory).map((skill) => skill.name)).toEqual([
      "build-slice",
      "file-work",
      "finish-slice",
      "plan-feature",
      "review-slice",
      "triage-ideas",
    ]);
  });

  test("a missing factory.yaml is valid", async () => {
    const repo = await makeRepo({ ".factory/skills/demo/SKILL.md": SKILL });
    try {
      const factory = await loadFactory(repo.root);

      expect(factory.problems).toEqual([]);
      expect(factory.factoryYaml).toBeUndefined();
      expect(factory.skills).toHaveLength(1);
    } finally {
      await repo.cleanup();
    }
  });

  test("an empty factory.yaml reports missing format and name", async () => {
    const repo = await makeRepo({ ".factory/factory.yaml": "" });
    try {
      const factory = await loadFactory(repo.root);

      expect(factory.factoryYaml).toBeUndefined();
      expect(factory.problems).toEqual([
        {
          level: "error",
          file: ".factory/factory.yaml",
          line: 1,
          message: 'factory.yaml is missing "format"',
          fix: "Add format: 1",
        },
        {
          level: "error",
          file: ".factory/factory.yaml",
          line: 1,
          message: 'factory.yaml is missing "name"',
          fix: "Add a name field",
        },
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  test("reports pipeline problems even when factory.yaml is invalid", async () => {
    const repo = await makeRepo({
      ".factory/factory.yaml": "format: 2\nname: mark4\npipeline:\n  - nope\n",
    });
    try {
      const factory = await loadFactory(repo.root);

      expect(factory.factoryYaml).toBeUndefined();
      expect(factory.problems).toEqual([
        {
          level: "error",
          file: ".factory/factory.yaml",
          line: 1,
          message: '"format" must be the integer 1',
          fix: "Set format to 1",
        },
        {
          level: "error",
          file: ".factory/factory.yaml",
          line: 4,
          message: 'Pipeline names unknown workflow "nope"',
          fix: "Add it under .factory/workflows/ or remove the entry",
        },
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  test("reports an unresolved alias as a grammar problem", async () => {
    const repo = await makeRepo({
      ".factory/factory.yaml": "format: 1\nname: mark4\npipeline:\n  - review-slice: *missing\n",
    });
    try {
      const factory = await loadFactory(repo.root);

      expect(factory.factoryYaml).toBeUndefined();
      expect(factory.problems).toEqual([
        {
          level: "error",
          file: ".factory/factory.yaml",
          line: 4,
          message: "Alias *missing has no anchor",
          fix: "Remove the alias or define its anchor before it",
        },
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  test("reports a SKILL.md directly in .factory", async () => {
    const repo = await makeRepo({ ".factory/SKILL.md": SKILL });
    try {
      const factory = await loadFactory(repo.root);

      expect(factory.skills).toEqual([]);
      expect(factory.problems).toEqual([
        {
          level: "error",
          file: ".factory/SKILL.md",
          line: 1,
          message: "SKILL.md must live inside a skill directory",
          fix: "Move it into a directory such as .factory/skills/<name>/SKILL.md",
        },
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  test("a CRLF SKILL.md gives the same result as its LF version", async () => {
    const lf = await makeRepo({ ".factory/skills/demo/SKILL.md": SKILL });
    const crlf = await makeRepo({ ".factory/skills/demo/SKILL.md": SKILL.replace(/\n/g, "\r\n") });
    try {
      const lfFactory = await loadFactory(lf.root);
      const crlfFactory = await loadFactory(crlf.root);

      expect(lfFactory.problems).toEqual([]);
      expect(crlfFactory.problems).toEqual([]);
      expect(crlfFactory.skills[0]?.frontmatter).toEqual(lfFactory.skills[0]?.frontmatter);
      expect(crlfFactory.skills[0]?.title).toBe(lfFactory.skills[0]?.title);
      expect(crlfFactory.skills[0]?.frontmatterLines).toEqual(lfFactory.skills[0]?.frontmatterLines);
    } finally {
      await lf.cleanup();
      await crlf.cleanup();
    }
  });

  test("ignores headings inside fenced code blocks when reading the title", async () => {
    const source = [
      "---",
      "name: demo",
      "description: Demo skill.",
      "---",
      "",
      "~~~markdown",
      "# Not the title",
      "~~~",
      "",
      "# Real title",
      "",
    ].join("\n");
    const repo = await makeRepo({ ".factory/skills/demo/SKILL.md": source });
    try {
      const factory = await loadFactory(repo.root);

      expect(factory.problems).toEqual([]);
      expect(factory.skills[0]?.title).toBe("Real title");
    } finally {
      await repo.cleanup();
    }
  });

  test("ignores an indented code block when reading the title", async () => {
    const source = [
      "---",
      "name: demo",
      "description: Demo skill.",
      "---",
      "",
      "    ```",
      "",
      "# Real title",
      "",
    ].join("\n");
    const repo = await makeRepo({ ".factory/skills/demo/SKILL.md": source });
    try {
      const factory = await loadFactory(repo.root);

      expect(factory.problems).toEqual([]);
      expect(factory.skills[0]?.title).toBe("Real title");
    } finally {
      await repo.cleanup();
    }
  });

  test("preserves unknown frontmatter fields", async () => {
    const source = `---
name: demo
description: Demo skill.
allowed-tools:
  - Read
  - Write
---

# Demo
`;
    const repo = await makeRepo({ ".factory/skills/demo/SKILL.md": source });
    try {
      const factory = await loadFactory(repo.root);

      expect(factory.problems).toEqual([]);
      expect(factory.skills[0]?.frontmatter["allowed-tools"]).toEqual(["Read", "Write"]);
    } finally {
      await repo.cleanup();
    }
  });

  test("returns AGENTS.md with LF line endings", async () => {
    const repo = await makeRepo({ ".factory/AGENTS.md": "# Rules\r\nNo secrets.\r\n" });
    try {
      const factory = await loadFactory(repo.root);

      expect(factory.agentsMd).toBe("# Rules\nNo secrets.\n");
    } finally {
      await repo.cleanup();
    }
  });
});

const cannotTestPermissions = process.platform === "win32" || process.getuid?.() === 0;

describe("loadFactory filesystem errors", () => {
  test.skipIf(cannotTestPermissions)("reports an unreadable factory.yaml and leaves it unset", async () => {
    const repo = await makeRepo({ ".factory/factory.yaml": "format: 1\nname: demo\n" });
    const file = repo.path(".factory", "factory.yaml");
    try {
      await chmod(file, 0o000);
      const factory = await loadFactory(repo.root);

      expect(factory.factoryYaml).toBeUndefined();
      expect(factory.problems).toEqual([
        {
          level: "error",
          file: ".factory/factory.yaml",
          line: 1,
          message: "Cannot read file .factory/factory.yaml",
          fix: "Check its permissions or restore the file",
        },
      ]);
    } finally {
      await chmod(file, 0o644);
      await repo.cleanup();
    }
  });

  test.skipIf(cannotTestPermissions)("reports an unreadable AGENTS.md and leaves it unset", async () => {
    const repo = await makeRepo({ ".factory/AGENTS.md": "# Rules\n" });
    const file = repo.path(".factory", "AGENTS.md");
    try {
      await chmod(file, 0o000);
      const factory = await loadFactory(repo.root);

      expect(factory.agentsMd).toBeUndefined();
      expect(factory.problems).toEqual([
        {
          level: "error",
          file: ".factory/AGENTS.md",
          line: 1,
          message: "Cannot read file .factory/AGENTS.md",
          fix: "Check its permissions or restore the file",
        },
      ]);
    } finally {
      await chmod(file, 0o644);
      await repo.cleanup();
    }
  });

  test.skipIf(cannotTestPermissions)("reports an unreadable skills directory and loads no skills", async () => {
    const repo = await makeRepo({ ".factory/skills/demo/SKILL.md": SKILL });
    const directory = repo.path(".factory", "skills");
    try {
      await chmod(directory, 0o000);
      const factory = await loadFactory(repo.root);

      expect(factory.skills).toEqual([]);
      expect(factory.problems).toEqual([
        {
          level: "error",
          file: ".factory/skills",
          line: 1,
          message: "Cannot read directory .factory/skills",
          fix: "Check its permissions or restore the directory",
        },
      ]);
    } finally {
      await chmod(directory, 0o755);
      await repo.cleanup();
    }
  });

  test.skipIf(cannotTestPermissions)("reports an unreadable SKILL.md and skips the skill", async () => {
    const repo = await makeRepo({ ".factory/skills/demo/SKILL.md": SKILL });
    const file = repo.path(".factory", "skills", "demo", "SKILL.md");
    try {
      await chmod(file, 0o000);
      const factory = await loadFactory(repo.root);

      expect(factory.skills).toEqual([]);
      expect(factory.problems).toEqual([
        {
          level: "error",
          file: ".factory/skills/demo/SKILL.md",
          line: 1,
          message: "Cannot read file .factory/skills/demo/SKILL.md",
          fix: "Check its permissions or restore the file",
        },
      ]);
    } finally {
      await chmod(file, 0o644);
      await repo.cleanup();
    }
  });

  test("reports a factory.yaml that is not a regular file", async () => {
    const repo = await makeRepo({});
    const file = repo.path(".factory", "factory.yaml");
    try {
      await mkdir(file, { recursive: true });
      const factory = await loadFactory(repo.root);

      expect(factory.factoryYaml).toBeUndefined();
      expect(factory.problems).toEqual([
        {
          level: "error",
          file: ".factory/factory.yaml",
          line: 1,
          message: ".factory/factory.yaml is not a regular file",
          fix: "Replace it with a regular file",
        },
      ]);
    } finally {
      await repo.cleanup();
    }
  });
});
