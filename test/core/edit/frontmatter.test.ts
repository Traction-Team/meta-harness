import { describe, expect, test } from "vitest";
import { MetafabError } from "../../../src/errors.js";
import { setFrontmatterName } from "../../../src/core/edit/index.js";

const SOURCE = `---
# Who this is
name: old-name # keep this comment
description: Does a thing.
metadata:
  owner: team
---

# Old name

Body.
`;

describe("setFrontmatterName", () => {
  test("updates name and keeps other fields and comments", () => {
    expect(setFrontmatterName(SOURCE, "new-name")).toBe(`---
# Who this is
name: new-name # keep this comment
description: Does a thing.
metadata:
  owner: team
---

# Old name

Body.
`);
  });

  test("adds a missing name field", () => {
    const text = setFrontmatterName("---\ndescription: No name\n---\n\nBody.\n", "added");

    expect(text).toBe("---\ndescription: No name\nname: added\n---\n\nBody.\n");
  });

  test("keeps the body exactly", () => {
    const body = "# Title\n\n- one\n- two\n";
    const text = setFrontmatterName(`---\nname: a\ndescription: D\n---\n\n${body}`, "b");

    expect(text.endsWith(`---\n\n${body}`)).toBe(true);
  });

  test("rejects a file without frontmatter", () => {
    expect(() => setFrontmatterName("# No frontmatter\n", "name")).toThrowError(MetafabError);
  });

  test("rejects unterminated frontmatter", () => {
    expect(() => setFrontmatterName("---\nname: a\n", "name")).toThrowError(MetafabError);
  });
});
