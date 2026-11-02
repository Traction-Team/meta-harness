import { parseSource } from "../sources/parse.js";
import { fetchFab, resolve } from "../sources/resolve.js";
import type { SourceOptions } from "../sources/resolve.js";
import type { FetchedFab, Resolved } from "../sources/types.js";
import { resolveGit } from "../sources/git.js";
import { resolveNpm } from "../sources/npm.js";
import type { UpstreamEntry } from "../config/types.js";
import { gitSpecOf } from "./select.js";

export interface RecordedFetchOptions extends SourceOptions {
  /** Directory a recorded relative path resolves against. */
  cwd: string;
}

/**
 * Resolves the version or revision a recorded upstream entry names.
 *
 * This is the base of an update and the other half of `metafab diff`: it always
 * resolves the recorded version or commit, never a newer one.
 */
export async function resolveRecorded(
  upstream: UpstreamEntry,
  options: RecordedFetchOptions,
): Promise<Resolved> {
  switch (upstream.kind) {
    case "npm":
      return resolveNpm(
        { kind: "npm", name: upstream.source },
        { ...options, to: upstream.version },
      );
    case "git":
      return resolveGit(gitSpecOf(upstream, options.cwd), {
        ...options,
        to: upstream.commit,
      });
    case "unversioned":
      return resolve(parseSource(upstream.source, { cwd: options.cwd }), options);
  }
}

/**
 * Fetches the recorded base, so a caller can compare it with the local factory
 * or merge it. The caller must call `cleanup` on the result in a `finally`.
 */
export async function fetchRecordedBase(
  upstream: UpstreamEntry,
  options: RecordedFetchOptions,
): Promise<FetchedFab> {
  return fetchFab(await resolveRecorded(upstream, options), options);
}
