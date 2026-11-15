import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import semver from "semver";
import * as ssri from "ssri";
import { ExitCode, MetafabError } from "../../errors.js";
import type { UpstreamEntry } from "../config/types.js";
import { cacheWriteError, fabKey, getOrCreate } from "./cache.js";
import type { CacheLayout } from "./cache.js";
import { cacheRoot, cacheLayout } from "./cache.js";
import { withEnv } from "./env.js";
import { extractTarball, MAX_FAB_ENTRIES, MAX_FAB_TOTAL_SIZE } from "./extract.js";
import { MAX_TARBALL_SIZE } from "./https.js";
import { npmInvocation } from "./npm-cli.js";
import { FAB_DOWNLOAD_FIX, FAB_SIZE_FIX, sourceProblemFile } from "./problems.js";
import { redact } from "./redact.js";
import type { FetchedFab, NpmSourceSpec, Resolved } from "./types.js";
import { dropPayloadFiles, validateFab } from "./validate.js";

const execFileAsync = promisify(execFile);

export interface NpmOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  registry?: string;
  cache?: string;
  maxTarballSize?: number;
  /** The extracted-size cap, so a test can reach the refusal with a small fab. */
  maxTotalSize?: number;
}

export interface ResolveNpmOptions extends NpmOptions {
  to?: string;
  /**
   * True for the version a recorded upstream names. It was accepted once, so
   * the metadata size check is skipped; the checks after the download still
   * apply.
   */
  recorded?: boolean;
}

export type ResolvedNpm = Extract<Resolved, { kind: "npm" }>;

interface NpmFailure {
  stdout?: string;
  stderr?: string;
  message?: string;
}

function npmEnv(options: NpmOptions): NodeJS.ProcessEnv {
  return withEnv(
    options.env ?? process.env,
    options.registry === undefined ? {} : { npm_config_registry: options.registry },
  );
}

function npmMessage(failure: NpmFailure): string {
  const raw = (failure.stderr ?? "").trim() || (failure.stdout ?? "").trim() || failure.message || "";
  const lines = raw
    .split("\n")
    .map((line) => line.replace(/^npm (?:error|notice) /i, "").trimEnd())
    .filter((line) => line !== "" && !line.startsWith("A complete log of this run can be found"));
  return lines.join("\n") || "npm failed";
}

function fetchError(
  name: string,
  message: string,
  fix: string = `Check the package name and that npm can reach the registry (npm view ${name}), then run the command again`,
  cause?: unknown,
): MetafabError {
  const text = redact(message);
  return new MetafabError(text, {
    exitCode: ExitCode.FetchFailed,
    code: "fetch-failed",
    problems: [{ level: "error", file: sourceProblemFile(name), message: text, fix }],
    cause,
  });
}

/** The fix when the registry answered but has nothing the source's range accepts. */
function versionFix(name: string): string {
  return `Use a published version, a range or a dist-tag (npm view ${name} versions lists them)`;
}

async function runNpm(
  name: string,
  args: string[],
  options: NpmOptions,
  context: string,
): Promise<string> {
  const env = npmEnv(options);
  try {
    const npm = await npmInvocation({ env });
    const { stdout } = await execFileAsync(npm.command, [...npm.args, ...args], {
      cwd: options.cwd,
      env,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch (error) {
    if (error instanceof MetafabError) throw error;
    const failure = error as NpmFailure;
    const message = `${context}: ${npmMessage(failure)}`;
    throw fetchError(name, message, undefined, error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(name: string, value: string, context: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw fetchError(name, `${context}: npm returned invalid JSON`, undefined, error);
  }
}

interface PackageVersions {
  versions: string[];
  distTags: Record<string, string>;
}

/**
 * The versions npm reports. npm 9 prints a scalar `versions` when the package
 * has one published version; every other npm prints a list.
 */
export function npmVersionList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((version): version is string => typeof version === "string");
  }
  return typeof value === "string" ? [value] : [];
}

async function listVersions(spec: NpmSourceSpec, options: NpmOptions): Promise<PackageVersions> {
  const context = `Cannot resolve npm package "${spec.name}"`;
  const stdout = await runNpm(
    spec.name,
    ["view", spec.name, "versions", "dist-tags", "--json"],
    options,
    context,
  );
  const parsed = parseJson(spec.name, stdout, context);
  if (!isRecord(parsed)) throw fetchError(spec.name, `${context}: npm returned an unexpected response`);

  const versions = npmVersionList(parsed.versions);
  const distTags: Record<string, string> = {};
  if (isRecord(parsed["dist-tags"])) {
    for (const [tag, version] of Object.entries(parsed["dist-tags"])) {
      if (typeof version === "string") distTags[tag] = version;
    }
  }

  if (versions.length === 0) {
    throw fetchError(spec.name, `${context}: the package has no published versions`);
  }
  return { versions, distTags };
}

function highestVersion(versions: string[]): string | undefined {
  return semver.rsort(versions.filter((version) => semver.valid(version) !== null))[0];
}

function selectVersion(
  spec: NpmSourceSpec,
  requested: string | undefined,
  versions: PackageVersions,
): string {
  if (requested === undefined) {
    const latest = versions.distTags.latest;
    if (latest !== undefined) return latest;
    const highest = highestVersion(versions.versions);
    if (highest === undefined) {
      throw fetchError(spec.name, `Cannot resolve npm package "${spec.name}": no valid semantic versions`);
    }
    return highest;
  }

  const tagged = versions.distTags[requested];
  if (tagged !== undefined) return tagged;

  if (semver.validRange(requested) === null) {
    throw fetchError(
      spec.name,
      `Cannot resolve npm package "${spec.name}": "${requested}" is not a version, range, or dist-tag`,
      versionFix(spec.name),
    );
  }

  const selected = semver.maxSatisfying(versions.versions, requested);
  if (selected === null) {
    throw fetchError(
      spec.name,
      `Cannot resolve npm package "${spec.name}": no version matches "${requested}"`,
      versionFix(spec.name),
    );
  }
  return selected;
}

interface NpmManifest {
  tarball: string;
  integrity?: string;
  deprecated?: string;
  unpackedSize?: number;
  fileCount?: number;
}

function distIntegrity(dist: Record<string, unknown>): string | undefined {
  if (typeof dist.integrity === "string" && dist.integrity !== "") return dist.integrity;
  if (typeof dist.shasum === "string" && /^[0-9a-f]{40}$/i.test(dist.shasum)) {
    return ssri.fromHex(dist.shasum, "sha1").toString();
  }
  return undefined;
}

/** A count the registry reported, when it is one a real package can have. */
function distCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

async function readManifest(
  name: string,
  version: string,
  options: NpmOptions,
): Promise<NpmManifest> {
  const context = `Cannot resolve npm package "${name}@${version}"`;
  const stdout = await runNpm(name, ["view", `${name}@${version}`, "--json"], options, context);
  const parsed = parseJson(name, stdout, context);
  if (!isRecord(parsed) || !isRecord(parsed.dist)) {
    throw fetchError(name, `${context}: npm returned an unexpected response`);
  }

  const tarball = parsed.dist.tarball;
  if (typeof tarball !== "string" || tarball === "") {
    throw fetchError(name, `${context}: the registry did not report a tarball URL`);
  }

  const integrity = distIntegrity(parsed.dist);
  const unpackedSize = distCount(parsed.dist.unpackedSize);
  const fileCount = distCount(parsed.dist.fileCount);
  return {
    tarball,
    ...(integrity === undefined ? {} : { integrity }),
    ...(typeof parsed.deprecated === "string" ? { deprecated: parsed.deprecated } : {}),
    ...(unpackedSize === undefined ? {} : { unpackedSize }),
    ...(fileCount === undefined ? {} : { fileCount }),
  };
}

export async function resolveNpm(
  spec: NpmSourceSpec,
  options: ResolveNpmOptions = {},
): Promise<ResolvedNpm> {
  const requested = options.to ?? spec.requested;
  const versions = await listVersions(spec, options);
  const version = selectVersion(spec, requested, versions);
  const manifest = await readManifest(spec.name, version, options);
  // A recorded version was accepted once; a registry that later reports a
  // larger size must not make the update base look gone.
  const sizes: Pick<NpmManifest, "unpackedSize" | "fileCount"> =
    options.recorded === true ? {} : manifest;

  return {
    kind: "npm",
    spec,
    requested: requested ?? `^${version}`,
    version,
    tarball: manifest.tarball,
    ...(manifest.integrity === undefined ? {} : { integrity: manifest.integrity }),
    ...(manifest.deprecated === undefined ? {} : { deprecated: manifest.deprecated }),
    ...(sizes.unpackedSize === undefined ? {} : { unpackedSize: sizes.unpackedSize }),
    ...(sizes.fileCount === undefined ? {} : { fileCount: sizes.fileCount }),
    versioned: true,
  };
}

function npmFabError(
  sourceLabel: string,
  file: string,
  message: string,
  fix: string = "Fix package.json in the fab and publish it again, or use another version of the fab",
): MetafabError {
  return new MetafabError(`Invalid fab from ${redact(sourceLabel)}`, {
    exitCode: ExitCode.InvalidFab,
    code: "invalid-fab",
    problems: [
      {
        level: "error",
        file: sourceProblemFile(sourceLabel, file),
        line: 1,
        message,
        fix,
      },
    ],
  });
}

async function readPackageJson(root: string, sourceLabel: string): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await readFile(path.join(root, "package.json"), "utf8");
  } catch {
    throw npmFabError(
      sourceLabel,
      "package.json",
      "A fab package must contain a package.json",
      "Add a package.json with metafab.format 1",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw npmFabError(sourceLabel, "package.json", "package.json is not valid JSON");
  }
  if (!isRecord(parsed)) {
    throw npmFabError(sourceLabel, "package.json", "package.json must contain a JSON object");
  }
  return parsed;
}

function checkNpmFormat(packageJson: Record<string, unknown>, sourceLabel: string): void {
  const metafab = packageJson.metafab;
  if (!isRecord(metafab) || !("format" in metafab)) {
    throw npmFabError(
      sourceLabel,
      "package.json",
      "A fab package must set metafab.format",
      'Add "metafab": { "format": 1 } to package.json',
    );
  }
  if (metafab.format !== 1 && metafab.format !== 2) {
    throw npmFabError(
      sourceLabel,
      "package.json",
      `Unknown factory format ${JSON.stringify(metafab.format)}`,
      "Use format 1 or 2, or upgrade @seasb/metafab",
    );
  }
}

async function validateExtractedFab(root: string, sourceLabel: string): Promise<void> {
  const packageJson = await readPackageJson(root, sourceLabel);
  checkNpmFormat(packageJson, sourceLabel);
  await dropPayloadFiles(root);
  await validateFab(root, { sourceLabel, packageJson });
}

/** The label an npm fab is known by once its version is resolved. */
function packageLabel(source: ResolvedNpm): string {
  return `${source.spec.name}@${source.version}`;
}

/** An exit-4 problem about a resolved npm package, such as its size. */
function packageError(source: ResolvedNpm, message: string, fix: string): MetafabError {
  return new MetafabError(message, {
    exitCode: ExitCode.InvalidFab,
    code: "invalid-fab",
    problems: [{ level: "error", file: sourceProblemFile(packageLabel(source)), message, fix }],
  });
}

function verifyIntegrity(tarball: string, data: Buffer, integrity: string | undefined): void {
  if (integrity === undefined) return;
  try {
    ssri.checkData(data, integrity, { error: true });
  } catch (error) {
    const message = `Integrity check failed for ${tarball}`;
    throw new MetafabError(message, {
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
      problems: [
        { level: "error", file: sourceProblemFile(tarball), message, fix: FAB_DOWNLOAD_FIX },
      ],
      cause: error,
    });
  }
}

function tarballTooLarge(source: ResolvedNpm, size: number, maxBytes: number): MetafabError {
  return packageError(
    source,
    `Cannot download npm package "${packageLabel(source)}": the tarball is larger than ${maxBytes} bytes (${size} bytes)`,
    FAB_SIZE_FIX,
  );
}

function packageTooLarge(
  source: ResolvedNpm,
  unpackedSize: number,
  maxTotalSize: number,
): MetafabError {
  return packageError(
    source,
    `Cannot download npm package "${packageLabel(source)}": it unpacks to ${unpackedSize} bytes, more than the ${maxTotalSize}-byte fab limit`,
    FAB_SIZE_FIX,
  );
}

function packageHasTooManyFiles(
  source: ResolvedNpm,
  fileCount: number,
  maxEntries: number,
): MetafabError {
  return packageError(
    source,
    `Cannot download npm package "${packageLabel(source)}": it has ${fileCount} files, more than the ${maxEntries}-file fab limit`,
    FAB_SIZE_FIX,
  );
}

/** The size of the `.tgz` in a pack directory, if `npm pack` left one. */
async function packedTarballSize(packDir: string): Promise<number | undefined> {
  let entries: string[];
  try {
    entries = await readdir(packDir);
  } catch {
    return undefined;
  }
  const filename = entries.find((entry) => entry.endsWith(".tgz"));
  if (filename === undefined) return undefined;
  try {
    return (await stat(path.join(packDir, filename))).size;
  } catch {
    return undefined;
  }
}

/**
 * Writes the packed tarball to `staging`, the temporary entry `getOrCreate`
 * gives it, and names `target`, its final place, in an error: the staging file
 * is removed before the person reads the message.
 */
async function downloadTarball(
  source: ResolvedNpm,
  staging: string,
  target: string,
  root: string,
  options: NpmOptions,
): Promise<void> {
  const context = `Cannot download npm package "${source.spec.name}@${source.version}"`;
  const maxBytes = options.maxTarballSize ?? MAX_TARBALL_SIZE;
  const maxTotalSize = options.maxTotalSize ?? MAX_FAB_TOTAL_SIZE;

  // npm 9 and 10 hold the whole tarball in memory and write it in one call, so
  // the registry's own report is the only chance to refuse before the download.
  if (source.unpackedSize !== undefined && source.unpackedSize > maxTotalSize) {
    throw packageTooLarge(source, source.unpackedSize, maxTotalSize);
  }
  if (source.fileCount !== undefined && source.fileCount > MAX_FAB_ENTRIES) {
    throw packageHasTooManyFiles(source, source.fileCount, MAX_FAB_ENTRIES);
  }

  const packDir = await mkdtemp(path.join(tmpdir(), "metafab-pack-"));
  try {
    try {
      await runNpm(
        source.spec.name,
        [
          "pack",
          `${source.spec.name}@${source.version}`,
          "--pack-destination",
          packDir,
          "--json",
          "--ignore-scripts",
        ],
        options,
        context,
      );
    } catch (error) {
      // npm can fail after it has written the tarball. When that tarball is
      // already over the cap, the size is the useful reason, not npm's error.
      const size = await packedTarballSize(packDir);
      if (size !== undefined && size > maxBytes) throw tarballTooLarge(source, size, maxBytes);
      throw error;
    }

    const entries = await readdir(packDir);
    const filename = entries.find((entry) => entry.endsWith(".tgz"));
    if (filename === undefined) throw fetchError(source.spec.name, `${context}: npm pack produced no tarball`);

    const packed = path.join(packDir, filename);
    const size = (await stat(packed)).size;
    if (size > maxBytes) throw tarballTooLarge(source, size, maxBytes);

    const directory = path.dirname(staging);
    try {
      await mkdir(directory, { recursive: true });
    } catch (error) {
      throw cacheWriteError(directory, root, error);
    }
    try {
      await copyFile(packed, staging);
    } catch (error) {
      throw cacheWriteError(target, root, error);
    }
  } finally {
    await rm(packDir, { recursive: true, force: true });
  }
}

async function fetchNpmTarball(
  source: ResolvedNpm,
  layout: CacheLayout,
  options: NpmOptions,
): Promise<void> {
  const target = layout.npmTarball(source.spec.name, source.version);
  const maxBytes = options.maxTarballSize ?? MAX_TARBALL_SIZE;
  await getOrCreate(target, {
    root: layout.root,
    validate: async (dir) => {
      const size = (await stat(dir)).size;
      if (size > maxBytes) throw tarballTooLarge(source, size, maxBytes);
      const data = await readFile(dir);
      // Name the cache path the tarball belongs at, not the staging file just
      // read: `getOrCreate` removes the staging file, and a complete entry that
      // failed validation, so neither is there afterwards.
      verifyIntegrity(target, data, source.integrity);
      return target;
    },
    create: (staging) => downloadTarball(source, staging, target, layout.root, options),
  });
}

function upstreamEntry(source: ResolvedNpm): UpstreamEntry {
  return {
    kind: "npm",
    source: source.spec.name,
    requested: source.requested,
    version: source.version,
  };
}

export async function fetchNpm(
  source: ResolvedNpm,
  options: NpmOptions = {},
): Promise<FetchedFab> {
  const layout = cacheLayout(options.cache ?? cacheRoot());
  const sourceLabel = `${source.spec.name}@${source.version}`;

  await fetchNpmTarball(source, layout, options);

  const tarball = layout.npmTarball(source.spec.name, source.version);
  const key = fabKey(source.spec.name, source.version);
  const fabDir = layout.fabDir(key);

  await getOrCreate(fabDir, {
    root: layout.root,
    validate: (dir) => validateExtractedFab(dir, sourceLabel).then(() => fabDir),
    create: async (staging) => {
      // `extractTarball` creates the staging directory; a cache Metafab cannot
      // write is reported as a cache write failure, not a bad tarball.
      await extractTarball(tarball, staging, {
        stripPrefix: "package",
        writeError: (target, error) => cacheWriteError(target, layout.root, error),
      });
      await validateExtractedFab(staging, sourceLabel);
    },
  });

  return {
    factoryDir: layout.fabFactoryDir(key),
    upstream: upstreamEntry(source),
    ...(source.deprecated === undefined ? {} : { deprecated: source.deprecated }),
    versioned: true,
  };
}
