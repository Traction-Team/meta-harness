import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";

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

/**
 * Refuses a symbolic link at the root `.gitattributes` that `command` would
 * write through. `lstat` finds the link itself; `readFile` follows it, so a
 * dangling link reads as empty and counts as a file that needs every line.
 *
 * A link to an existing file that already has every line needs no write and is
 * left alone.
 */
export async function assertGitattributesWritable(
  root: string,
  command: "init" | "import",
): Promise<void> {
  const file = path.join(root, GITATTRIBUTES_FILE);

  let info;
  try {
    info = await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  if (!info.isSymbolicLink()) return;

  let existing: string | undefined;
  try {
    existing = await readFile(file, "utf8");
  } catch {
    // A dangling link has no content, so every line is still missing.
    existing = undefined;
  }

  if (!addGitattributesLines(existing).changed) return;

  const message = `${GITATTRIBUTES_FILE} is a symbolic link, so metafab ${command} will not write through it`;
  throw new MetafabError(message, {
    exitCode: ExitCode.Failed,
    code: "factory-unreadable",
    problems: [
      {
        level: "error",
        file: GITATTRIBUTES_FILE,
        message,
        fix: `Replace it with a regular file, then run metafab ${command} again`,
      },
    ],
  });
}
