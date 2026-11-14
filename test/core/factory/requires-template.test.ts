import { chmod, mkdir, symlink } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import { loadFactory } from "../../../src/core/factory/index.js";
import { validateFab } from "../../../src/core/sources/index.js";
import { makeRepo } from "../../helpers/makeRepo.js";

const FILE = ".factory/factory.yaml";

const SKILL = (name: string) =>
  `---\nname: ${name}\ndescription: ${name} skill. Use when testing.\n---\n\n# ${name}\n`;

function factoryYaml(entry: string): string {
  return `format: 1\nname: demo\nrequires:\n  - ${entry}\n`;
}

const TEMPLATE_ENTRY =
  "path: opencode.json\n    description: Defines the agent-coding sub-agent\n    template: .factory/templates/setup/opencode.json";

async function loadProblems(
  files: Record<string, string | Uint8Array>,
): Promise<{ root: string; problems: Awaited<ReturnType<typeof loadFactory>>["problems"]; cleanup(): Promise<void> }> {
  const repo = await makeRepo({ [FILE]: factoryYaml(TEMPLATE_ENTRY), ...files });
  const factory = await loadFactory(repo.root);
  return { root: repo.root, problems: factory.problems, cleanup: () => repo.cleanup() };
}

const cannotTestPermissions = process.platform === "win32" || process.getuid?.() === 0;
const cannotLink = process.platform === "win32";

describe("rule 13", () => {
  test("accepts a template under .factory/templates/", async () => {
    const repo = await loadProblems({
      ".factory/templates/setup/opencode.json": "{}\n",
    });
    try {
      expect(repo.problems).toEqual([]);
    } finally {
      await repo.cleanup();
    }
  });

  test("rejects a template outside .factory/templates/", async () => {
    const created = await makeRepo({
      [FILE]: factoryYaml(
        "path: opencode.json\n    description: Agents\n    template: .factory/setup/opencode.json",
      ),
      ".factory/setup/opencode.json": "{}\n",
    });
    try {
      expect((await loadFactory(created.root)).problems).toContainEqual({
        level: "error",
        file: FILE,
        line: 4,
        message: 'Template ".factory/setup/opencode.json" must be a file in .factory/templates/',
        fix: "Move the template into .factory/templates/ and update the path",
      });
    } finally {
      await created.cleanup();
    }
  });

  test("rejects a template whose path after the prefix is unsafe", async () => {
    const created = await makeRepo({
      [FILE]: factoryYaml(
        "path: opencode.json\n    description: Agents\n    template: .factory/templates/../opencode.json",
      ),
      ".factory/opencode.json": "{}\n",
    });
    try {
      expect((await loadFactory(created.root)).problems.map((problem) => problem.message)).toContain(
        'Template ".factory/templates/../opencode.json" must be a file in .factory/templates/',
      );
    } finally {
      await created.cleanup();
    }
  });

  test.each(["SKILL.md", "Skill.md", "skill.md"])(
    "rejects a template named %s in any case",
    async (name) => {
      const created = await makeRepo({
        [FILE]: factoryYaml(
          `path: opencode.json\n    description: Agents\n    template: .factory/templates/setup/${name}`,
        ),
        [`.factory/templates/setup/${name}`]: SKILL("setup"),
      });
      try {
        expect((await loadFactory(created.root)).problems).toContainEqual({
          level: "error",
          file: FILE,
          line: 4,
          message: `Template ".factory/templates/setup/${name}" is part of a skill, so it would be installed`,
          fix: "Move it out of the skill directory",
        });
      } finally {
        await created.cleanup();
      }
    },
  );

  test("rejects a template in a directory that holds SKILL.md", async () => {
    const created = await makeRepo({
      [FILE]: factoryYaml(
        "path: opencode.json\n    description: Agents\n    template: .factory/templates/x/template.md",
      ),
      ".factory/templates/x/SKILL.md": SKILL("x"),
      ".factory/templates/x/template.md": "body\n",
    });
    try {
      expect((await loadFactory(created.root)).problems).toContainEqual({
        level: "error",
        file: FILE,
        line: 4,
        message: 'Template ".factory/templates/x/template.md" is part of a skill, so it would be installed',
        fix: "Move it out of the skill directory",
      });
    } finally {
      await created.cleanup();
    }
  });

  test("rejects a template beside a Skill.md discovery would skip", async () => {
    const created = await makeRepo({
      [FILE]: factoryYaml(
        "path: opencode.json\n    description: Agents\n    template: .factory/templates/x/template.md",
      ),
      ".factory/templates/x/Skill.md": "# A note\n",
      ".factory/templates/x/template.md": "body\n",
    });
    try {
      expect((await loadFactory(created.root)).problems.map((problem) => problem.message)).toContain(
        'Template ".factory/templates/x/template.md" is part of a skill, so it would be installed',
      );
    } finally {
      await created.cleanup();
    }
  });

  test("rejects a template in a dot directory that holds SKILL.md", async () => {
    const created = await makeRepo({
      [FILE]: factoryYaml(
        "path: opencode.json\n    description: Agents\n    template: .factory/templates/.hidden/template.md",
      ),
      ".factory/templates/.hidden/SKILL.md": "# A note\n",
      ".factory/templates/.hidden/template.md": "body\n",
    });
    try {
      expect((await loadFactory(created.root)).problems.map((problem) => problem.message)).toContain(
        'Template ".factory/templates/.hidden/template.md" is part of a skill, so it would be installed',
      );
    } finally {
      await created.cleanup();
    }
  });

  test("rejects a missing template", async () => {
    const repo = await loadProblems({ ".factory/templates/setup/other.json": "{}\n" });
    try {
      expect(repo.problems).toEqual([
        {
          level: "error",
          file: FILE,
          line: 4,
          message: 'Template ".factory/templates/setup/opencode.json" does not exist',
          fix: "Add the file or correct the path",
        },
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  test("rejects a directory at the template path", async () => {
    const created = await makeRepo({
      [FILE]: factoryYaml(TEMPLATE_ENTRY),
      ".factory/templates/setup/opencode.json/inside.md": "body\n",
    });
    try {
      expect((await loadFactory(created.root)).problems.map((problem) => problem.message)).toContain(
        'Template ".factory/templates/setup/opencode.json" is not a regular file inside .factory/',
      );
    } finally {
      await created.cleanup();
    }
  });

  test.skipIf(cannotLink)("rejects a link that resolves outside .factory/", async () => {
    const created = await makeRepo({
      [FILE]: factoryYaml(TEMPLATE_ENTRY),
      "outside.json": "{}\n",
    });
    try {
      await mkdir(created.path(".factory", "templates", "setup"), { recursive: true });
      await symlink(
        created.path("outside.json"),
        created.path(".factory", "templates", "setup", "opencode.json"),
      );

      expect((await loadFactory(created.root)).problems).toContainEqual({
        level: "error",
        file: FILE,
        line: 4,
        message:
          'Template ".factory/templates/setup/opencode.json" is not a regular file inside .factory/',
        fix: "Replace it with a file",
      });
    } finally {
      await created.cleanup();
    }
  });

  test.skipIf(cannotLink)("accepts a link that resolves to a file inside .factory/", async () => {
    const created = await makeRepo({
      [FILE]: factoryYaml(TEMPLATE_ENTRY),
      ".factory/templates/setup/base.json": "{}\n",
    });
    try {
      await symlink(
        created.path(".factory", "templates", "setup", "base.json"),
        created.path(".factory", "templates", "setup", "opencode.json"),
      );

      expect((await loadFactory(created.root)).problems).toEqual([]);
    } finally {
      await created.cleanup();
    }
  });

  test.skipIf(cannotTestPermissions)("reports an unreadable templates directory", async () => {
    const repo = await loadProblems({ ".factory/templates/setup/opencode.json": "{}\n" });
    const directory = `${repo.root}/.factory/templates`;
    try {
      await chmod(directory, 0o000);
      const problems = (await loadFactory(repo.root)).problems;

      expect(problems).toContainEqual({
        level: "error",
        file: ".factory/templates",
        line: 1,
        message: "Cannot read directory .factory/templates",
        fix: "Check its permissions or restore the directory",
      });
    } finally {
      await chmod(directory, 0o755);
      await repo.cleanup();
    }
  });
});

describe("validateFab with rule 12 and rule 13", () => {
  function rejectedProblems(error: unknown): MetafabError {
    expect(error).toBeInstanceOf(MetafabError);
    const failure = error as MetafabError;
    expect(failure.exitCode).toBe(ExitCode.InvalidFab);
    expect(failure.code).toBe("invalid-fab");
    return failure;
  }

  test("rejects a fab whose required path breaks rule 12", async () => {
    const repo = await makeRepo({
      [FILE]: factoryYaml("path: ../outside.json\n    description: Bad"),
    });
    try {
      const error = await validateFab(repo.root, { sourceLabel: "github:seasb/broken" }).then(
        () => undefined,
        (failure: unknown) => rejectedProblems(failure),
      );

      expect(error?.problems).toEqual([
        expect.objectContaining({
          level: "error",
          file: "github:seasb/broken/.factory/factory.yaml",
          line: 4,
          message: 'Required path "../outside.json" leaves the repository',
        }),
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  test("rejects a fab whose template breaks rule 13", async () => {
    const repo = await makeRepo({
      [FILE]: factoryYaml(
        "path: opencode.json\n    description: Agents\n    template: .factory/templates/missing.json",
      ),
    });
    try {
      const error = await validateFab(repo.root, { sourceLabel: "github:seasb/broken" }).then(
        () => undefined,
        (failure: unknown) => rejectedProblems(failure),
      );

      expect(error?.problems).toEqual([
        expect.objectContaining({
          level: "error",
          file: "github:seasb/broken/.factory/factory.yaml",
          line: 4,
          message: 'Template ".factory/templates/missing.json" does not exist',
        }),
      ]);
    } finally {
      await repo.cleanup();
    }
  });
});
