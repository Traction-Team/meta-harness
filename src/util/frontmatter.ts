import { toLF } from "./text.js";
import { parseYaml } from "./yaml.js";
import type { YamlDocument, YamlProblem } from "./yaml.js";

export type FrontmatterResult =
  | ({ ok: true; text: string; body: string; startLine: number; endLine: number } & YamlDocument)
  | { ok: false; problems: YamlProblem[] };

const DELIMITER = "---";

function missingFrontmatter(): FrontmatterResult {
  return {
    ok: false,
    problems: [
      {
        message: "Missing frontmatter: the file must start with '---'",
        line: 1,
        fix: "Add a frontmatter block that starts with --- and ends with ---",
      },
    ],
  };
}

function unterminatedFrontmatter(): FrontmatterResult {
  return {
    ok: false,
    problems: [
      {
        message: "Unterminated frontmatter: add a closing '---' line",
        line: 1,
        fix: "Add a line that contains only --- after the frontmatter",
      },
    ],
  };
}

export function parseFrontmatter(source: string): FrontmatterResult {
  const text = toLF(source);
  if (!text.startsWith(`${DELIMITER}\n`)) {
    return missingFrontmatter();
  }

  const lines = text.split("\n");
  let closing = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === DELIMITER) {
      closing = index;
      break;
    }
  }
  if (closing === -1) {
    return unterminatedFrontmatter();
  }

  const frontmatter = lines.slice(1, closing).join("\n");
  const body = lines.slice(closing + 1).join("\n");
  const parsed = parseYaml(frontmatter, { lineOffset: 1 });
  if (!parsed.ok) {
    return parsed;
  }

  return {
    text: frontmatter,
    body,
    startLine: 1,
    endLine: closing + 1,
    ...parsed,
  };
}
