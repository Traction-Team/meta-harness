import { describe, expect, test } from "vitest";
import { markdownParts } from "../../../src/core/env/markdown.js";

describe("markdownParts", () => {
  test("the prefix and body are always the whole text", () => {
    const texts = [
      "no frontmatter\n",
      "---\nname: x\n---\n\n# Demo\n",
      "---\nname: x\n---\n\n# Demo",
      "---\nname: x\n---\n",
      "---\nname: x\n---",
      "---\n---",
      "---\nname: x\n",
    ];

    for (const text of texts) {
      const parts = markdownParts(text);
      expect(`${parts.prefix}${parts.body}`, JSON.stringify(text)).toBe(text);
    }
  });

  test("a file that ends at its closing --- gains no newline", () => {
    const text = "---\nvalue: example\n---";
    const parts = markdownParts(text);

    expect(parts.frontmatter).toBe("value: example");
    expect(parts.closed).toBe(true);
    expect(parts.prefix).toBe(text);
    expect(parts.body).toBe("");
    expect(parts.firstLine).toBe(4);
  });
});
