import { open, readdir } from "node:fs/promises";
import path from "node:path";
import type { Problem } from "../../errors.js";
import { toLF } from "../../util/text.js";
import { cannotReadProblem } from "../build/skill.js";

const FACTORY_DIR = ".factory";

/** Bytes read first to recognise a binary file without loading all of it. */
const BINARY_PROBE_BYTES = 8 * 1024;

/**
 * Decodes leniently: invalid bytes become U+FFFD and a leading BOM is stripped.
 *
 * The marker prefixes are ASCII, so a lenient decode finds them in any
 * ASCII-compatible encoding. A file that fails a strict decode is still text.
 */
const utf8 = new TextDecoder("utf-8", { fatal: false, ignoreBOM: false });

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
 * not loaded into memory to be discarded. The only test is a NUL byte in that
 * probe: a file that is not valid UTF-8 is still text, decoded leniently so a
 * marker in another ASCII-compatible encoding is found.
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
    return { kind: "text", text: utf8.decode(data) };
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
 * Reports the first unresolved conflict marker in each text file in the walk.
 *
 * Binary files, files that vanished mid-scan and directories Metafab ignores
 * are skipped. An unreadable directory is reported by the walk, once. A listed
 * file that cannot be opened or read is reported here, once.
 */
async function scanConflictMarkers(walk: FactoryWalk): Promise<Problem[]> {
  const problems: Problem[] = [];

  for (const file of walk.files) {
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
 * Reports every `*.upstream` file left behind by a conflicted update in the walk.
 */
function scanUpstreamFiles(walk: FactoryWalk): Problem[] {
  const problems: Problem[] = [];

  for (const file of walk.files) {
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

/**
 * Reports every conflict marker and `.upstream` file under `.factory/`.
 *
 * `.factory/` is walked once and both scanners read the same file list. Walk
 * read problems come first and once each, then the markers, then the
 * `.upstream` files.
 */
export async function scanFactoryFiles(root: string): Promise<Problem[]> {
  const walk = await walkFactoryFiles(root);

  return [
    ...walk.problems,
    ...(await scanConflictMarkers(walk)),
    ...scanUpstreamFiles(walk),
  ];
}
