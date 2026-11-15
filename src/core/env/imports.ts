import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { Problem } from "../../errors.js";
import { readdirTyped } from "../../util/fs.js";
import type { DirEntry } from "../../util/fs.js";
import { toLF } from "../../util/text.js";
import { isInside, textContent } from "../build/skill.js";
import { directiveLines } from "./directives.js";
import { markdownParts } from "./markdown.js";

const FRONTMATTER_MESSAGE = "Directives are not allowed in frontmatter";
const FRONTMATTER_FIX =
  "Move the directive below the closing ---; name and description stay the same in every environment";
const NEEDS_PATH_FIX = "Write <!-- factory:import <path> -->";
const RELATIVE_FIX = "Write a path relative to this file, such as ../partials/x.md";
const SLASH_FIX = "Write it with / instead of \\";
const MARKDOWN_FIX = "Import a .md file, such as ../partials/x.md";
const INSIDE_FIX = "Import a file inside .factory/";
const MISSING_FIX = "Add the file, or write the path of a file in .factory/";
const DIRECTORY_FIX = "Import a .md file inside it";
const READ_FIX = "Check its permissions";
const TEXT_FIX = "Replace it with a UTF-8 text file";
const UNTERMINATED_FIX = "Add a line that contains only --- after the frontmatter";

/** What a failed import reports, on the directive's line in the importing file. */
export interface ImportFailure {
  ok: false;
  message: string;
  fix: string;
}

export interface ImportCache {
  /** Absolute `.factory` directory, native separators. */
  factoryDir: string;
  /** `realpath` of `.factory`, computed once. */
  factoryReal?: string;
  /**
   * By realpath: what does not depend on the route a file was imported through,
   * so a partial imported by ten files is read once per cache.
   */
  files: Map<string, LoadedImport>;
}

export interface LoadedImport {
  /** Repository-relative POSIX path of the file itself, such as `.factory/partials/sub-agents.md`. */
  file: string;
  /** The body, frontmatter removed, and one trailing newline dropped so the import replaces one line. */
  text: string;
  /** Line number of the body's first line in the file. */
  firstLine: number;
  /** The imported file's own problems: a directive in its frontmatter. */
  problems: Problem[];
}

/**
 * A cache of imported files for one build or one `loadFactory`. Every file is
 * keyed by its realpath, so an edited partial is always reread by the next run.
 */
export function createImportCache(factoryDir: string): ImportCache {
  return { factoryDir, files: new Map() };
}

function failure(message: string, fix: string): ImportFailure {
  return { ok: false, message, fix };
}

function missing(given: string): ImportFailure {
  return failure(`Import "${given}" does not exist`, MISSING_FIX);
}

function cannotRead(given: string): ImportFailure {
  return failure(`Import "${given}" cannot be read`, READ_FIX);
}

/** A read error that means the path is not there, rather than that it is unreadable. */
function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/**
 * Rules 1 to 5 for an import: the path is relative to the importing file, uses
 * `/`, ends in `.md`, and stays inside `.factory/` once normalised. Pure: it
 * works on factory-relative POSIX paths only, so a Windows-style path gives the
 * same answer on every platform and nothing here touches the disk.
 */
export function importTarget(
  from: string,
  argument: string,
): { ok: true; target: string } | ImportFailure {
  const given = argument.trim();

  if (given === "") return failure("factory:import needs a path", NEEDS_PATH_FIX);
  if (path.win32.isAbsolute(given)) {
    return failure(`Import path "${given}" must be relative to this file`, RELATIVE_FIX);
  }
  if (given.includes("\\")) return failure(`Import path "${given}" must use /`, SLASH_FIX);
  if (path.posix.extname(given).toLowerCase() !== ".md") {
    return failure(`Import path "${given}" must name a .md file`, MARKDOWN_FIX);
  }

  const target = path.posix.normalize(`${path.posix.dirname(from)}/${given}`);
  if (target === ".." || target.startsWith("../")) {
    return failure(`Import "${given}" leaves .factory/`, INSIDE_FIX);
  }
  return { ok: true, target };
}

async function factoryRealPath(cache: ImportCache): Promise<string | undefined> {
  if (cache.factoryReal !== undefined) return cache.factoryReal;
  try {
    cache.factoryReal = await realpath(cache.factoryDir);
  } catch {
    return undefined;
  }
  return cache.factoryReal;
}

/** `.factory/<path>`, the name a file's own problems carry, from its realpath. */
function realFile(factoryReal: string, real: string): string {
  const relative = path.relative(factoryReal, real).split(path.sep).join("/");
  return `.factory/${relative}`;
}

/**
 * The repository-relative `.factory/<path>` name of a realpath, for messages
 * such as an import loop's chain.
 */
export function realDisplayPath(cache: ImportCache, real: string): string {
  return realFile(cache.factoryReal ?? cache.factoryDir, real);
}

/**
 * Resolves an import to the file's realpath and its loaded content, reporting
 * every path rule of the spec on the directive's line. The walk reads directory
 * listings and matches names exactly, so a wrong-case path fails the same way on
 * a case-insensitive file system as on a case-sensitive one. Symbolic links, for
 * the file and for any parent, must resolve inside the real `.factory/`.
 */
export async function resolveImport(
  from: string,
  argument: string,
  cache: ImportCache,
): Promise<{ ok: true; real: string; loaded: LoadedImport } | ImportFailure> {
  const target = importTarget(from, argument);
  if (!target.ok) return target;

  const given = argument.trim();
  const segments = target.target.split("/");
  let current = cache.factoryDir;
  let file = "";
  let real: string | undefined;

  for (const [index, segment] of segments.entries()) {
    const last = index === segments.length - 1;

    let entries: DirEntry[];
    try {
      entries = await readdirTyped(current);
    } catch (error) {
      return isMissing(error) ? missing(given) : cannotRead(given);
    }

    const exact = entries.find((entry) => entry.name === segment);
    const found =
      exact ?? entries.find((entry) => entry.name.toLowerCase() === segment.toLowerCase());
    if (found === undefined) return missing(given);
    if (exact === undefined) {
      const actual = [...segments.slice(0, index), found.name, ...segments.slice(index + 1)];
      return failure(
        `Import "${given}" differs in letter case from "${found.name}"`,
        `Write "${actual.join("/")}"`,
      );
    }

    const full = path.join(current, found.name);

    if (!found.isSymbolicLink()) {
      if (found.isDirectory()) {
        if (last) return failure(`Import "${given}" is a directory`, DIRECTORY_FIX);
        current = full;
        continue;
      }
      if (!found.isFile()) return cannotRead(given);
      if (!last) return missing(given);
      file = full;
      break;
    }

    // A link may point anywhere, so its target is checked against the real
    // `.factory/` before the walk continues by listing what it points to.
    let resolved: string;
    try {
      resolved = await realpath(full);
    } catch (error) {
      return isMissing(error) ? missing(given) : cannotRead(given);
    }

    const factoryReal = await factoryRealPath(cache);
    if (factoryReal === undefined) return cannotRead(given);
    if (!isInside(factoryReal, resolved)) {
      return failure(`Import "${given}" resolves outside .factory/`, INSIDE_FIX);
    }

    let info;
    try {
      info = await stat(resolved);
    } catch (error) {
      return isMissing(error) ? missing(given) : cannotRead(given);
    }

    if (last) {
      if (info.isDirectory()) return failure(`Import "${given}" is a directory`, DIRECTORY_FIX);
      if (!info.isFile()) return cannotRead(given);
      file = resolved;
      real = resolved;
      break;
    }

    if (!info.isDirectory()) return missing(given);
    current = resolved;
  }

  if (real === undefined) {
    try {
      real = await realpath(file);
    } catch (error) {
      return isMissing(error) ? missing(given) : cannotRead(given);
    }
  }

  const cached = cache.files.get(real);
  if (cached !== undefined) return { ok: true, real, loaded: cached };

  let data: Buffer;
  try {
    data = await readFile(file);
  } catch {
    return cannotRead(given);
  }

  const decoded = textContent(data);
  if (decoded === undefined) {
    return failure(`Import "${given}" is not a UTF-8 text file`, TEXT_FIX);
  }

  const text = toLF(decoded.startsWith("\uFEFF") ? decoded.slice(1) : decoded);
  const parts = markdownParts(text);
  if (!parts.closed) {
    return failure(`Import "${given}" has unterminated frontmatter`, UNTERMINATED_FIX);
  }

  const factoryReal = await factoryRealPath(cache);
  if (factoryReal === undefined) return cannotRead(given);

  const problems: Problem[] = [];
  if (parts.frontmatter !== undefined) {
    const file = realFile(factoryReal, real);
    for (const line of directiveLines(parts.frontmatter, 2)) {
      problems.push({ level: "error", file, line, message: FRONTMATTER_MESSAGE, fix: FRONTMATTER_FIX });
    }
  }

  const loaded: LoadedImport = {
    file: realFile(factoryReal, real),
    text: parts.body.endsWith("\n") ? parts.body.slice(0, -1) : parts.body,
    firstLine: parts.firstLine,
    problems,
  };
  cache.files.set(real, loaded);
  return { ok: true, real, loaded };
}
