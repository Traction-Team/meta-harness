import { chmod } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { loadFactory } from "../../../src/core/factory/index.js";
import { requirementWarnings } from "../../../src/core/requires/check.js";
import { makeRepo } from "../../helpers/makeRepo.js";

const cannotTestPermissions = process.platform === "win32" || process.getuid?.() === 0;

const WITH_TEMPLATE = [
  "format: 1",
  "name: demo",
  "requires:",
  "  - path: opencode.json",
  "    description: Defines the agent-coding sub-agent",
  "    template: .factory/templates/setup/opencode.json",
  "  - path: docs/roadmap.md",
  "    description: The roadmap the workflows read",
  "",
].join("\n");

async function warnings(
  files: Record<string, string>,
  factoryYaml = WITH_TEMPLATE,
): Promise<Awaited<ReturnType<typeof requirementWarnings>>> {
  const repo = await makeRepo({ ".factory/factory.yaml": factoryYaml, ...files });
  const factory = await loadFactory(repo.root);
  try {
    return await requirementWarnings(factory);
  } finally {
    await repo.cleanup();
  }
}

describe("requirementWarnings", () => {
  test("warns about each missing file, with the copy fix when there is a template", async () => {
    const problems = await warnings({ ".factory/templates/setup/opencode.json": "{}\n" });

    expect(problems).toEqual([
      {
        level: "warning",
        file: ".factory/factory.yaml",
        line: 4,
        message:
          "Required file opencode.json is missing: Defines the agent-coding sub-agent",
        fix: "Copy .factory/templates/setup/opencode.json to opencode.json",
      },
      {
        level: "warning",
        file: ".factory/factory.yaml",
        line: 7,
        message: "Required file docs/roadmap.md is missing: The roadmap the workflows read",
        fix: "Create docs/roadmap.md",
      },
    ]);
  });

  test("says nothing about a present file, with or without a template", async () => {
    const problems = await warnings({
      ".factory/templates/setup/opencode.json": "{}\n",
      "opencode.json": "mine\n",
      "docs/roadmap.md": "# Roadmap\n",
    });

    expect(problems).toEqual([]);
  });

  test("warns about a blocked path and names the entry in the way", async () => {
    const problems = await warnings({
      ".factory/templates/setup/opencode.json": "{}\n",
      "opencode.json/inside.md": "body\n",
      "docs/roadmap.md": "# Roadmap\n",
    });

    expect(problems).toEqual([
      {
        level: "warning",
        file: ".factory/factory.yaml",
        line: 4,
        message:
          "Required file opencode.json cannot be created: opencode.json is a directory",
        fix: "Move opencode.json away, then create opencode.json",
      },
    ]);
  });

  test.skipIf(cannotTestPermissions)("says to check permissions when a parent cannot be read", async () => {
    const repo = await makeRepo({
      ".factory/factory.yaml": WITH_TEMPLATE,
      ".factory/templates/setup/opencode.json": "{}\n",
      "opencode.json": "{}\n",
      "docs/roadmap.md": "# Roadmap\n",
    });
    try {
      await chmod(repo.path("docs"), 0o000);
      const problems = await requirementWarnings(await loadFactory(repo.root));

      expect(problems).toEqual([
        {
          level: "warning",
          file: ".factory/factory.yaml",
          line: 7,
          message: "Required file docs/roadmap.md cannot be created: Cannot read docs",
          fix: "Check the permissions of docs, then run metafab check again",
        },
      ]);
    } finally {
      await chmod(repo.path("docs"), 0o755);
      await repo.cleanup();
    }
  });

  test("reports nothing without a factory.yaml", async () => {
    const repo = await makeRepo({});
    const factory = await loadFactory(repo.root);
    try {
      expect(await requirementWarnings(factory)).toEqual([]);
    } finally {
      await repo.cleanup();
    }
  });

  test("reports nothing when requires is null or empty", async () => {
    for (const tail of ["requires:\n", "requires: []\n"]) {
      const repo = await makeRepo({
        ".factory/factory.yaml": `format: 1\nname: demo\n${tail}`,
      });
      try {
        expect((await loadFactory(repo.root)).factoryYaml?.requires).toEqual([]);
        expect(await requirementWarnings(await loadFactory(repo.root))).toEqual([]);
      } finally {
        await repo.cleanup();
      }
    }
  });
});
