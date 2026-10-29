import { Readable } from "node:stream";
import { describe, expect, test, vi } from "vitest";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import { parseAgentsFlag, selectTargets } from "../../../src/core/init/targets.js";
import type { TargetPrompt } from "../../../src/core/init/targets.js";

function failureOf(run: () => unknown): MetafabError {
  try {
    run();
  } catch (error) {
    if (error instanceof MetafabError) return error;
    throw error;
  }
  throw new Error("Expected the call to fail.");
}

describe("parseAgentsFlag", () => {
  test("parses a comma-separated list", () => {
    expect(parseAgentsFlag("claude,codex")).toEqual(["claude", "codex"]);
  });

  test("trims entries", () => {
    expect(parseAgentsFlag(" claude , codex ")).toEqual(["claude", "codex"]);
  });

  test("accepts all", () => {
    expect(parseAgentsFlag("all")).toBe("all");
  });

  test("keeps the first occurrence of a repeated target", () => {
    expect(parseAgentsFlag("codex,claude,codex")).toEqual(["codex", "claude"]);
  });

  test("rejects an unknown target with a usage error", () => {
    const error = failureOf(() => parseAgentsFlag("claude,nope"));

    expect(error.exitCode).toBe(ExitCode.Failed);
    expect(error.code).toBe("invalid-agents");
    expect(error.message).toBe('Unknown agent target "nope" in --agents.');
    expect(error.problems).toEqual([
      {
        level: "error",
        file: "metafab",
        message: 'Unknown agent target "nope" in --agents.',
        fix: "Use a comma-separated list of claude, codex, cursor, opencode, copilot, or all.",
      },
    ]);
  });

  test("rejects an empty list", () => {
    const error = failureOf(() => parseAgentsFlag(""));

    expect(error.exitCode).toBe(ExitCode.Failed);
    expect(error.message).toBe("--agents requires at least one target.");
  });

  test("rejects a trailing comma", () => {
    const error = failureOf(() => parseAgentsFlag("claude,"));

    expect(error.exitCode).toBe(ExitCode.Failed);
    expect(error.message).toBe('Invalid value for --agents: "claude,".');
  });
});

describe("selectTargets", () => {
  test("--agents wins over the existing configuration and the prompt", async () => {
    const prompt = vi.fn<TargetPrompt>(async () => ["cursor"]);

    const selected = await selectTargets({
      agents: "codex",
      existing: ["claude"],
      io: { tty: true },
      prompt,
    });

    expect(selected).toEqual(["codex"]);
    expect(prompt).not.toHaveBeenCalled();
  });

  test("uses the existing metafab.yaml agents when --agents is absent", async () => {
    const prompt = vi.fn<TargetPrompt>(async () => ["cursor"]);

    const selected = await selectTargets({
      existing: ["claude", "codex"],
      io: { tty: true },
      prompt,
    });

    expect(selected).toEqual(["claude", "codex"]);
    expect(prompt).not.toHaveBeenCalled();
  });

  test("keeps all from the existing configuration", async () => {
    expect(await selectTargets({ existing: "all", io: { tty: true } })).toBe("all");
  });

  test("prompts in a terminal", async () => {
    const prompt = vi.fn<TargetPrompt>(async () => ["opencode"]);

    const selected = await selectTargets({ io: { tty: true }, prompt });

    expect(selected).toEqual(["opencode"]);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt.mock.calls[0]?.[0]).toEqual(["claude", "codex", "cursor", "opencode", "copilot"]);
    expect(prompt.mock.calls[0]?.[1]).toEqual({ tty: true });
  });

  test("selects all without prompting when standard input is not a terminal", async () => {
    const prompt = vi.fn<TargetPrompt>(async () => ["cursor"]);

    expect(await selectTargets({ prompt })).toBe("all");
    expect(await selectTargets({ io: { tty: false }, prompt })).toBe("all");
    expect(prompt).not.toHaveBeenCalled();
  });
});

describe("promptForTargets", () => {
  test("accepts numbers from the terminal and returns the targets", async () => {
    let stderr = "";
    const io = {
      tty: true,
      stdin: Readable.from(["1,3\n"]),
      stderr: (text: string) => {
        stderr += text;
      },
    };

    const selected = await selectTargets({ io });

    expect(selected).toEqual(["claude", "cursor"]);
    expect(stderr).toContain("1. claude");
    expect(stderr).toContain("5. copilot");
  });

  test("accepts a blank answer as all", async () => {
    const io = {
      tty: true,
      stdin: Readable.from(["\n"]),
      stderr: () => {},
    };

    expect(await selectTargets({ io })).toBe("all");
  });
});
