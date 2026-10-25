import { describe, expect, test } from "vitest";
import {
  appendMarkerBlock,
  findMarkerBlock,
  removeMarkerBlock,
  replaceMarkerBlock,
} from "../../../src/core/build/markers.js";

const factory = {
  start: "<!-- factory:start -->",
  end: "<!-- factory:end -->",
};

const gitignore = {
  start: "# metafab:start",
  end: "# metafab:end",
};

describe("findMarkerBlock", () => {
  test("finds a block and reports its line range", () => {
    const text = "before\n<!-- factory:start -->\nbody\n<!-- factory:end -->\nafter\n";
    expect(findMarkerBlock(text, factory)).toEqual({
      ok: true,
      range: { start: 1, end: 3 },
    });
  });

  test("reports no block when no markers exist", () => {
    expect(findMarkerBlock("plain text\n", factory)).toEqual({ ok: true });
  });

  test("reports a start marker without an end marker", () => {
    const result = findMarkerBlock("a\n<!-- factory:start -->\nbody\n", factory);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.line).toBe(2);
      expect(result.problem.message).toContain("without an end marker");
    }
  });

  test("reports two start markers", () => {
    const result = findMarkerBlock(
      "<!-- factory:start -->\n<!-- factory:start -->\n<!-- factory:end -->\n",
      factory,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.line).toBe(2);
      expect(result.problem.message).toContain("two start markers");
    }
  });

  test("reports an end marker without a start marker", () => {
    const result = findMarkerBlock("body\n<!-- factory:end -->\n", factory);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.line).toBe(2);
      expect(result.problem.message).toContain("without a start marker");
    }
  });
});

describe("appendMarkerBlock", () => {
  test("appends a block to an empty file", () => {
    const result = appendMarkerBlock("", factory, "body\n");
    expect(result).toEqual({
      ok: true,
      text: "<!-- factory:start -->\nbody\n<!-- factory:end -->\n",
      changed: true,
    });
  });

  test("adds one blank line before an appended block", () => {
    const result = appendMarkerBlock("# User\n", factory, "body");
    expect(result).toEqual({
      ok: true,
      text: "# User\n\n<!-- factory:start -->\nbody\n<!-- factory:end -->\n",
      changed: true,
    });
  });

  test("refuses to append when a block exists", () => {
    const result = appendMarkerBlock(
      "<!-- factory:start -->\nold\n<!-- factory:end -->\n",
      factory,
      "new",
    );
    expect(result.ok).toBe(false);
  });
});

describe("replaceMarkerBlock", () => {
  test("replaces only the text between the markers", () => {
    const text = "# User\n\n<!-- factory:start -->\nold\n<!-- factory:end -->\n\n## More\n";
    const result = replaceMarkerBlock(text, factory, "new");
    expect(result).toEqual({
      ok: true,
      text: "# User\n\n<!-- factory:start -->\nnew\n<!-- factory:end -->\n\n## More\n",
      changed: true,
    });
  });

  test("reports no change when the body is unchanged", () => {
    const text = "<!-- factory:start -->\nbody\n<!-- factory:end -->\n";
    const result = replaceMarkerBlock(text, factory, "body");
    expect(result).toEqual({ ok: true, text, changed: false });
  });

  test("fails when there is no block to replace", () => {
    const result = replaceMarkerBlock("plain\n", factory, "body");
    expect(result.ok).toBe(false);
  });
});

describe("removeMarkerBlock", () => {
  test("removes the block and one surrounding blank line", () => {
    const text = "# User\n\n<!-- factory:start -->\nbody\n<!-- factory:end -->\n\n## More\n";
    expect(removeMarkerBlock(text, factory)).toEqual({
      ok: true,
      text: "# User\n\n## More\n",
      changed: true,
    });
  });

  test("leaves an empty file when only the block exists", () => {
    const text = "<!-- factory:start -->\nbody\n<!-- factory:end -->\n";
    expect(removeMarkerBlock(text, factory)).toEqual({ ok: true, text: "", changed: true });
  });

  test("keeps a blank separator between user text before and after the block", () => {
    const text = "# Before\n<!-- factory:start -->\nbody\n<!-- factory:end -->\n\n# After\n";
    expect(removeMarkerBlock(text, factory)).toEqual({
      ok: true,
      text: "# Before\n\n# After\n",
      changed: true,
    });
  });

  test("is a no-op when no block exists", () => {
    expect(removeMarkerBlock("plain\n", factory)).toEqual({
      ok: true,
      text: "plain\n",
      changed: false,
    });
  });

  test("uses the supplied marker lines", () => {
    const text = "node_modules/\n# metafab:start\n.claude/skills/\n# metafab:end\n";
    expect(removeMarkerBlock(text, gitignore)).toEqual({
      ok: true,
      text: "node_modules/\n",
      changed: true,
    });
  });

  test("reports malformed markers instead of removing text", () => {
    const result = removeMarkerBlock("<!-- factory:start -->\nbody\n", factory);
    expect(result.ok).toBe(false);
  });
});
