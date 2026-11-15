import { MetafabError } from "../../errors.js";
import { parseSource } from "../sources/parse.js";

export type SourceKind = "npm" | "git" | "unversioned";

/** The fix when a source error carries no problem of its own. */
const SOURCE_FIX = "Write a source metafab import accepts; run metafab import --help";

const GIT_SOURCE = /^(?:github:|git\+|git@|ssh:\/\/|https?:\/\/|file:\/\/)/i;
const PATH_SOURCE = /^(?:\.{1,2}[\\/]|\/|~[\\/]|\\\\|[A-Za-z]:[\\/])/;

function classifyFallback(value: string): SourceKind {
  if (GIT_SOURCE.test(value)) return "git";
  if (PATH_SOURCE.test(value)) return "unversioned";
  return "npm";
}

/**
 * The same answer `parseSource` gives, so a config entry cannot be validated as
 * one kind and then imported as another. Supported sources are the sharing
 * spec's table: npm names, `github:` and `git+...` Git URLs, HTTPS tarballs, and
 * local paths.
 *
 * This never throws: both callers run while a config document is being read,
 * and a throw would replace the document's `problems` with one exception. An
 * unparseable value falls back to the prefix classifier so validation still
 * reports a problem with the file and line (a missing version or commit, say);
 * `import` parses the source again and reports the precise reason.
 */
export function classifySource(source: string): SourceKind {
  const value = source.trim();
  if (value === "") return "npm";

  try {
    const spec = parseSource(value, { cwd: process.cwd() });
    switch (spec.kind) {
      case "npm":
        return "npm";
      case "git":
        return "git";
      case "path":
        return "unversioned";
      case "https":
        return "unversioned";
    }
  } catch {
    return classifyFallback(value);
  }
}

/**
 * The error `import` would give for this source, or undefined when it parses.
 * Never throws: both callers run while a config document is being read, and a
 * throw would replace the document's `problems` with one exception. `check`
 * reports the message and fix on the `source` line, so an unsupported scheme is
 * named as the scheme it is rather than as a missing version or commit.
 */
export function sourceProblem(
  source: string,
  cwd: string,
): { message: string; fix: string } | undefined {
  try {
    parseSource(source.trim(), { cwd });
    return undefined;
  } catch (error) {
    const fix = error instanceof MetafabError ? error.problems?.[0]?.fix : undefined;
    return {
      message: error instanceof Error ? error.message : String(error),
      fix: fix ?? SOURCE_FIX,
    };
  }
}
