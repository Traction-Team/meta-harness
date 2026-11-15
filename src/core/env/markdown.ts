export interface MarkdownParts {
  /** The frontmatter lines, without their `---` fences, when the file starts with one. */
  frontmatter?: string;
  /** False when a file that starts with `---` has no closing `---` line. */
  closed: boolean;
  /**
   * Everything before `body`, byte for byte, including the newline that ends a
   * frontmatter block; "" when the file has none. `prefix + body` is `text`.
   */
  prefix: string;
  body: string;
  /** Line number of the body's first line in the file. */
  firstLine: number;
}

/**
 * Splits frontmatter from body the way `build` handles every Markdown file it
 * renders: a file that starts with a `---` line has frontmatter up to the next
 * `---` line. Without a closing `---` the rest of the file is frontmatter, so no
 * directive in it is live. Validation and rendering split with this one
 * function, so a fence in frontmatter cannot hide a directive in the body.
 */
export function markdownParts(text: string): MarkdownParts {
  const lines = text.split("\n");
  if (lines[0] !== "---") return { closed: true, prefix: "", body: text, firstLine: 1 };

  const closing = lines.indexOf("---", 1);
  if (closing === -1) {
    return {
      frontmatter: lines.slice(1).join("\n"),
      closed: false,
      prefix: text,
      body: "",
      firstLine: lines.length + 1,
    };
  }

  return {
    frontmatter: lines.slice(1, closing).join("\n"),
    closed: true,
    prefix: `${lines.slice(0, closing + 1).join("\n")}\n`,
    body: lines.slice(closing + 1).join("\n"),
    firstLine: closing + 2,
  };
}
