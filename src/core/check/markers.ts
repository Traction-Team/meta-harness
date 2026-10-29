import { open, readdir } from "node:fs/promises";
import path from "node:path";
import type { Problem } from "../../errors.js";
import { toLF } from "../../util/text.js";
import { textContent } from "../build/skill.js";

const FACTORY_DIR = ".factory";

/** Bytes read first to recognise a binary file without loading all of it. */
const BINARY_PROBE_BYTES = 8 * 1024;

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
      // Metafab ignores directories whose name starts with "." (factory-format).
      if (entry.isDirectory() && entry.name.startsWith(".")) continue;

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

/**
 * Reads a file as text, or returns undefined for a binary file.
 *
 * The first chunk is checked for a NUL byte before the rest is read, so a large
 * binary file is not loaded into memory to be discarded.
 */
async function readTextFile(target: string): Promise<string | undefined> {
  let handle;
  try {
    handle = await open(target, "r");
  } catch {
    // The factory loader reports unreadable paths; do not duplicate it here.
    return undefined;
  }

  try {
    const head = Buffer.alloc(BINARY_PROBE_BYTES);
    const { bytesRead } = await handle.read(head, 0, BINARY_PROBE_BYTES, 0);
    if (head.subarray(0, bytesRead).includes(0)) return undefined;
    return textContent(await handle.readFile());
  } catch {
    return undefined;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

/**
 * Returns the line of the `<<<<<<< ` that opens the first complete conflict
 * block, or -1 when the file has none.
 *
 * A block is an opening marker, then a line exactly `=======`, then a closing
 * `>>>>>>> ` marker. An optional `||||||| ` base section may sit before the
 * separator. A lone separator or opening marker is not a conflict.
 */
function conflictBlockLine(lines: readonly string[]): number {
  let opening = -1;
  let separator = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;

    if (line.startsWith("<<<<<<< ")) {
      opening = index;
      separator = false;
      continue;
    }
    if (opening === -1) continue;

    if (line === "=======") {
      separator = true;
      continue;
    }
    if (separator && line.startsWith(">>>>>>> ")) return opening + 1;
  }

  return -1;
}

/**
 * Reports the first unresolved Git conflict block in each text file under
 * `.factory/`. Binary files and directories Metafab ignores are skipped.
 */
export async function scanConflictMarkers(root: string): Promise<Problem[]> {
  const problems: Problem[] = [];

  for (const file of await walkFactoryFiles(root)) {
    const text = await readTextFile(file.target);
    if (text === undefined) continue;

    const line = conflictBlockLine(toLF(text).split("\n"));
    if (line === -1) continue;

    problems.push({
      level: "error",
      file: file.path,
      line,
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
