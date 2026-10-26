import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import semver from "semver";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import type { UpstreamEntry } from "../config/types.js";
import { pathExists } from "../../util/fs.js";
import { cacheLayout, cacheRoot, fabKey, getOrCreate } from "./cache.js";
import type { CacheLayout } from "./cache.js";
import { extractTarball } from "./extract.js";
import { redact } from "./redact.js";
import type { FetchedFab, GitRef, GitSourceSpec, Resolved } from "./types.js";
import { validateFab } from "./validate.js";

const execFileAsync = promisify(execFile);

const GIT_CONFIG_ARGS = ["-c", "core.hooksPath=/dev/null"];

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

function gitEnvironment(options: GitOptions): NodeJS.ProcessEnv {
  const env = { ...(options.env ?? process.env) };
  if (options.interactive !== true) env.GIT_TERMINAL_PROMPT = "0";
  return env;
}

function gitOptions(options: GitOptions): {
  env: NodeJS.ProcessEnv;
  encoding: "utf8";
  maxBuffer: number;
  windowsHide: true;
} {
  return {
    env: gitEnvironment(options),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  };
}

function gitMessage(failure: GitFailure): string {
  const raw = (failure.stderr ?? "").trim() || (failure.stdout ?? "").trim() || failure.message || "";
  const lines = raw
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "");
  return lines.join("\n") || "git failed";
}

function fetchError(message: string, cause?: unknown): MetafabError {
  return new MetafabError(redact(message), {
    exitCode: ExitCode.FetchFailed,
    code: "fetch-failed",
    cause,
  });
}

async function runGit(args: string[], context: string, options: GitOptions): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", [...GIT_CONFIG_ARGS, ...args], gitOptions(options));
    return stdout;
  } catch (error) {
    throw fetchError(`${context}: ${gitMessage(error as GitFailure)}`, error);
  }
}

async function tryGit(args: string[], options: GitOptions): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", [...GIT_CONFIG_ARGS, ...args], gitOptions(options));
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

async function cloneMirror(
  url: string,
  mirror: string,
  options: GitOptions,
): Promise<void> {
  await mkdir(path.dirname(mirror), { recursive: true });
  try {
    await runGit(
      ["clone", "--mirror", "--", url, mirror],
      `Cannot clone Git source ${url}`,
      options,
    );
  } catch (error) {
    await rm(mirror, { recursive: true, force: true });
    throw error;
  }
}

async function isUsableMirror(mirror: string, options: GitOptions): Promise<boolean> {
  const bare = await tryGit(["-C", mirror, "rev-parse", "--is-bare-repository"], options);
  if (!bare.ok || bare.stdout.trim() !== "true") return false;
  const origin = await tryGit(["-C", mirror, "config", "--get", "remote.origin.url"], options);
  return origin.ok && origin.stdout.trim() !== "";
}

async function replaceMirror(
  url: string,
  mirror: string,
  options: GitOptions,
): Promise<string> {
  const replacement = `${mirror}.tmp-${randomUUID()}`;
  await cloneMirror(url, replacement, options);

  const backup = `${mirror}.old-${randomUUID()}`;
  await rename(mirror, backup);
  try {
    await rename(replacement, mirror);
  } catch (error) {
    await rename(backup, mirror).catch(() => undefined);
    await rm(replacement, { recursive: true, force: true });
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
  return mirror;
}

async function ensureMirror(url: string, layout: CacheLayout, options: GitOptions): Promise<string> {
  const mirror = layout.gitMirror(url);

  if (await pathExists(mirror)) {
    if (await isUsableMirror(mirror, options)) {
      const fetched = await tryGit(["-C", mirror, "fetch", "--prune", "--tags"], options);
      if (fetched.ok) return mirror;
      return replaceMirror(url, mirror, options);
    }
    await rm(mirror, { recursive: true, force: true });
  }

  await cloneMirror(url, mirror, options);
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
    throw fetchError(`Cannot resolve Git source ${source}: no version tag matches "${range}"`);
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

  throw fetchError(`Cannot resolve Git source ${source}: ref "${name}" was not found`);
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
      throw fetchError(
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

  const staging = await mkdtemp(path.join(tmpdir(), "metafab-git-"));
  try {
    const archive = path.join(staging, "factory.tar");
    await runGit(
      ["-C", mirror, "archive", "--format=tar", `--output=${archive}`, commit, ".factory"],
      `Cannot export .factory from ${sourceLabel}`,
      options,
    );

    await rm(fabDir, { recursive: true, force: true });
    await mkdir(fabDir, { recursive: true });
    await extractTarball(archive, fabDir);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

function upstreamEntry(source: ResolvedGit): UpstreamEntry {
  return {
    kind: "git",
    source: source.spec.source,
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
  const key = fabKey(source.spec.source, source.commit);
  const fabDir = layout.fabDir(key);
  const sourceLabel = `${source.spec.source}#${source.commit.slice(0, 7)}`;

  await getOrCreate(fabDir, {
    validate: async () => {
      await validateFab(fabDir, { sourceLabel });
      return fabDir;
    },
    create: async () => {
      const mirror = await ensureMirror(source.spec.url, layout, options);
      await exportFactory(mirror, source.commit, fabDir, sourceLabel, options);
      await validateFab(fabDir, { sourceLabel });
    },
  });

  return {
    factoryDir: layout.fabFactoryDir(key),
    upstream: upstreamEntry(source),
    versioned: true,
  };
}
