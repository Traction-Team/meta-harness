import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import validateNpmPackageName from "validate-npm-package-name";
import { ExitCode, MetafabError } from "../../errors.js";
import { redact } from "./redact.js";
import type { GitRef, SourceSpec } from "./types.js";

export interface ParseSourceOptions {
  cwd: string;
}

const GITHUB_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DRIVE_PATH = /^[A-Za-z]:[\\/]/;
const UNC_PATH = /^\\\\/;
// `git@host:path` is the scp-like form Git itself accepts. The user is
// required so a Windows drive-relative path such as `C:fab` is never mistaken
// for a repository.
const SCP_GIT = /^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+:.+$/;

function invalidSource(input: string, reason: string): MetafabError {
  return new MetafabError(`Invalid source "${redact(input)}": ${reason}`, {
    exitCode: ExitCode.Failed,
    code: "invalid-source",
  });
}

function isPathLike(value: string): boolean {
  return (
    value.startsWith(".") ||
    value.startsWith("/") ||
    value.startsWith("\\") ||
    value.startsWith("~") ||
    DRIVE_PATH.test(value) ||
    UNC_PATH.test(value)
  );
}

function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(homedir(), value.slice(2));
  }
  return value;
}

function resolvePath(value: string, cwd: string): string {
  if (DRIVE_PATH.test(value) || UNC_PATH.test(value)) {
    return path.win32.resolve(value);
  }
  if (/^file:\/\/[^/]/i.test(value)) {
    throw invalidSource(value, "a file URL must use three slashes");
  }
  if (/^file:\/\//i.test(value)) {
    try {
      return fileURLToPath(new URL(value));
    } catch {
      throw invalidSource(value, "the file URL is not valid");
    }
  }
  return path.resolve(cwd, expandHome(value));
}

function parseGitRef(raw: string | undefined, input: string): GitRef | undefined {
  if (raw === undefined) return undefined;
  if (raw === "") throw invalidSource(input, "the Git ref is empty");
  if (raw.startsWith("semver:")) {
    const range = raw.slice("semver:".length);
    if (range === "") throw invalidSource(input, "the semver range is empty");
    return { type: "range", range };
  }
  return { type: "name", name: raw };
}

function splitRef(value: string): { base: string; ref?: string } {
  const index = value.lastIndexOf("#");
  if (index === -1) return { base: value };
  return { base: value.slice(0, index), ref: value.slice(index + 1) };
}

function parseGithub(input: string): SourceSpec {
  const { base, ref } = splitRef(input);
  const repository = base.slice("github:".length);
  if (!GITHUB_PATTERN.test(repository)) {
    throw invalidSource(input, "expected github:owner/repo");
  }
  const withoutGit = repository.endsWith(".git") ? repository.slice(0, -".git".length) : repository;
  return {
    kind: "git",
    url: `https://github.com/${withoutGit}.git`,
    source: `github:${repository}`,
    ...(ref === undefined ? {} : { ref: parseGitRef(ref, input) }),
  };
}

function parseGitUrl(input: string, prefix: string): SourceSpec {
  const { base, ref } = splitRef(input);
  const url = base.slice(prefix.length);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw invalidSource(input, "the Git URL is not valid");
  }
  if (parsed.hostname === "") throw invalidSource(input, "the Git URL has no host");

  return {
    kind: "git",
    url,
    source: base,
    ...(ref === undefined ? {} : { ref: parseGitRef(ref, input) }),
  };
}

function parseScpGit(input: string): SourceSpec {
  const { base, ref } = splitRef(input);
  const match = /^([A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+):(.+)$/.exec(base);
  const authority = match?.[1];
  const repository = match?.[2];
  if (authority === undefined || repository === undefined) {
    throw invalidSource(input, "the Git URL is not valid");
  }
  return {
    kind: "git",
    url: `ssh://${authority}/${repository}`,
    source: base,
    ...(ref === undefined ? {} : { ref: parseGitRef(ref, input) }),
  };
}

function parseHttps(input: string): SourceSpec {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw invalidSource(input, "the HTTPS URL is not valid");
  }
  if (parsed.protocol !== "https:" || parsed.hostname === "") {
    throw invalidSource(input, "expected an https URL");
  }
  return { kind: "https", url: input };
}

function splitNpm(value: string, input: string): { name: string; requested?: string } {
  let name = value;
  let requested: string | undefined;

  if (value.startsWith("@")) {
    const slash = value.indexOf("/");
    if (slash === -1) throw invalidSource(input, "expected an npm package name or @scope/name");
    const at = value.indexOf("@", slash);
    if (at !== -1) {
      name = value.slice(0, at);
      requested = value.slice(at + 1);
    }
  } else {
    const at = value.indexOf("@");
    if (at > 0) {
      name = value.slice(0, at);
      requested = value.slice(at + 1);
    }
  }

  if (name === "") throw invalidSource(input, "the npm package name is empty");
  const result = validateNpmPackageName(name);
  if (!result.validForOldPackages) {
    const reason = result.errors?.[0] ?? "the npm package name is not valid";
    throw invalidSource(input, reason);
  }

  if (requested !== undefined) {
    if (requested === "") throw invalidSource(input, "the npm range is empty");
    if (/[/\\:#]/.test(requested)) {
      throw invalidSource(input, "the npm range is not valid");
    }
  }

  return requested === undefined ? { name } : { name, requested };
}

export function parseSource(input: string, options: ParseSourceOptions): SourceSpec {
  const value = input.trim();
  if (value === "") throw invalidSource(input, "the source is empty");

  if (/^file:/i.test(value)) {
    const withoutProtocol = value.slice("file:".length);
    if (withoutProtocol === "") throw invalidSource(input, "the file source is empty");
    return {
      kind: "path",
      path: resolvePath(/^file:\/\//i.test(value) ? value : withoutProtocol, options.cwd),
      source: value,
    };
  }

  if (isPathLike(value)) {
    return { kind: "path", path: resolvePath(value, options.cwd), source: value };
  }

  if (/^github:/i.test(value)) return parseGithub(value);

  if (SCP_GIT.test(value)) return parseScpGit(value);
  if (/^ssh:\/\//i.test(value)) return parseGitUrl(value, "");

  if (/^git\+ssh:\/\//i.test(value)) return parseGitUrl(value, "git+");
  if (/^git\+https:\/\//i.test(value)) return parseGitUrl(value, "git+");

  if (/^https:\/\//i.test(value)) return parseHttps(value);

  const npm = splitNpm(value, input);
  return npm.requested === undefined
    ? { kind: "npm", name: npm.name }
    : { kind: "npm", name: npm.name, requested: npm.requested };
}
