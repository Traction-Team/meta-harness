import { open, readdir } from "node:fs/promises";
import path from "node:path";
import type { Problem } from "../../errors.js";
import { toLF } from "../../util/text.js";
import { cannotReadProblem } from "../build/skill.js";

const FACTORY_DIR = ".factory";

/** Bytes read first to recognise a binary file without loading all of it. */
const BINARY_PROBE_BYTES = 8 * 1024;

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

interface FactoryFile {
  /** Repository-relative path with forward slashes. */
  path: string;
  target: string;
}

interface FactoryWalk {
  files: FactoryFile[];
  problems: Problem[];
}

function isAbsentError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

async function walkFactoryFiles(root: string): Promise<FactoryWalk> {
  const files: FactoryFile[] = [];
  const problems: Problem[] = [];

  async function walk(directory: string, displayPath: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      // A vanished directory is a race; an unreadable one is a real problem.
      if (!isAbsentError(error)) problems.push(cannotReadProblem(displayPath));
      return;
    }

    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

    for (const entry of entries) {
      // Metafab ignores directories whose name starts with "." (factory-format).
      if (entry.isDirectory() && entry.name.startsWith(".")) continue;

      const relativePath = `${displayPath}/${entry.name}`;
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
  return { files, problems };
}

type ReadResult =
  | { kind: "text"; text: string }
  | { kind: "binary" }
  | { kind: "missing" }
  | { kind: "unreadable"; problem: Problem };

/**
 * Reads a file as text, or reports it as binary or unreadable.
 *
 * The first 8 KiB decide whether the file is binary, so a large binary file is
 * not loaded into memory to be discarded. A NUL byte after that probe does not
 * make the file binary; invalid UTF-8 does.
 */
async function readTextFile(target: string, displayPath: string): Promise<ReadResult> {
  let handle;
  try {
    handle = await open(target, "r");
  } catch (error) {
    if (isAbsentError(error)) return { kind: "missing" };
    return { kind: "unreadable", problem: cannotReadProblem(displayPath) };
  }

  try {
    const head = Buffer.alloc(BINARY_PROBE_BYTES);
    const { bytesRead } = await handle.read(head, 0, BINARY_PROBE_BYTES, 0);
    if (head.subarray(0, bytesRead).includes(0)) return { kind: "binary" };

    const data = await handle.readFile();
    try {
      return { kind: "text", text: utf8.decode(data) };
    } catch {
      return { kind: "binary" };
    }
  } catch (error) {
    if (isAbsentError(error)) return { kind: "missing" };
    return { kind: "unreadable", problem: cannotReadProblem(displayPath) };
  } finally {
    await handle.close().catch(() => undefined);
  }
}

function isMarkerStart(line: string): boolean {
  return (
    line.startsWith("<<<<<<< ") ||
    line.startsWith(">>>>>>> ") ||
    line.startsWith("||||||| ")
  );
}

/**
 * Returns the line of the first conflict marker in the file, or -1 when there
 * is none.
 *
 * Any line that starts with `<<<<<<< `, `>>>>>>> ` or `||||||| ` is a marker,
 * so a leftover or half-resolved block is still caught. A line exactly
 * `=======` is a marker only when the file also has one of those other marker
 * lines, so a Markdown setext underline on its own stays clean.
 */
function conflictMarkerLine(lines: readonly string[]): number {
  const hasOtherMarker = lines.some(isMarkerStart);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (isMarkerStart(line) || (hasOtherMarker && line === "=======")) return index + 1;
  }

  return -1;
}

/**
 * Reports the first unresolved conflict marker in each text file under
 * `.factory/`. Binary files, directories Metafab ignores and unreadable paths
 * (reported once) are handled as the factory loader handles them.
 */
export async function scanConflictMarkers(root: string): Promise<Problem[]> {
  const { files, problems } = await walkFactoryFiles(root);

  for (const file of files) {
    const result = await readTextFile(file.target, file.path);
    if (result.kind === "unreadable") {
      problems.push(result.problem);
      continue;
    }
    if (result.kind !== "text") continue;

    const line = conflictMarkerLine(toLF(result.text).split("\n"));
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
 *
 * Read errors are left to `scanConflictMarkers`, which walks the same paths.
 */
export async function scanUpstreamFiles(root: string): Promise<Problem[]> {
  const problems: Problem[] = [];
  const { files } = await walkFactoryFiles(root);

  for (const file of files) {
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
