import { describe, expect, test } from "vitest";
import { parseFrontmatter } from "../../../src/util/frontmatter.js";
import type { FrontmatterResult } from "../../../src/util/frontmatter.js";

function parsed(result: FrontmatterResult): Extract<FrontmatterResult, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected the frontmatter to parse");
  return result;
}

function rejected(result: FrontmatterResult): Extract<FrontmatterResult, { ok: false }> {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected the frontmatter to fail");
  return result;
}

describe("parseFrontmatter", () => {
  test("splits an LF frontmatter block from the body", () => {
    const result = parsed(parseFrontmatter("---\nname: demo\ndescription: Demo.\n---\n\n# Demo\n"));

    expect(result.text).toBe("name: demo\ndescription: Demo.");
    expect(result.body).toBe("\n# Demo\n");
    expect(result.value).toEqual({ name: "demo", description: "Demo." });
    expect(result.startLine).toBe(1);
    expect(result.endLine).toBe(4);
  });

  test("gives the same result for CRLF input", () => {
    const lf = parsed(parseFrontmatter("---\nname: demo\ndescription: Demo.\n---\n\n# Demo\n"));
    const crlf = parsed(parseFrontmatter("---\r\nname: demo\r\ndescription: Demo.\r\n---\r\n\r\n# Demo\r\n"));

    expect(crlf.text).toBe(lf.text);
    expect(crlf.body).toBe(lf.body);
    expect(crlf.value).toEqual(lf.value);
    expect(crlf.startLine).toBe(lf.startLine);
    expect(crlf.endLine).toBe(lf.endLine);
  });

  test("offsets YAML errors to the real file line", () => {
    const result = rejected(parseFrontmatter("---\nname: one\nname: two\n---\nbody\n"));

    expect(result.problems).toEqual([
      { message: "Map keys must be unique", line: 3, fix: "Fix the YAML syntax on this line" },
    ]);
  });

  test("offsets a top-level type error to the real file line", () => {
    const result = rejected(parseFrontmatter("---\n- one\n- two\n---\nbody\n"));

    expect(result.problems[0]).toMatchObject({
      message: "Top-level value must be a mapping",
      line: 2,
    });
  });

  test("treats an empty block as an empty mapping", () => {
    const result = parsed(parseFrontmatter("---\n---\nbody\n"));

    expect(result.text).toBe("");
    expect(result.body).toBe("body\n");
    expect(result.value).toEqual({});
    expect(result.startLine).toBe(1);
    expect(result.endLine).toBe(2);
  });

  test("rejects a file without frontmatter on line 1", () => {
    const result = rejected(parseFrontmatter("name: demo\n"));

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]?.line).toBe(1);
    expect(result.problems[0]?.message).toContain("Missing frontmatter");
  });

  test("rejects an empty file on line 1", () => {
    const result = rejected(parseFrontmatter(""));

    expect(result.problems[0]?.line).toBe(1);
    expect(result.problems[0]?.message).toContain("Missing frontmatter");
  });

  test("rejects an unterminated block on line 1", () => {
    const result = rejected(parseFrontmatter("---\nname: demo\n"));

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]?.line).toBe(1);
    expect(result.problems[0]?.message).toContain("Unterminated frontmatter");
  });

  test("rejects an alias with no anchor on its file line", () => {
    const result = rejected(parseFrontmatter("---\nname: demo\ndescription: *missing\n---\nbody\n"));

    expect(result.problems).toEqual([
      {
        message: "Alias *missing has no anchor",
        line: 3,
        fix: "Remove the alias or define its anchor before it",
      },
    ]);
  });

  test("rejects an alias reused past the limit on its file line", () => {
    const aliases = Array.from({ length: 120 }, (_, index) => `  - workflow-${index}: *gate`);
    const result = rejected(
      parseFrontmatter(
        ["---", "name: demo", "description: Demo.", "support: &gate value", "workflows:", ...aliases, "---", "body"].join(
          "\n",
        ),
      ),
    );

    expect(result.problems).toEqual([
      {
        message: "Alias *gate is aliased too many times",
        line: 105,
        fix: "Use the anchor fewer times or write the values out",
      },
    ]);
  });
});
