import { describe, expect, test } from "vitest";
import { ExitCode } from "../../src/errors.js";
import { formatProblem, renderResult, summarizeResult } from "../../src/output.js";
import type { CommandResult } from "../../src/output.js";

const failed: CommandResult = {
  ok: false,
  command: "check",
  exitCode: ExitCode.Failed,
  problems: [
    {
      level: "error",
      file: ".factory/factory.yaml",
      line: 8,
      message: "unknown workflow",
      fix: "Did you mean review-slice?",
    },
    { level: "warning", file: ".factory/AGENTS.md", message: "empty file" },
  ],
};

describe("renderResult", () => {
  test("writes one JSON object to stdout in JSON mode", () => {
    const rendered = renderResult(failed, { json: true });
    expect(rendered.stderr).toBe("");
    expect(JSON.parse(rendered.stdout)).toEqual(failed);
  });

  test("writes the summary to stdout and problems to stderr in human mode", () => {
    const rendered = renderResult(failed);
    expect(rendered.stderr).toContain(".factory/factory.yaml:8: error: unknown workflow");
    expect(rendered.stderr).toContain("  fix: Did you mean review-slice?");
    expect(rendered.stderr).toContain(".factory/AGENTS.md: warning: empty file");
    expect(rendered.stdout).toBe("check: failed (1 error, 1 warning)\n");
  });

  test("uses a command-provided summary", () => {
    const result: CommandResult = {
      ok: true,
      command: "build",
      exitCode: ExitCode.Ok,
      summary: "Installed 3 skills.",
    };
    expect(renderResult(result).stdout).toBe("Installed 3 skills.\n");
  });
});

describe("summarizeResult", () => {
  test("reports success without counts", () => {
    expect(summarizeResult({ ok: true, command: "map", exitCode: ExitCode.Ok })).toBe("map: ok");
  });
});

describe("formatProblem", () => {
  test("omits the line number when absent", () => {
    expect(formatProblem({ level: "warning", file: "a.md", message: "note" })).toBe("a.md: warning: note");
  });
});
