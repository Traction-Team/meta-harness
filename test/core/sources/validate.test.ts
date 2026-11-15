import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import { dropPayloadFiles, validateFab } from "../../../src/core/sources/index.js";
import { pathExists } from "../../../src/util/fs.js";

const FIXTURES = fileURLToPath(new URL("../../fixtures/fabs/", import.meta.url));

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "metafab-validate-"));
}

describe("validateFab", () => {
  test("accepts a valid fab and reports its factory directory", async () => {
    const result = await validateFab(path.join(FIXTURES, "valid-fab"), {
      sourceLabel: "github:seasb/sample-fab",
    });

    expect(result.format).toBe(1);
    expect(result.factoryDir).toBe(path.join(path.resolve(FIXTURES, "valid-fab"), ".factory"));
  });

  test("validates without changing the tree", async () => {
    const base = await tempDir();
    try {
      const root = path.join(base, "fab");
      await cp(path.join(FIXTURES, "valid-fab"), root, { recursive: true });
      await writeFile(path.join(root, ".factory", "metafab.yaml"), "upstream:\n  source: ./other\n");
      await writeFile(path.join(root, ".factory", "README.md"), "project factory readme");

      const result = await validateFab(root, { sourceLabel: "file:./fab" });

      expect(result.format).toBe(1);
      expect(await pathExists(path.join(root, ".factory", "metafab.yaml"))).toBe(true);
      expect(await pathExists(path.join(root, ".factory", "README.md"))).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("dropPayloadFiles removes metafab.yaml and README.md from a copy", async () => {
    const base = await tempDir();
    try {
      const root = path.join(base, "fab");
      await cp(path.join(FIXTURES, "valid-fab"), root, { recursive: true });
      await writeFile(path.join(root, ".factory", "metafab.yaml"), "upstream:\n  source: ./other\n");
      await writeFile(path.join(root, ".factory", "README.md"), "project factory readme");

      await dropPayloadFiles(root);

      expect(await pathExists(path.join(root, ".factory", "metafab.yaml"))).toBe(false);
      expect(await pathExists(path.join(root, ".factory", "README.md"))).toBe(false);
      expect(await pathExists(path.join(root, ".factory", "AGENTS.md"))).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects an invalid fab with problems prefixed by the source", async () => {
    try {
      await validateFab(path.join(FIXTURES, "invalid-fab"), { sourceLabel: "github:seasb/broken" });
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      const failure = error as MetafabError;
      expect(failure.exitCode).toBe(ExitCode.InvalidFab);
      expect(failure.code).toBe("invalid-fab");
      const files = failure.problems?.map((problem) => problem.file) ?? [];
      expect(files).toContain("github:seasb/broken/.factory/skills/broken/SKILL.md");
      return;
    }
    throw new Error("expected validation to fail");
  });

  test("accepts a format 2 fab and reports its format", async () => {
    const base = await tempDir();
    try {
      const root = path.join(base, "fab");
      await mkdir(path.join(root, ".factory"), { recursive: true });
      await writeFile(
        path.join(root, ".factory", "factory.yaml"),
        "format: 2\nname: sample\nenv:\n  harness:\n    values: [amp, claude]\n",
      );

      const result = await validateFab(root, { sourceLabel: "file:./fab" });

      expect(result.format).toBe(2);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects an unknown package.json format", async () => {
    await expect(
      validateFab(path.join(FIXTURES, "valid-fab"), {
        sourceLabel: "@seasb/sample-fab@1.0.0",
        packageJson: { name: "@seasb/sample-fab", metafab: { format: 3 } },
      }),
    ).rejects.toMatchObject({
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
      problems: [
        {
          message: "Unknown factory format 3",
          fix: "Use format 1 or 2, or upgrade @seasb/metafab",
        },
      ],
    });
  });

  test("rejects an unknown factory.yaml format", async () => {
    const base = await tempDir();
    try {
      const root = path.join(base, "fab");
      await mkdir(path.join(root, ".factory"), { recursive: true });
      await writeFile(path.join(root, ".factory", "factory.yaml"), "format: 3\nname: future\n");

      await expect(validateFab(root, { sourceLabel: "file:./fab" })).rejects.toMatchObject({
        exitCode: ExitCode.InvalidFab,
        code: "invalid-fab",
        problems: [
          {
            message: "Unknown factory format 3",
            fix: "Use format 1 or 2, or upgrade @seasb/metafab",
          },
        ],
      });
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("uses factory.yaml format when package.json has no metafab field", async () => {
    const base = await tempDir();
    try {
      const root = path.join(base, "fab");
      await mkdir(path.join(root, ".factory"), { recursive: true });
      await writeFile(path.join(root, ".factory", "factory.yaml"), "format: 1\nname: sample\n");

      const result = await validateFab(root, {
        sourceLabel: "file:./fab",
        packageJson: { name: "sample-fab" },
      });

      expect(result.format).toBe(1);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects a fab without .factory", async () => {
    const base = await tempDir();
    try {
      await expect(validateFab(base, { sourceLabel: "file:./empty" })).rejects.toMatchObject({
        exitCode: ExitCode.InvalidFab,
        code: "invalid-fab",
      });
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
