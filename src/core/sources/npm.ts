import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import semver from "semver";
import * as ssri from "ssri";
import { ExitCode, MetafabError } from "../../errors.js";
import type { UpstreamEntry } from "../config/types.js";
import { fabKey, getOrCreate } from "./cache.js";
import type { CacheLayout } from "./cache.js";
import { cacheRoot, cacheLayout } from "./cache.js";
import { extractTarball } from "./extract.js";
import { MAX_TARBALL_SIZE } from "./https.js";
import { redact } from "./redact.js";
import type { FetchedFab, NpmSourceSpec, Resolved } from "./types.js";
import { validateFab } from "./validate.js";

const execFileAsync = promisify(execFile);

export interface NpmOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  registry?: string;
  cache?: string;
  maxTarballSize?: number;
}

export interface ResolveNpmOptions extends NpmOptions {
  to?: string;
}

export type ResolvedNpm = Extract<Resolved, { kind: "npm" }>;

interface NpmFailure {
  stdout?: string;
  stderr?: string;
  message?: string;
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function npmEnv(options: NpmOptions): NodeJS.ProcessEnv {
  const env = { ...(options.env ?? process.env) };
  if (options.registry !== undefined) env.npm_config_registry = options.registry;
  return env;
}

function npmMessage(failure: NpmFailure): string {
  const raw = (failure.stderr ?? "").trim() || (failure.stdout ?? "").trim() || failure.message || "";
  const lines = raw
    .split("\n")
    .map((line) => line.replace(/^npm (?:error|notice) /i, "").trimEnd())
    .filter((line) => line !== "" && !line.startsWith("A complete log of this run can be found"));
  return lines.join("\n") || "npm failed";
}

function fetchError(message: string, cause?: unknown): MetafabError {
  return new MetafabError(redact(message), {
    exitCode: ExitCode.FetchFailed,
    code: "fetch-failed",
    cause,
  });
}

async function runNpm(args: string[], options: NpmOptions, context: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(npmCommand(), args, {
      cwd: options.cwd,
      env: npmEnv(options),
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch (error) {
    const failure = error as NpmFailure;
    throw fetchError(`${context}: ${npmMessage(failure)}`, error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: string, context: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw fetchError(`${context}: npm returned invalid JSON`, error);
  }
}

interface PackageVersions {
  versions: string[];
  distTags: Record<string, string>;
}

async function listVersions(spec: NpmSourceSpec, options: NpmOptions): Promise<PackageVersions> {
  const context = `Cannot resolve npm package "${spec.name}"`;
  const stdout = await runNpm(
    ["view", spec.name, "versions", "dist-tags", "--json"],
    options,
    context,
  );
  const parsed = parseJson(stdout, context);
  if (!isRecord(parsed)) throw fetchError(`${context}: npm returned an unexpected response`);

  const versions = Array.isArray(parsed.versions)
    ? parsed.versions.filter((version): version is string => typeof version === "string")
    : [];
  const distTags: Record<string, string> = {};
  if (isRecord(parsed["dist-tags"])) {
    for (const [tag, version] of Object.entries(parsed["dist-tags"])) {
      if (typeof version === "string") distTags[tag] = version;
    }
  }

  if (versions.length === 0) throw fetchError(`${context}: the package has no published versions`);
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
      throw fetchError(`Cannot resolve npm package "${spec.name}": no valid semantic versions`);
    }
    return highest;
  }

  const tagged = versions.distTags[requested];
  if (tagged !== undefined) return tagged;

  if (semver.validRange(requested) === null) {
    throw fetchError(
      `Cannot resolve npm package "${spec.name}": "${requested}" is not a version, range, or dist-tag`,
    );
  }

  const selected = semver.maxSatisfying(versions.versions, requested);
  if (selected === null) {
    throw fetchError(
      `Cannot resolve npm package "${spec.name}": no version matches "${requested}"`,
    );
  }
  return selected;
}

interface NpmManifest {
  tarball: string;
  integrity?: string;
  deprecated?: string;
}

function distIntegrity(dist: Record<string, unknown>): string | undefined {
  if (typeof dist.integrity === "string" && dist.integrity !== "") return dist.integrity;
  if (typeof dist.shasum === "string" && /^[0-9a-f]{40}$/i.test(dist.shasum)) {
    return ssri.fromHex(dist.shasum, "sha1").toString();
  }
  return undefined;
}

async function readManifest(
  name: string,
  version: string,
  options: NpmOptions,
): Promise<NpmManifest> {
  const context = `Cannot resolve npm package "${name}@${version}"`;
  const stdout = await runNpm(["view", `${name}@${version}`, "--json"], options, context);
  const parsed = parseJson(stdout, context);
  if (!isRecord(parsed) || !isRecord(parsed.dist)) {
    throw fetchError(`${context}: npm returned an unexpected response`);
  }

  const tarball = parsed.dist.tarball;
  if (typeof tarball !== "string" || tarball === "") {
    throw fetchError(`${context}: the registry did not report a tarball URL`);
  }

  const integrity = distIntegrity(parsed.dist);
  return {
    tarball,
    ...(integrity === undefined ? {} : { integrity }),
    ...(typeof parsed.deprecated === "string" ? { deprecated: parsed.deprecated } : {}),
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

  return {
    kind: "npm",
    spec,
    requested: requested ?? `^${version}`,
    version,
    tarball: manifest.tarball,
    ...(manifest.integrity === undefined ? {} : { integrity: manifest.integrity }),
    ...(manifest.deprecated === undefined ? {} : { deprecated: manifest.deprecated }),
    versioned: true,
  };
}

function npmFabError(
  sourceLabel: string,
  file: string,
  message: string,
  fix?: string,
): MetafabError {
  const label = redact(sourceLabel);
  return new MetafabError(`Invalid fab from ${label}`, {
    exitCode: ExitCode.InvalidFab,
    code: "invalid-fab",
    problems: [
      {
        level: "error",
        file: `${label.replace(/\/+$/, "")}/${file}`,
        line: 1,
        message,
        ...(fix === undefined ? {} : { fix }),
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
  if (metafab.format !== 1) {
    throw npmFabError(
      sourceLabel,
      "package.json",
      `Unknown factory format ${JSON.stringify(metafab.format)}`,
      "Use format 1",
    );
  }
}

async function validateExtractedFab(root: string, sourceLabel: string): Promise<void> {
  const packageJson = await readPackageJson(root, sourceLabel);
  checkNpmFormat(packageJson, sourceLabel);
  await validateFab(root, { sourceLabel, packageJson });
}

function verifyIntegrity(tarball: string, data: Buffer, integrity: string | undefined): void {
  if (integrity === undefined) return;
  try {
    ssri.checkData(data, integrity, { error: true });
  } catch (error) {
    throw new MetafabError(`Integrity check failed for ${tarball}`, {
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
      cause: error,
    });
  }
}

function tarballTooLarge(source: ResolvedNpm, size: number, maxBytes: number): MetafabError {
  return new MetafabError(
    `Cannot download npm package "${source.spec.name}@${source.version}": the tarball is larger than ${maxBytes} bytes (${size} bytes)`,
    { exitCode: ExitCode.InvalidFab, code: "invalid-fab" },
  );
}

async function downloadTarball(
  source: ResolvedNpm,
  target: string,
  options: NpmOptions,
): Promise<void> {
  const context = `Cannot download npm package "${source.spec.name}@${source.version}"`;
  const maxBytes = options.maxTarballSize ?? MAX_TARBALL_SIZE;
  const staging = await mkdtemp(path.join(tmpdir(), "metafab-pack-"));
  try {
    await runNpm(
      [
        "pack",
        `${source.spec.name}@${source.version}`,
        "--pack-destination",
        staging,
        "--json",
        "--ignore-scripts",
      ],
      options,
      context,
    );

    const entries = await readdir(staging);
    const filename = entries.find((entry) => entry.endsWith(".tgz"));
    if (filename === undefined) throw fetchError(`${context}: npm pack produced no tarball`);

    const packed = path.join(staging, filename);
    const size = (await stat(packed)).size;
    if (size > maxBytes) throw tarballTooLarge(source, size, maxBytes);

    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(packed, target);
  } finally {
    await rm(staging, { recursive: true, force: true });
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
    validate: async () => {
      const size = (await stat(target)).size;
      if (size > maxBytes) throw tarballTooLarge(source, size, maxBytes);
      const data = await readFile(target);
      verifyIntegrity(target, data, source.integrity);
      return target;
    },
    create: () => downloadTarball(source, target, options),
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
    validate: () => validateExtractedFab(fabDir, sourceLabel).then(() => fabDir),
    create: async () => {
      await rm(fabDir, { recursive: true, force: true });
      await mkdir(fabDir, { recursive: true });
      await extractTarball(tarball, fabDir, { stripPrefix: "package" });
      await validateExtractedFab(fabDir, sourceLabel);
    },
  });

  return {
    factoryDir: layout.fabFactoryDir(key),
    upstream: upstreamEntry(source),
    ...(source.deprecated === undefined ? {} : { deprecated: source.deprecated }),
    versioned: true,
  };
}
