import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { validateFab } from "../../../src/core/sources/index.js";
import { ExitCode, MetafabError } from "../../../src/errors.js";

const FACTORY_YAML = [
  "format: 2",
  "name: sample",
  "env:",
  "  harness: { values: [amp, claude] }",
  "",
].join("\n");

const PLAN_SKILL = [
  "---",
  "name: plan",
  "description: Plan a slice. Use when starting.",
  "---",
  "",
  "# Plan",
  "",
  "<!-- factory:import ../../partials/sub-agents.md -->",
  "",
].join("\n");

describe("validateFab with imports", () => {
  test("refuses a fab whose workflow imports a missing partial", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "metafab-fab-import-"));
    try {
      const root = path.join(base, "fab");
      await mkdir(path.join(root, ".factory", "workflows", "plan"), { recursive: true });
      await writeFile(path.join(root, ".factory", "factory.yaml"), FACTORY_YAML);
      await writeFile(path.join(root, ".factory", "workflows", "plan", "SKILL.md"), PLAN_SKILL);

      const failure = await validateFab(root, { sourceLabel: "file:./fab" }).then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(MetafabError);
      expect((failure as MetafabError).exitCode).toBe(ExitCode.InvalidFab);
      expect((failure as MetafabError).problems).toEqual([
        {
          level: "error",
          file: "file:./fab/.factory/workflows/plan/SKILL.md",
          line: 8,
          message: 'Import "../../partials/sub-agents.md" does not exist',
          fix: "Add the file, or write the path of a file in .factory/",
        },
      ]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
