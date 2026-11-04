import { MetafabError } from "../../errors.js";
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
 *
 * A failure here is either a base that no longer exists at its source (see
 * `recordedBaseGone`) or a fetch that failed for another reason. The caller
 * decides which: `update` merges without a base only in the first case.
 */
export async function fetchRecordedBase(
  upstream: UpstreamEntry,
  options: RecordedFetchOptions,
): Promise<FetchedFab> {
  return fetchFab(await resolveRecorded(upstream, options), options);
}

/** The error code a Git source uses when the named ref, tag or commit is absent. */
const GIT_NOT_FOUND = "fetch-not-found";

/**
 * What npm reports when a package or a version is missing. The npm source
 * raises `fetch-failed` for every failure, so a gone version is recognised by
 * the registry's E404 or by the resolver's own wording for a version absent
 * from the registry's list.
 */
const NPM_GONE = /\bE404\b|\b404 Not Found\b|no version matches|has no published versions/;

/** The command's own output, where npm and Git put the reason for a failure. */
function failureOutput(error: MetafabError): string {
  const cause = error.cause;
  if (typeof cause !== "object" || cause === null) return "";
  const { stderr, stdout } = cause as { stderr?: unknown; stdout?: unknown };
  return [stderr, stdout].filter((value): value is string => typeof value === "string").join("\n");
}

/**
 * True only when the recorded base no longer exists at its source: a Git ref
 * or commit that was removed by a force push, or an npm package or version
 * that was unpublished or removed.
 *
 * Every other fetch failure — an unreachable remote, a rejected credential, a
 * cache or filesystem problem, an attribute-write failure — is not a missing
 * base. `update` must abort on it, with the original problem and exit code,
 * before it writes anything; `diff` must report it as it is.
 */
export function recordedBaseGone(error: unknown): boolean {
  if (!(error instanceof MetafabError)) return false;
  if (error.code === GIT_NOT_FOUND) return true;
  if (error.code !== "fetch-failed") return false;
  return NPM_GONE.test(`${error.message}\n${failureOutput(error)}`);
}
