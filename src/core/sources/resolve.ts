import { ExitCode, MetafabError } from "../../errors.js";
import { fetchNpm, resolveNpm } from "./npm.js";
import type { NpmOptions, ResolveNpmOptions } from "./npm.js";
import type { FetchedFab, Resolved, SourceSpec } from "./types.js";

export type SourceOptions = NpmOptions;
export type ResolveSourceOptions = ResolveNpmOptions;

function notImplemented(kind: string, action: string): MetafabError {
  return new MetafabError(`Cannot ${action} ${kind} sources yet: not implemented`, {
    exitCode: ExitCode.Failed,
    code: "not-implemented",
  });
}

export async function resolve(
  spec: SourceSpec,
  options: ResolveSourceOptions = {},
): Promise<Resolved> {
  switch (spec.kind) {
    case "npm":
      return resolveNpm(spec, options);
    case "git":
      throw notImplemented("git", "resolve");
    case "https":
      throw notImplemented("https", "resolve");
    case "path":
      throw notImplemented("path", "resolve");
  }
}

export async function fetchFab(
  resolved: Resolved,
  options: SourceOptions = {},
): Promise<FetchedFab> {
  switch (resolved.kind) {
    case "npm":
      return fetchNpm(resolved, options);
    case "git":
      throw notImplemented("git", "fetch");
    case "https":
      throw notImplemented("https", "fetch");
    case "path":
      throw notImplemented("path", "fetch");
  }
}
