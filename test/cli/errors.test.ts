import { describe, expect, test } from "vitest";
import { ExitCode, MetafabError } from "../../src/errors.js";
import { NeedsInput } from "../../src/input.js";

describe("ExitCode", () => {
  test("has the v1 values", () => {
    expect(ExitCode.Ok).toBe(0);
    expect(ExitCode.Failed).toBe(1);
    expect(ExitCode.NeedsInput).toBe(2);
    expect(ExitCode.FetchFailed).toBe(3);
    expect(ExitCode.InvalidFab).toBe(4);
    expect(ExitCode.NotOwned).toBe(5);
  });
});

describe("MetafabError", () => {
  test("defaults to a failed exit code", () => {
    const error = new MetafabError("broken");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MetafabError");
    expect(error.exitCode).toBe(ExitCode.Failed);
    expect(error.code).toBe("error");
    expect(error.problems).toBeUndefined();
  });

  test("keeps the given exit code, problems and details", () => {
    const problems = [{ level: "error" as const, file: "a.yaml", message: "bad" }];
    const error = new MetafabError("invalid fab", {
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
      problems,
      details: { path: "a.yaml" },
    });

    expect(error.exitCode).toBe(ExitCode.InvalidFab);
    expect(error.code).toBe("invalid-fab");
    expect(error.problems).toEqual(problems);
    expect(error.details).toEqual({ path: "a.yaml" });
  });
});

describe("NeedsInput", () => {
  test("carries every required value and exit code 2", () => {
    const required = [
      { name: "description", flag: "--description", description: "Skill description" },
      { name: "agent", description: "Agent tool", choices: ["claude", "codex"] },
    ];
    const error = new NeedsInput(required);

    expect(error).toBeInstanceOf(MetafabError);
    expect(error.exitCode).toBe(ExitCode.NeedsInput);
    expect(error.code).toBe("needs-input");
    expect(error.required).toEqual(required);
    expect(error.details).toEqual({ required });
    expect(error.message).toContain("description, agent");
  });
});
