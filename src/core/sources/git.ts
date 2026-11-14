import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import semver from "semver";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import type { UpstreamEntry } from "../config/types.js";
import { pathExists } from "../../util/fs.js";
import { cacheLayout, cacheRoot, fabKey, getOrCreate, cacheWriteError, isLostRaceError, sweepStale } from "./cache.js";
import type { CacheLayout } from "./cache.js";
import { extractTarball } from "./extract.js";
import { disabledHooksConfig, gitEnvironment, gitMessage, VERBATIM_TEXT_ATTRIBUTES } from "./git-process.js";
import { redact } from "./redact.js";
import { sourceWithoutCredentials } from "./parse.js";
import type { FetchedFab, GitRef, GitSourceSpec, Resolved } from "./types.js";
import { dropPayloadFiles, validateFab } from "./validate.js";

const execFileAsync = promisify(execFile);

function gitConfigArgs(): string[] {
  return ["-c", disabledHooksConfig()];
}

/**
 * A fab must reach the project byte for byte. Git converts line endings while
 * it exports a tree: the user's `core.autocrlf`, or a `text`/`eol` rule in the
 * fab's own `.gitattributes`, turns LF into CRLF in `git archive` output. That
 * would make a fetched fab depend on how the machine is set up, and it changes
 * files that are not text at all: a file that is not valid UTF-8 still has no
 * NUL byte, so Git converts it too. The blob Git stored is the fab - the same
 * bytes `publish` wrote verbatim - so every conversion attribute is turned off
 * for the mirror before it is exported. `info/attributes` outranks the fab's
 * own `.gitattributes`, and the config handles an older cache or a Git that
 * reads the attribute files in a different order. Line ending conversion is
 * not the only rewrite `git archive` does: `export-subst` expands `$Format$`
 * placeholders and `export-ignore` drops files, so those two are disabled too.
 *
 * @internal Exported so a test can pin the fetch cache key.
 */
export const VERBATIM_ATTRIBUTES = `* ${VERBATIM_TEXT_ATTRIBUTES} -export-subst -export-ignore\n`;

/**
 * The config `git archive` must run with. The line-ending settings stop the
 * user's checkout setup from rewriting the bytes, and `tar.umask` stops the
 * user's own setting from rewriting the modes: with `tar.umask=0077` every
 * entry is recorded as 0600 instead of Git's default 0664. Pinning Git's
 * default (0002) makes the exported modes the same whatever the machine says.
 */
const VERBATIM_CONFIG = [
  "-c",
  "core.autocrlf=false",
  "-c",
  "core.eol=lf",
  "-c",
  "core.safecrlf=false",
  "-c",
  "tar.umask=0002",
];

/**
 * Every input that decides the bytes `git archive` writes for a commit: the
 * attribute rules, the config overrides, the archive format and the path it
 * exports. Editing any of them changes the fab cache key, so a stale entry
 * cannot be reused. Keeping them in one constant means a new export setting
 * cannot be added to the command without also entering the key.
 */
const VERBATIM_EXPORT = [
  VERBATIM_ATTRIBUTES,
  ...VERBATIM_CONFIG,
  "--format=tar",
  ".factory",
].join("\n");

/**
 * Part of the fab cache key. A commit can export different bytes than an
 * earlier build exported from the same commit, so a build that changes the
 * export format carries a new segment and never reuses the old entry. The
 * segment is derived from the export format itself, so editing it cannot
 * leave a stale entry behind.
 *
 * @internal Exported so a test can pin the fetch cache key.
 */
export const FAB_FETCH_FORMAT = `git-verbatim-${createHash("sha256")
  .update(VERBATIM_EXPORT)
  .digest("hex")
  .slice(0, 12)}`;

async function writeVerbatimAttributes(mirror: string, sourceLabel: string): Promise<void> {
  const info = path.join(mirror, "info");
  const target = path.join(info, "attributes");
  // Every fetch through this mirror leaves the rules in place, so this is the
  // steady state and nothing is written at all. That matters on Windows: a
  // concurrent `git archive` can have the file open (rename fails with EPERM)
  // and a concurrent `replaceMirror` can move the whole mirror away (the
  // parent directory is then gone, so mkdir/write/rename fail with ENOENT).
  const current = await readFile(target, "utf8").catch(() => undefined);
  if (current === VERBATIM_ATTRIBUTES) return;

  // Concurrent fetches share the mirror. Writing in place would let one of
  // them read a truncated file, so write a sibling and rename it over: where
  // the rename is atomic, a reader sees the old file or the new one, never a
  // partial one.
  const temporary = path.join(info, `.attributes.tmp-${randomUUID()}`);
  try {
    await mkdir(info, { recursive: true });
    await writeFile(temporary, VERBATIM_ATTRIBUTES);
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    const detail = error instanceof Error ? error.message : String(error);
    throw fetchError(
      `Cannot export .factory from ${sourceLabel} byte for byte: ${detail}`,
      error,
    );
  }
}

export interface GitOptions {
  env?: NodeJS.ProcessEnv;
  cache?: string;
  interactive?: boolean;
}

export interface GitResolveOptions extends GitOptions {
  to?: string;
}

export type ResolvedGit = Extract<Resolved, { kind: "git" }>;

interface GitFailure {
  stdout?: string;
  stderr?: string;
  message?: string;
}

interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

interface TagInfo {
  name: string;
  commit: string;
  version?: string;
}

interface MirrorRefs {
  tags: Map<string, TagInfo>;
  tagList: TagInfo[];
  heads: Map<string, string>;
  head?: string;
}

interface Selection {
  commit: string;
  version?: string;
  requested?: string;
}

function gitOptions(options: GitOptions): {
  env: NodeJS.ProcessEnv;
  encoding: "utf8";
  maxBuffer: number;
  windowsHide: true;
} {
  return {
    env: gitEnvironment(options.env, options.interactive),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  };
}

function fetchError(message: string, cause?: unknown): MetafabError {
  return new MetafabError(redact(message), {
    exitCode: ExitCode.FetchFailed,
    code: "fetch-failed",
    cause,
  });
}

/**
 * The repository answered, but the ref, tag or commit it names does not exist.
 *
 * This is the one fetch failure that means a recorded base is gone, such as a
 * commit removed by a force push. Every other failure (an unreachable remote,
 * a rejected credential, a cache or filesystem problem) is `fetch-failed` and
 * must stop an update rather than be mistaken for a missing base.
 */
function notFoundError(message: string): MetafabError {
  return new MetafabError(redact(message), {
    exitCode: ExitCode.FetchFailed,
    code: "fetch-not-found",
  });
}

async function runGit(args: string[], context: string, options: GitOptions): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", [...gitConfigArgs(), ...args], gitOptions(options));
    return stdout;
  } catch (error) {
    throw fetchError(`${context}: ${gitMessage(error as GitFailure)}`, error);
  }
}

async function tryGit(args: string[], options: GitOptions): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", [...gitConfigArgs(), ...args], gitOptions(options));
    return { ok: true, stdout, stderr };
  } catch (error) {
    const failure = error as GitFailure;
    return {
      ok: false,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message ?? "",
    };
  }
}

function tagVersion(name: string): string | undefined {
  const candidate = name.startsWith("v") ? name.slice(1) : name;
  return semver.valid(candidate) ?? undefined;
}

function versionTags(refs: MirrorRefs): TagInfo[] {
  return refs.tagList
    .filter((tag) => tag.version !== undefined)
    .sort((left, right) => {
      const compared = semver.rcompare(left.version as string, right.version as string);
      return compared !== 0 ? compared : left.name.localeCompare(right.name);
    });
}

function versionAtCommit(refs: MirrorRefs, commit: string): string | undefined {
  return versionTags(refs).find((tag) => tag.commit === commit)?.version;
}

async function cloneInto(
  url: string,
  destination: string,
  layout: CacheLayout,
  options: GitOptions,
): Promise<void> {
  try {
    await mkdir(path.dirname(destination), { recursive: true });
  } catch (error) {
    throw cacheWriteError(path.dirname(destination), layout.root, error);
  }
  try {
    // Clone with the URL as given: it may carry a token that the server
    // requires. The origin is rewritten straight away so no credential is
    // left in the mirror's config, and later fetches pass the URL on the
    // command line instead.
    await runGit(
      ["clone", "--mirror", "--", url, destination],
      `Cannot clone Git source ${url}`,
      options,
    );
    await runGit(
      ["-C", destination, "remote", "set-url", "origin", sourceWithoutCredentials(url)],
      `Cannot record Git source ${sourceWithoutCredentials(url)}`,
      options,
    );
  } catch (error) {
    await rm(destination, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * Renames a finished clone into place. Two commands can race here: when the
 * rename loses because the mirror is now there, the winner's mirror is used.
 * A mirror that appears but is not usable fails the fetch rather than leaving
 * a path that every later command would trip over.
 */
async function installMirror(
  temporary: string,
  mirror: string,
  layout: CacheLayout,
  options: GitOptions,
): Promise<void> {
  try {
    await rename(temporary, mirror);
  } catch (error) {
    if (await isLostRaceError(error, mirror)) {
      await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
      if (await isUsableMirror(mirror, options)) return;
      throw fetchError(
        `Cannot use the Git mirror ${mirror}: another command left it incomplete`,
      );
    }
    await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
    throw cacheWriteError(mirror, layout.root, error);
  }
}

async function cloneMirror(
  url: string,
  mirror: string,
  layout: CacheLayout,
  options: GitOptions,
): Promise<void> {
  // Every clone, first or replacement, lands in a temporary sibling and is
  // renamed into place: an interrupted clone can never leave a partial mirror
  // at the real path.
  const temporary = `${mirror}.tmp-${randomUUID()}`;
  await cloneInto(url, temporary, layout, options);
  await installMirror(temporary, mirror, layout, options);
}

async function isUsableMirror(mirror: string, options: GitOptions): Promise<boolean> {
  const bare = await tryGit(["-C", mirror, "rev-parse", "--is-bare-repository"], options);
  if (!bare.ok || bare.stdout.trim() !== "true") return false;
  const origin = await tryGit(["-C", mirror, "config", "--get", "remote.origin.url"], options);
  return origin.ok && origin.stdout.trim() !== "";
}

function isAbsentError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/**
 * Swaps a fresh clone for a mirror whose fetch failed. Two commands can run
 * this at once, and the mirror is the thing they synchronise on: the rename
 * that moves the old mirror aside is atomic, so at most one command moves it
 * and the other sees ENOENT and installs its clone the way a first clone does.
 * The brief moment when the mirror is absent between the two renames is not
 * closed here: a third command in that window fails its fetch and rebuilds,
 * which the same swap logic handles on its next attempt.
 */
async function replaceMirror(
  url: string,
  mirror: string,
  layout: CacheLayout,
  options: GitOptions,
): Promise<string> {
  const replacement = `${mirror}.tmp-${randomUUID()}`;
  await cloneInto(url, replacement, layout, options);

  const backup = `${mirror}.old-${randomUUID()}`;
  try {
    await rename(mirror, backup);
  } catch (error) {
    if (isAbsentError(error)) {
      // Another command moved the mirror aside first: it has finished its swap
      // or is halfway through one. Install this clone the way a first clone
      // does, so a mirror that is already back in place wins and the rest of
      // the command uses it instead of failing on a cache it cannot write.
      await installMirror(replacement, mirror, layout, options);
      return mirror;
    }
    await rm(replacement, { recursive: true, force: true }).catch(() => undefined);
    throw cacheWriteError(mirror, layout.root, error);
  }

  try {
    await rename(replacement, mirror);
  } catch (error) {
    if (await isLostRaceError(error, mirror)) {
      // Another command's swap put a mirror back between our two renames. Its
      // mirror is the newest one, so use it and drop ours; the backup we moved
      // aside is the corrupt mirror both commands were replacing.
      await rm(replacement, { recursive: true, force: true }).catch(() => undefined);
      if (await isUsableMirror(mirror, options)) {
        await rm(backup, { recursive: true, force: true }).catch(() => undefined);
        return mirror;
      }
    }
    // Put the old mirror back where it was: a swap that did not happen must
    // not cost the caller the mirror it had.
    await rename(backup, mirror).catch(() => undefined);
    await rm(replacement, { recursive: true, force: true }).catch(() => undefined);
    throw cacheWriteError(mirror, layout.root, error);
  }

  // The swap succeeded; a backup that cannot be removed only costs disk.
  await rm(backup, { recursive: true, force: true }).catch(() => undefined);
  return mirror;
}

async function ensureMirror(url: string, layout: CacheLayout, options: GitOptions): Promise<string> {
  const mirror = layout.gitMirror(url);
  await sweepStale(path.dirname(mirror), path.basename(mirror));

  if (await pathExists(mirror)) {
    if (await isUsableMirror(mirror, options)) {
      // Fetch from the URL given on this call, not the one in the mirror's
      // config: that stored URL has no credentials, and this one may.
      const fetched = await tryGit(
        ["-C", mirror, "fetch", "--prune", "--tags", "--", url, "+refs/*:refs/*"],
        options,
      );
      if (fetched.ok) return mirror;
      return replaceMirror(url, mirror, layout, options);
    }
    try {
      await rm(mirror, { recursive: true, force: true });
    } catch (error) {
      throw cacheWriteError(mirror, layout.root, error);
    }
  }

  await cloneMirror(url, mirror, layout, options);
  return mirror;
}

async function listRefs(mirror: string, options: GitOptions): Promise<MirrorRefs> {
  const stdout = await runGit(
    ["-C", mirror, "for-each-ref", "--format=%(refname)%00%(objectname)%00%(*objectname)", "refs/tags", "refs/heads"],
    "Cannot read the Git refs",
    options,
  );

  const tags = new Map<string, TagInfo>();
  const heads = new Map<string, string>();

  for (const line of stdout.split("\n")) {
    if (line === "") continue;
    const [refname, object, peeled] = line.split("\0");
    if (refname === undefined || object === undefined) continue;
    if (refname.startsWith("refs/tags/")) {
      const name = refname.slice("refs/tags/".length);
      const commit = peeled === undefined || peeled === "" ? object : peeled;
      tags.set(name, {
        name,
        commit,
        ...(tagVersion(name) === undefined ? {} : { version: tagVersion(name) }),
      });
    } else if (refname.startsWith("refs/heads/")) {
      heads.set(refname.slice("refs/heads/".length), object);
    }
  }

  const symbolic = await tryGit(["-C", mirror, "symbolic-ref", "--quiet", "HEAD"], options);
  const headRef = symbolic.ok ? symbolic.stdout.trim() : "";
  const head = headRef.startsWith("refs/heads/")
    ? headRef.slice("refs/heads/".length)
    : undefined;

  return { tags, tagList: [...tags.values()], heads, ...(head === undefined ? {} : { head }) };
}

function effectiveRef(
  spec: GitSourceSpec,
  refs: MirrorRefs,
  to: string | undefined,
): GitRef | undefined {
  if (to === undefined) return spec.ref;
  if (to.startsWith("semver:")) return { type: "range", range: to.slice("semver:".length) };
  if (refs.tags.has(to) || refs.heads.has(to)) return { type: "name", name: to };
  if (semver.validRange(to) !== null) return { type: "range", range: to };
  return { type: "name", name: to };
}

async function selectByRange(
  range: string,
  refs: MirrorRefs,
  source: string,
): Promise<Selection> {
  const candidates = versionTags(refs);
  const version = semver.maxSatisfying(
    candidates.map((tag) => tag.version as string),
    range,
  );
  const tag = candidates.find((candidate) => candidate.version === version);
  if (version === null || tag === undefined) {
    throw notFoundError(`Cannot resolve Git source ${source}: no version tag matches "${range}"`);
  }
  return { commit: tag.commit, version, requested: range };
}

async function selectByName(
  name: string,
  refs: MirrorRefs,
  mirror: string,
  source: string,
  options: GitOptions,
): Promise<Selection> {
  const tag = refs.tags.get(name);
  if (tag !== undefined) {
    return {
      commit: tag.commit,
      ...(versionAtCommit(refs, tag.commit) === undefined
        ? {}
        : { version: versionAtCommit(refs, tag.commit) }),
      requested: name,
    };
  }

  const branch = refs.heads.get(name);
  if (branch !== undefined) {
    return {
      commit: branch,
      ...(versionAtCommit(refs, branch) === undefined
        ? {}
        : { version: versionAtCommit(refs, branch) }),
      requested: name,
    };
  }

  if (/^[0-9a-f]{4,64}$/i.test(name)) {
    const resolved = await tryGit(
      ["-C", mirror, "rev-parse", "--verify", "--quiet", `${name}^{commit}`],
      options,
    );
    const commit = resolved.stdout.trim();
    if (resolved.ok && commit !== "") {
      return {
        commit,
        ...(versionAtCommit(refs, commit) === undefined
          ? {}
          : { version: versionAtCommit(refs, commit) }),
        requested: name,
      };
    }
  }

  throw notFoundError(`Cannot resolve Git source ${source}: ref "${name}" was not found`);
}

async function selectRef(
  spec: GitSourceSpec,
  refs: MirrorRefs,
  mirror: string,
  to: string | undefined,
  options: GitOptions,
): Promise<Selection> {
  const ref = effectiveRef(spec, refs, to);

  if (ref === undefined) {
    const newest = versionTags(refs)[0];
    if (newest !== undefined) {
      return {
        commit: newest.commit,
        version: newest.version as string,
        requested: `^${newest.version as string}`,
      };
    }

    const head = refs.head === undefined ? undefined : refs.heads.get(refs.head);
    if (head === undefined) {
      throw notFoundError(
        `Cannot resolve Git source ${spec.source}: the default branch was not found`,
      );
    }
    return { commit: head };
  }

  if (ref.type === "range") return selectByRange(ref.range, refs, spec.source);
  return selectByName(ref.name, refs, mirror, spec.source, options);
}

async function exportFactory(
  mirror: string,
  commit: string,
  fabDir: string,
  sourceLabel: string,
  layout: CacheLayout,
  options: GitOptions,
): Promise<void> {
  const hasFactory = await tryGit(["-C", mirror, "cat-file", "-e", `${commit}:.factory`], options);
  if (!hasFactory.ok) {
    const label = redact(sourceLabel);
    const problem: Problem = {
      level: "error",
      file: `${label.replace(/\/+$/, "")}/.factory`,
      line: 1,
      message: "A fab must contain a .factory directory",
      fix: "Add .factory/ to the fab",
    };
    throw new MetafabError(`Invalid fab from ${label}`, {
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
      problems: [problem],
    });
  }

  let staging: string;
  try {
    staging = await mkdtemp(path.join(tmpdir(), "metafab-git-"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw fetchError(`Cannot create a temporary directory in ${tmpdir()}: ${detail}`, error);
  }
  try {
    const archive = path.join(staging, "factory.tar");
    await writeVerbatimAttributes(mirror, sourceLabel);
    await runGit(
      [
        ...VERBATIM_CONFIG,
        "-C",
        mirror,
        "archive",
        "--format=tar",
        `--output=${archive}`,
        commit,
        ".factory",
      ],
      `Cannot export .factory from ${sourceLabel}`,
      options,
    );

    // `extractTarball` creates the staging directory itself; a cache Metafab
    // cannot write is reported as a cache write failure, not a bad tarball.
    await extractTarball(archive, fabDir, {
      writeError: (target, error) => cacheWriteError(target, layout.root, error),
    });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

function upstreamEntry(source: ResolvedGit): UpstreamEntry {
  return {
    kind: "git",
    source: sourceWithoutCredentials(source.spec.source),
    ...(source.requested === undefined ? {} : { requested: source.requested }),
    ...(source.version === undefined ? {} : { version: source.version }),
    commit: source.commit,
  };
}

export async function resolveGit(
  spec: GitSourceSpec,
  options: GitResolveOptions = {},
): Promise<ResolvedGit> {
  const layout = cacheLayout(options.cache ?? cacheRoot());
  const mirror = await ensureMirror(spec.url, layout, options);
  const refs = await listRefs(mirror, options);
  const selection = await selectRef(spec, refs, mirror, options.to, options);

  return {
    kind: "git",
    spec,
    commit: selection.commit,
    ...(selection.version === undefined ? {} : { version: selection.version }),
    ...(selection.requested === undefined ? {} : { requested: selection.requested }),
    versioned: true,
  };
}

export async function fetchGit(
  source: ResolvedGit,
  options: GitOptions = {},
): Promise<FetchedFab> {
  const layout = cacheLayout(options.cache ?? cacheRoot());
  const key = fabKey(
    FAB_FETCH_FORMAT,
    sourceWithoutCredentials(source.spec.source),
    source.commit,
  );
  const fabDir = layout.fabDir(key);
  const sourceLabel = `${source.spec.source}#${source.commit.slice(0, 7)}`;

  await getOrCreate(fabDir, {
    root: layout.root,
    validate: async (dir) => {
      await dropPayloadFiles(dir);
      await validateFab(dir, { sourceLabel });
      return fabDir;
    },
    create: async (staging) => {
      const mirror = await ensureMirror(source.spec.url, layout, options);
      await exportFactory(mirror, source.commit, staging, sourceLabel, layout, options);
      await dropPayloadFiles(staging);
      await validateFab(staging, { sourceLabel });
    },
  });

  return {
    factoryDir: layout.fabFactoryDir(key),
    upstream: upstreamEntry(source),
    versioned: true,
  };
}
