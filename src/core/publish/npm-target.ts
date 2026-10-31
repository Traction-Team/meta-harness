import { execFile } from "node:child_process";
import { ExitCode, MetafabError } from "../../errors.js";
import type { PublishConfig } from "../config/types.js";
import { npmInvocation } from "../sources/npm-cli.js";
import { redact } from "../sources/redact.js";
import { provenanceEnabled } from "./provenance.js";
import type { PublishOptions } from "./types.js";

interface NpmResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

interface NpmFailure {
  stdout?: string;
  stderr?: string;
  message?: string;
}

const MAX_OUTPUT = 32 * 1024 * 1024;

function npmMessage(failure: NpmFailure): string {
  const raw = (failure.stderr ?? "").trim() || (failure.stdout ?? "").trim() || failure.message || "";
  const lines = raw
    .split("\n")
    .map((line) => line.replace(/^npm (?:error|notice) /i, "").trimEnd())
    .filter((line) => line !== "" && !line.startsWith("A complete log of this run can be found"));
  return lines.join("\n") || "npm failed";
}

function publishError(
  message: string,
  code: string,
  exitCode: ExitCode,
  cause?: unknown,
): MetafabError {
  return new MetafabError(redact(message), { exitCode, code, cause });
}

function notFound(result: NpmResult): boolean {
  const output = `${result.stderr}\n${result.stdout}`;
  return /\bE404\b|404 Not Found/i.test(output);
}

async function tryNpm(args: string[], env: NodeJS.ProcessEnv): Promise<NpmResult> {
  const npm = await npmInvocation({ env });
  try {
    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        execFile(
          npm.command,
          [...npm.args, ...args],
          { env, encoding: "utf8", maxBuffer: MAX_OUTPUT, windowsHide: true },
          (error, stdout, stderr) => {
            if (error === null) resolve({ stdout, stderr });
            else reject(Object.assign(error, { stdout, stderr }));
          },
        );
      },
    );
    return { ok: true, stdout, stderr };
  } catch (error) {
    const failure = error as NpmFailure;
    return {
      ok: false,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message ?? "",
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: string, context: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw publishError(
      `${context}: npm returned invalid JSON`,
      "publish-npm-invalid-json",
      ExitCode.Failed,
      error,
    );
  }
}

export interface NpmVersionState {
  /** The registry has this exact version. */
  exists: boolean;
  /** The registry's tarball has the same bytes as packing the staged fab. */
  identical: boolean;
}

interface PackedManifest {
  integrity?: string;
  shasum?: string;
}

function manifestHashes(dist: Record<string, unknown>): PackedManifest {
  return {
    ...(typeof dist.integrity === "string" && dist.integrity !== ""
      ? { integrity: dist.integrity }
      : {}),
    ...(typeof dist.shasum === "string" && dist.shasum !== "" ? { shasum: dist.shasum } : {}),
  };
}

async function packedHashes(root: string, env: NodeJS.ProcessEnv): Promise<PackedManifest> {
  const context = "Cannot pack the fab for the npm target";
  const result = await tryNpm(
    ["pack", root, "--dry-run", "--json", "--ignore-scripts"],
    env,
  );
  if (!result.ok) {
    throw publishError(`${context}: ${npmMessage(result)}`, "publish-npm-failed", ExitCode.Failed);
  }

  const parsed = parseJson(result.stdout, context);
  const manifest = Array.isArray(parsed) ? parsed[0] : undefined;
  if (!isRecord(manifest)) {
    throw publishError(
      `${context}: npm pack returned no package`,
      "publish-npm-failed",
      ExitCode.Failed,
    );
  }

  return {
    ...(typeof manifest.integrity === "string" ? { integrity: manifest.integrity } : {}),
    ...(typeof manifest.shasum === "string" ? { shasum: manifest.shasum } : {}),
  };
}

async function publishedHashes(
  name: string,
  version: string,
  env: NodeJS.ProcessEnv,
): Promise<PackedManifest> {
  const context = `Cannot read npm package "${name}@${version}"`;
  const result = await tryNpm(["view", `${name}@${version}`, "--json"], env);
  if (!result.ok) {
    throw publishError(`${context}: ${npmMessage(result)}`, "publish-npm-failed", ExitCode.FetchFailed);
  }

  const parsed = parseJson(result.stdout, context);
  if (!isRecord(parsed) || !isRecord(parsed.dist)) {
    throw publishError(
      `${context}: npm returned an unexpected response`,
      "publish-npm-failed",
      ExitCode.Failed,
    );
  }
  return manifestHashes(parsed.dist);
}

function sameContent(published: PackedManifest, packed: PackedManifest): boolean {
  // Integrity covers the tarball bytes that the registry stores. A registry
  // that reports only a SHA-1 shasum is compared on that instead.
  if (published.integrity !== undefined) return published.integrity === packed.integrity;
  if (published.shasum !== undefined) return published.shasum === packed.shasum;
  // Nothing to compare with: an existing version can never be proven identical.
  return false;
}

/**
 * Whether `name@version` is on the registry, and if so whether it carries the
 * same tarball as the staged fab would. A 404 means the version is new.
 */
export async function npmVersionState(
  publish: PublishConfig,
  version: string,
  root: string,
  options: PublishOptions = {},
): Promise<NpmVersionState> {
  if (publish.name === undefined) {
    throw publishError(
      "The npm target requires publish.name.",
      "publish-missing-setting",
      ExitCode.Failed,
    );
  }
  const env = options.env ?? process.env;
  const context = `Cannot check npm package "${publish.name}@${version}"`;

  const viewed = await tryNpm(["view", `${publish.name}@${version}`, "version", "--json"], env);
  if (!viewed.ok) {
    if (notFound(viewed)) return { exists: false, identical: false };
    throw publishError(`${context}: ${npmMessage(viewed)}`, "publish-npm-failed", ExitCode.FetchFailed);
  }

  const [published, packed] = await Promise.all([
    publishedHashes(publish.name, version, env),
    packedHashes(root, env),
  ]);
  return { exists: true, identical: sameContent(published, packed) };
}

function forward(
  stream: NodeJS.ReadableStream | null,
  onText: (text: string) => void,
  collect: (text: string) => void,
): void {
  stream?.on("data", (chunk: Buffer | string) => {
    const text = chunk.toString();
    collect(text);
    onText(text);
  });
}

async function publishNpm(
  args: string[],
  env: NodeJS.ProcessEnv,
  onText: (text: string) => void,
): Promise<void> {
  const npm = await npmInvocation({ env });
  let stdout = "";
  let stderr = "";

  await new Promise<void>((resolve, reject) => {
    const child = execFile(
      npm.command,
      [...npm.args, ...args],
      { env, encoding: "utf8", maxBuffer: MAX_OUTPUT, windowsHide: true },
      (error) => {
        if (error === null) resolve();
        else reject(Object.assign(error, { stdout, stderr }));
      },
    );
    forward(child.stdout, onText, (text) => {
      stdout += text;
    });
    forward(child.stderr, onText, (text) => {
      stderr += text;
    });
  });
}

/** `npm publish` in the staging directory, streaming its output to the report's stderr. */
export async function publishNpmFab(
  publish: PublishConfig,
  version: string,
  root: string,
  options: PublishOptions = {},
): Promise<string> {
  if (publish.name === undefined) {
    throw publishError("The npm target requires publish.name.", "publish-missing-setting", ExitCode.Failed);
  }
  const env = options.env ?? process.env;
  const onText = options.stderr ?? ((text: string) => process.stderr.write(text));

  const args = ["publish", root, "--access", publish.access ?? "public", "--ignore-scripts"];
  if (options.tag !== undefined) args.push("--tag", options.tag);
  if (provenanceEnabled(env)) args.push("--provenance");

  try {
    await publishNpm(args, env, onText);
  } catch (error) {
    const detail = npmMessage(error as NpmFailure);
    throw publishError(
      `Cannot publish ${publish.name}@${version}: ${detail}`,
      "publish-npm-failed",
      ExitCode.Failed,
      error,
    );
  }

  return `Published ${publish.name}@${version} to npm${options.tag === undefined ? "" : ` with tag ${options.tag}`}.`;
}
