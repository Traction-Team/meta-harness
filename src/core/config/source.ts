import { parseSource } from "../sources/parse.js";

export type SourceKind = "npm" | "git" | "unversioned";

/**
 * The same answer `parseSource` gives, so a config entry cannot be validated as
 * one kind and then imported as another. Supported sources are the sharing
 * spec's table: npm names, `github:` and `git+...` Git URLs, HTTPS tarballs, and
 * local paths. A string that is not one of those is rejected, not guessed at.
 */
export function classifySource(source: string): SourceKind {
  const value = source.trim();
  if (value === "") return "npm";

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
}
