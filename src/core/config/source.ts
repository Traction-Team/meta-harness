export type SourceKind = "npm" | "git" | "unversioned";

const GIT_SOURCE = /^(?:github:|git\+|git@|ssh:\/\/|https?:\/\/|file:\/\/)/i;
const PATH_SOURCE = /^(?:\.{1,2}[\\/]|\/|~[\\/]|\\\\|[A-Za-z]:[\\/])/;

export function classifySource(source: string): SourceKind {
  const value = source.trim();
  if (value === "") return "npm";
  if (GIT_SOURCE.test(value)) return "git";
  if (PATH_SOURCE.test(value)) return "unversioned";
  return "npm";
}
