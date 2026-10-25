import { fetchGit, resolveGit } from "./git.js";
import type { GitOptions, GitResolveOptions } from "./git.js";
import { fetchHttps } from "./https.js";
import type { HttpsOptions } from "./https.js";
import { fetchNpm, resolveNpm } from "./npm.js";
import type { NpmOptions, ResolveNpmOptions } from "./npm.js";
import { fetchPath } from "./path.js";
import type { FetchedFab, Resolved, SourceSpec } from "./types.js";

export type SourceOptions = NpmOptions & GitOptions & HttpsOptions;
export type ResolveSourceOptions = ResolveNpmOptions & GitResolveOptions & HttpsOptions;

export async function resolve(
  spec: SourceSpec,
  options: ResolveSourceOptions = {},
): Promise<Resolved> {
  switch (spec.kind) {
    case "npm":
      return resolveNpm(spec, options);
    case "git":
      return resolveGit(spec, options);
    case "https":
      return { kind: "https", spec, versioned: false };
    case "path":
      return { kind: "path", spec, versioned: false };
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
      return fetchGit(resolved, options);
    case "https":
      return fetchHttps(resolved, options);
    case "path":
      return fetchPath(resolved, options);
  }
}
