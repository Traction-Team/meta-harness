import { Readable } from "node:stream";
import { describe, expect, test } from "vitest";
import { ask, NeedsInput } from "../../src/input.js";

const description = { name: "description", flag: "--description", description: "Skill description" };

describe("ask", () => {
  test("writes its prompt to the injected stderr and reads the injected stdin", async () => {
    let stderr = "";
    const answer = await ask(description, {
      tty: true,
      stdin: Readable.from(["my skill\n"]),
      stderr: (text) => {
        stderr += text;
      },
    });

    expect(answer).toBe("my skill");
    expect(stderr).toContain("Skill description");
  });

  test("throws NeedsInput when the injected io is not a tty", async () => {
    await expect(ask(description, { tty: false })).rejects.toBeInstanceOf(NeedsInput);
  });
});
