import { describe, expect, test } from "vitest";
import { skillFileText } from "../../../src/core/edit/index.js";

describe("skillFileText", () => {
  test("writes valid frontmatter and a heading from the name", () => {
    expect(skillFileText("review-slice", "Review a slice before it merges.")).toBe(`---
name: review-slice
description: Review a slice before it merges.
---

# Review slice
`);
  });

  test("quotes a description when YAML needs it", () => {
    expect(skillFileText("advise", "Advise: use slices.")).toBe(`---
name: advise
description: "Advise: use slices."
---

# Advise
`);
  });

  test("keeps a long description on one line", () => {
    const description = "Use when ".repeat(20).trim();

    expect(skillFileText("long", description)).toBe(`---
name: long
description: ${description}
---

# Long
`);
  });
});
