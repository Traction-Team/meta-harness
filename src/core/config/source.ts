import { parseSource } from "../sources/parse.js";

export type SourceKind = "npm" | "git" | "unversioned";

const GIT_SOURCE = /^(?:github:|git\+|git@|ssh:\/\/|https?:\/\/|file:\/\/)/i;
const PATH_SOURCE = /^(?:\.{1,2}[\\/]|\/|~[\\/]|\\\\|[A-Za-z]:[\\/])/;

function classifyLegacy(value: string): SourceKind {
  if (GIT_SOURCE.test(value)) return "git";
  if (PATH_SOURCE.test(value)) return "unversioned";
  return "npm";
}

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
        return /\.git(?:[#?].*)?$/i.test(value) ? "git" : "unversioned";
    }
  } catch {
    if (/^file:/i.test(value)) return "unversioned";
    return classifyLegacy(value);
  }

  return classifyLegacy(value);
}
