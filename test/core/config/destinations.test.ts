import { describe, expect, test } from "vitest";
import { destinations } from "../../../src/core/config.js";

describe("destinations", () => {
  test("maps claude to .claude/skills", () => {
    expect(destinations(["claude"])).toEqual([{ directory: ".claude/skills", targets: ["claude"] }]);
  });

  test("maps every other target to .agents/skills", () => {
    expect(destinations(["codex"])).toEqual([{ directory: ".agents/skills", targets: ["codex"] }]);
    expect(destinations(["cursor"])).toEqual([{ directory: ".agents/skills", targets: ["cursor"] }]);
    expect(destinations(["opencode"])).toEqual([{ directory: ".agents/skills", targets: ["opencode"] }]);
    expect(destinations(["copilot"])).toEqual([{ directory: ".agents/skills", targets: ["copilot"] }]);
  });

  test("claude and codex give two destinations", () => {
    expect(destinations(["claude", "codex"])).toEqual([
      { directory: ".claude/skills", targets: ["claude"] },
      { directory: ".agents/skills", targets: ["codex"] },
    ]);
  });

  test("codex and cursor share one destination", () => {
    expect(destinations(["codex", "cursor"])).toEqual([
      { directory: ".agents/skills", targets: ["codex", "cursor"] },
    ]);
  });

  test("keeps the first destination order", () => {
    expect(destinations(["codex", "claude", "cursor"])).toEqual([
      { directory: ".agents/skills", targets: ["codex", "cursor"] },
      { directory: ".claude/skills", targets: ["claude"] },
    ]);
  });

  test("deduplicates repeated targets", () => {
    expect(destinations(["codex", "codex"])).toEqual([
      { directory: ".agents/skills", targets: ["codex"] },
    ]);
  });

  test("no targets gives no destinations", () => {
    expect(destinations([])).toEqual([]);
  });
});
