import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Problem } from "../../errors.js";
import { toLF } from "../../util/text.js";
import { textContent } from "../build/skill.js";

const FACTORY_DIR = ".factory";

interface FactoryFile {
  /** Repository-relative path with forward slashes. */
  path: string;
  target: string;
}

async function walkFactoryFiles(root: string): Promise<FactoryFile[]> {
  const files: FactoryFile[] = [];

  async function walk(directory: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      // A missing or unreadable .factory directory is reported by loadFactory.
      return;
    }

    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

    for (const entry of entries) {
      const relativePath = `${prefix}/${entry.name}`;
      const target = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await walk(target, relativePath);
      } else if (entry.isFile()) {
        files.push({ path: relativePath, target });
      }
      // Symbolic links are not followed: they may point outside .factory/.
    }
  }

  await walk(path.join(root, FACTORY_DIR), FACTORY_DIR);
  files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return files;
}

function markerLine(line: string): boolean {
  return (
    line === "=======" ||
    line.startsWith("<<<<<<< ") ||
    line.startsWith(">>>>>>> ") ||
    line.startsWith("||||||| ")
  );
}

/**
 * Reports the first unresolved Git conflict marker in each text file under
 * `.factory/`. Binary files are skipped.
 */
export async function scanConflictMarkers(root: string): Promise<Problem[]> {
  const problems: Problem[] = [];

  for (const file of await walkFactoryFiles(root)) {
    let data: Buffer;
    try {
      data = await readFile(file.target);
    } catch {
      // The factory loader reports unreadable paths; do not duplicate it here.
      continue;
    }

    const text = textContent(data);
    if (text === undefined) continue;

    const lines = toLF(text).split("\n");
    const index = lines.findIndex(markerLine);
    if (index === -1) continue;

    problems.push({
      level: "error",
      file: file.path,
      line: index + 1,
      message: "Unresolved conflict marker",
      fix: "Resolve the conflict, then run metafab build",
    });
  }

  return problems;
}

/**
 * Reports every `*.upstream` file left behind by a conflicted update.
 */
export async function scanUpstreamFiles(root: string): Promise<Problem[]> {
  const problems: Problem[] = [];

  for (const file of await walkFactoryFiles(root)) {
    if (!path.posix.basename(file.path).endsWith(".upstream")) continue;

    problems.push({
      level: "error",
      file: file.path,
      line: 1,
      message: "Unresolved .upstream conflict file",
      fix: "Merge or delete the file, then run metafab build",
    });
  }

  return problems;
}
