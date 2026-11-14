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

/** UTF-16 decoders; they strip the BOM at the start of the data. */
const utf16le = new TextDecoder("utf-16le");
const utf16be = new TextDecoder("utf-16be");

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
  | { kind: "text"; text: string; alternate?: string }
  | { kind: "binary" }
  | { kind: "missing" }
  | { kind: "unreadable"; problem: Problem };

type Encoding = "utf-8" | "utf-16le" | "utf-16be" | "binary";

/**
 * Picks the decoder from the first bytes of the file.
 *
 * A byte order mark is checked before the NUL probe, because every UTF-16 file
 * has NUL bytes. A UTF-16 file without a BOM is not detected and stays binary.
 * UTF-32 is left binary: `TextDecoder` does not support it in Node, and its
 * BOM starts with the UTF-16LE BOM, so it must be excluded first.
 */
function detectEncoding(probe: Buffer): Encoding {
  const utf32le =
    probe.length >= 4 &&
    probe[0] === 0xff &&
    probe[1] === 0xfe &&
    probe[2] === 0x00 &&
    probe[3] === 0x00;
  if (utf32le) return "binary";

  const utf16leBom = probe.length >= 2 && probe[0] === 0xff && probe[1] === 0xfe;
  if (utf16leBom) return "utf-16le";

  const utf16beBom = probe.length >= 2 && probe[0] === 0xfe && probe[1] === 0xff;
  if (utf16beBom) return "utf-16be";

  return probe.includes(0) ? "binary" : "utf-8";
}

/**
 * Reads a file as text, or reports it as binary or unreadable.
 *
 * The first 8 KiB decide whether the file is binary, so a large binary file is
 * not loaded into memory to be discarded. A BOM picks UTF-16; otherwise the
 * only test is a NUL byte in that probe. A file that is not valid UTF-8 is
 * still text, decoded leniently so a marker in another ASCII-compatible
 * encoding is found.
 *
 * A UTF-16 BOM in a file that is not UTF-16 (a Latin-1 file can start with the
 * bytes `ÿþ` or `þÿ`) would hide an ASCII marker from the UTF-16 decode. Both
 * decodes are returned in that case, and the scan reports the lowest line
 * either finds. UTF-32 and BOM-less UTF-16 stay binary.
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
    const encoding = detectEncoding(head.subarray(0, bytesRead));
    if (encoding === "binary") return { kind: "binary" };

    const data = await handle.readFile();
    if (encoding === "utf-16le") {
      return { kind: "text", text: utf16le.decode(data), alternate: utf8.decode(data) };
    }
    if (encoding === "utf-16be") {
      return { kind: "text", text: utf16be.decode(data), alternate: utf8.decode(data) };
    }

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

    let line = conflictMarkerLine(toLF(result.text).split("\n"));
    if (result.alternate !== undefined) {
      const alternative = conflictMarkerLine(toLF(result.alternate).split("\n"));
      if (alternative !== -1 && (line === -1 || alternative < line)) line = alternative;
    }
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
