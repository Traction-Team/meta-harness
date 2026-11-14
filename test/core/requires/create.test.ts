import { afterEach, describe, expect, test, vi } from "vitest";
import type { Problem } from "../../../src/errors.js";
import { createRequirements } from "../../../src/core/requires/setup.js";
import type { RequirementResult } from "../../../src/core/requires/inspect.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";

/** Targets whose `writeFile` fails, as a permission error or a lost race. */
const state = vi.hoisted(() => ({
  denied: new Set<string>(),
  exists: new Set<string>(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const writeFile = vi.fn(
    async (target: unknown, data: unknown, options?: unknown): Promise<void> => {
      const name = String(target);
      if (state.denied.has(name)) {
        throw Object.assign(new Error("EACCES: permission denied, open"), { code: "EACCES" });
      }
      if (state.exists.has(name)) {
        throw Object.assign(new Error("EEXIST: file already exists, open"), { code: "EEXIST" });
      }
      return (actual.writeFile as unknown as (
        target: unknown,
        data: unknown,
        options?: unknown,
      ) => Promise<void>)(target, data, options);
    },
  );
  return { ...actual, writeFile };
});

const repos: TempRepo[] = [];

afterEach(async () => {
  state.denied.clear();
  state.exists.clear();
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

function result(path: string, template: string): RequirementResult {
  return { path, description: "Needed.", template, state: "missing" };
}

describe("createRequirements failures", () => {
  test("a lost race is present, not a warning", async () => {
    const repo = await makeRepo({
      ".factory/templates/setup/opencode.json": "{}\n",
    });
    repos.push(repo);
    state.exists.add(repo.path("opencode.json"));
    const problems: Problem[] = [];

    const results = await createRequirements(
      repo.root,
      [result("opencode.json", ".factory/templates/setup/opencode.json")],
      problems,
    );

    expect(results[0]?.state).toBe("present");
    expect(problems).toEqual([]);
  });

  test("a permission error fails one file, warns, and returns the rest", async () => {
    const repo = await makeRepo({
      ".factory/templates/setup/opencode.json": "{}\n",
      ".factory/templates/docs/roadmap.md": "# Roadmap\n",
    });
    repos.push(repo);
    state.denied.add(repo.path("opencode.json"));
    const problems: Problem[] = [];

    const results = await createRequirements(
      repo.root,
      [
        result("opencode.json", ".factory/templates/setup/opencode.json"),
        result("docs/roadmap.md", ".factory/templates/docs/roadmap.md"),
      ],
      problems,
    );

    expect(results.map((entry) => entry.state)).toEqual(["failed", "created"]);
    expect(results[0]?.reason).toBe("EACCES");
    expect(problems).toEqual([
      {
        level: "warning",
        file: "opencode.json",
        message: "Could not create opencode.json: EACCES",
        fix: "Copy .factory/templates/setup/opencode.json to opencode.json",
      },
    ]);
  });
});
