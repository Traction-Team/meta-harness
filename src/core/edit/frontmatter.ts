import { MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { parseFrontmatter } from "../../util/frontmatter.js";
import { serializeYamlDocument, setScalarField } from "./document.js";

export const SKILL_FILE = "SKILL.md";

function frontmatterProblem(file: string, message: string, line?: number, fix?: string): Problem {
  return {
    level: "error",
    file,
    ...(line === undefined ? {} : { line }),
    message,
    ...(fix === undefined ? {} : { fix }),
  };
}

export function setFrontmatterName(text: string, name: string, file = SKILL_FILE): string {
  const parsed = parseFrontmatter(text);

  if (!parsed.ok) {
    throw new MetafabError(`${file}: ${parsed.problems[0]?.message ?? "Invalid frontmatter"}`, {
      code: "frontmatter-invalid",
      problems: parsed.problems.map((problem) =>
        frontmatterProblem(file, problem.message, problem.line, problem.fix),
      ),
    });
  }

  setScalarField(parsed.document, "name", name);

  return `---\n${serializeYamlDocument(parsed.document)}---\n${parsed.body}`;
}
