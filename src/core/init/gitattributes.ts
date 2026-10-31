import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const GITATTRIBUTES_FILE = ".gitattributes";

export const GITATTRIBUTES_LINES = [
  ".factory/** text=auto eol=lf",
  ".claude/skills/** text=auto eol=lf",
  ".agents/skills/** text=auto eol=lf",
] as const;

export interface GitattributesChange {
  changed: boolean;
  /** The resulting file content. */
  text: string;
  /** The exact lines added, in specification order. */
  added: string[];
}

function isPresent(line: string, existing: readonly string[]): boolean {
  return existing.some((candidate) => {
    const value = candidate.trimEnd();
    return value !== "" && !value.startsWith("#") && value === line;
  });
}

export function addGitattributesLines(existing: string | undefined): GitattributesChange {
  const text = existing ?? "";
  const present = text.split(/\r?\n/);
  const missing = GITATTRIBUTES_LINES.filter((line) => !isPresent(line, present));

  if (missing.length === 0) return { changed: false, text, added: [] };

  const separator = text === "" || text.endsWith("\n") ? "" : "\n";
  return {
    changed: true,
    text: `${text}${separator}${missing.join("\n")}\n`,
    added: [...missing],
  };
}

export async function ensureGitattributes(root: string): Promise<GitattributesChange> {
  const file = path.join(root, GITATTRIBUTES_FILE);

  let existing: string | undefined;
  try {
    existing = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const change = addGitattributesLines(existing);
  if (change.changed) await writeFile(file, change.text, "utf8");
  return change;
}
