import { execFile } from "node:child_process";
import { promisify } from "node:util";
import semver from "semver";
import { ExitCode, MetafabError } from "../../errors.js";
import { cacheLayout, cacheRoot } from "../sources/cache.js";
import { resolveGit } from "../sources/git.js";
import { resolveNpm } from "../sources/npm.js";
import { parseSource } from "../sources/parse.js";
import type { SourceOptions } from "../sources/resolve.js";
import type {
  GitSourceSpec,
  NpmSourceSpec,
  Resolved,
} from "../sources/types.js";
import type { UpstreamEntry } from "../config/types.js";

const execFileAsync = promisify(execFile);

/** A versioned upstream entry, which is the only kind `update` merges. */
export type VersionedUpstream = Exclude<UpstreamEntry, { kind: "unversioned" }>;

export type VersionedResolved = Extract<Resolved, { versioned: true }>;

export type SelectionOutcome =
  | { kind: "pinned"; ref: string }
  | { kind: "selected"; resolved: VersionedResolved };

export interface SelectOptions extends SourceOptions {
  cwd: string;
  /** The `--to` value, which overrides the recorded request. */
  to?: string;
}

interface GitRefs {
  heads: Set<string>;
  head?: string;
}

function isVersionedUpstream(entry: UpstreamEntry): entry is VersionedUpstream {
  return entry.kind !== "unversioned";
}

function unsupportedSource(source: string, kind: string): MetafabError {
  return new MetafabError(`Cannot update from ${source}: it is not a versioned source`, {
    exitCode: ExitCode.Failed,
    code: "invalid-source",
    problems: [
      {
        level: "error",
        file: ".factory/metafab.yaml",
        message: `The recorded upstream is a ${kind} source, not an npm package or Git repository`,
        fix: "Run metafab import <source> to record a versioned source",
      },
    ],
  });
}

/** The Git spec for a recorded source: the source is stored without its ref. */
export function gitSpecOf(upstream: VersionedUpstream, cwd: string): GitSourceSpec {
  const spec = parseSource(upstream.source, { cwd });
  if (spec.kind !== "git") throw unsupportedSource(upstream.source, spec.kind);
  return spec;
}

function npmSpecOf(upstream: Exclude<VersionedUpstream, { kind: "git" }>): NpmSourceSpec {
  return { kind: "npm", name: upstream.source };
}

function isCommitLike(value: string): boolean {
  return /^[0-9a-f]{4,64}$/i.test(value);
}

function gitCommandOptions(options: SourceOptions): {
  env: NodeJS.ProcessEnv;
  encoding: "utf8";
  maxBuffer: number;
  windowsHide: true;
} {
  return {
    env: options.env ?? process.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  };
}

/**
 * Reads the branch names in the cached mirror of a Git source.
 *
 * `resolveGit` has already fetched the mirror by the time this runs, so a
 * recorded ref can be classified as a branch (which moves) or a tag (which is
 * pinned). Ranges and exact versions are decided without asking the source.
 */
async function readGitRefs(url: string, options: SourceOptions): Promise<GitRefs> {
  const layout = cacheLayout(options.cache ?? cacheRoot(options.env ?? process.env));
  const mirror = layout.gitMirror(url);
  const exec = gitCommandOptions(options);
  const heads = new Set<string>();

  const refs = await execFileAsync(
    "git",
    ["-C", mirror, "for-each-ref", "--format=%(refname)", "refs/heads"],
    exec,
  );
  for (const line of refs.stdout.split("\n")) {
    if (line.startsWith("refs/heads/")) heads.add(line.slice("refs/heads/".length));
  }

  let head: string | undefined;
  try {
    const symbolic = await execFileAsync(
      "git",
      ["-C", mirror, "symbolic-ref", "--quiet", "HEAD"],
      exec,
    );
    const ref = symbolic.stdout.trim();
    if (ref.startsWith("refs/heads/")) head = ref.slice("refs/heads/".length);
  } catch {
    // A HEAD that is detached has no branch name; the source is still usable
    // through an explicit ref.
  }

  return { heads, ...(head === undefined ? {} : { head }) };
}

async function selectGit(
  spec: GitSourceSpec,
  upstream: Exclude<VersionedUpstream, { kind: "npm" }>,
  options: SelectOptions,
): Promise<SelectionOutcome> {
  const resolve = (to?: string): Promise<VersionedResolved> =>
    resolveGit(spec, {
      ...options,
      ...(to === undefined ? {} : { to }),
    });

  if (options.to !== undefined) {
    return { kind: "selected", resolved: await resolve(options.to) };
  }

  const requested = upstream.requested;
  // A commit or an exact version can only name one revision, so it is pinned
  // without asking the source. This also keeps the message available offline.
  if (requested !== undefined) {
    if (isCommitLike(requested) || semver.valid(requested) !== null) {
      return { kind: "pinned", ref: requested };
    }
    if (semver.validRange(requested) !== null) {
      return { kind: "selected", resolved: await resolve(requested) };
    }
  }

  // Fetching the mirror is also how a branch or a non-version tag is
  // classified. A branch moves; a tag does not.
  await resolve();
  const refs = await readGitRefs(spec.url, options);
  if (requested !== undefined) {
    if (refs.heads.has(requested)) {
      return { kind: "selected", resolved: await resolve(requested) };
    }
    return { kind: "pinned", ref: requested };
  }

  // No recorded request: the import followed the default branch head, so the
  // update follows it again rather than switching to a tag added later.
  if (refs.head !== undefined) {
    return { kind: "selected", resolved: await resolve(refs.head) };
  }
  return { kind: "selected", resolved: await resolve() };
}

/**
 * Selects the version `update` merges.
 *
 * `--to` wins. Otherwise the recorded request decides: an npm range or a Git
 * range selects the newest matching version, a recorded branch follows its new
 * head, a recorded tag or commit is pinned and needs `--to`, and a source with
 * no recorded request follows its default branch.
 */
export async function selectVersion(
  upstream: UpstreamEntry,
  options: SelectOptions,
): Promise<SelectionOutcome> {
  if (!isVersionedUpstream(upstream)) {
    throw unsupportedSource(upstream.source, "unversioned");
  }

  if (upstream.kind === "npm") {
    const resolved = await resolveNpm(npmSpecOf(upstream), {
      ...options,
      to: options.to ?? upstream.requested,
    });
    return { kind: "selected", resolved };
  }

  return selectGit(gitSpecOf(upstream, options.cwd), upstream, options);
}

/** True when the selected version is the one the upstream entry records. */
export function sameVersion(upstream: VersionedUpstream, resolved: VersionedResolved): boolean {
  if (upstream.kind === "npm") {
    return resolved.kind === "npm" && resolved.version === upstream.version;
  }
  return resolved.kind !== "npm" && resolved.commit === upstream.commit;
}

/** The version or short commit shown for a resolved version. */
export function versionLabel(resolved: VersionedResolved): string {
  if (resolved.kind === "npm") return resolved.version;
  return resolved.version ?? resolved.commit.slice(0, 7);
}

/** The version or short commit shown for the recorded upstream. */
export function recordedLabel(upstream: VersionedUpstream): string {
  switch (upstream.kind) {
    case "npm":
      return upstream.version;
    case "git":
      return upstream.version ?? upstream.commit.slice(0, 7);
  }
}
