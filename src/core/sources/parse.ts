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
// Git's own test for the scp-like form: the first colon must come before any
// slash (so `host:path` is scp but `host/path:x` is not), and a Windows drive
// path is a path, never a host. The user is required so a drive-relative path
// such as `C:fab` is never mistaken for a repository.
const SCP_GIT = /^([A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+):(.+)$/;
const SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//;
const ANY_SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):/;

const SUPPORTED_SOURCES =
  "an npm name, github:owner/repo, git+https://, git+ssh://, ssh://, git@host:path, git+file:///<path>, an https:// tarball, or a local path";
const GIT_SOURCE_FIX =
  "Use git+https://, git+ssh://, git+file://, ssh://, user@host:path or github:owner/repo for a Git repository, an https:// URL for a tarball, an npm name, or a local path";
const WINDOWS_PATH_FIX = "Write the path as C:\\fabs\\acme or C:/fabs/acme";

function isScpGit(value: string): boolean {
  if (DRIVE_PATH.test(value)) return false;
  const colon = value.indexOf(":");
  if (colon <= 0) return false;
  const slash = value.indexOf("/");
  if (slash !== -1 && slash < colon) return false;
  return SCP_GIT.test(value);
}

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

/**
 * A `git+file://` source is a Git repository on this machine or a mounted
 * share, such as the bare fab repository `publish.git: file:///…` writes. The
 * path must be absolute, so `update` can re-parse the recorded source from
 * another working directory: three slashes, `localhost`, or a Windows drive.
 * The URL Git is given is `file:` plus the text after `git+file:`, unchanged;
 * Git accepts and decodes that text itself, and re-serialising it would change
 * the recorded source and the mirror key.
 */
function parseGitFileUrl(input: string): SourceSpec {
  const { base, ref } = splitRef(input);
  const rest = base.slice("git+file:".length);
  if (!rest.startsWith("//")) {
    throw invalidSource(
      input,
      "a Git file URL must be absolute, such as git+file:///srv/fabs/fab.git",
    );
  }

  const after = rest.slice(2);
  if (after === "" || after === "/") {
    throw invalidSource(input, "the Git file URL has no path");
  }
  // Git accepts an empty host (the third slash), `localhost`, and a Windows
  // drive right after `//` or `///`. Any other authority names a host.
  if (!after.startsWith("/") && !/^localhost\//i.test(after) && !DRIVE_PATH.test(after)) {
    throw invalidSource(input, "a Git file URL cannot name a host; use git+file:///<absolute path>");
  }

  return {
    kind: "git",
    url: `file:${rest}`,
    source: base,
    ...(ref === undefined ? {} : { ref: parseGitRef(ref, input) }),
  };
}

function schemeHint(scheme: string): string | undefined {
  // A one-letter scheme is a Windows drive with no slash after it: `C:fab` is
  // drive-relative, so it cannot name a repository.
  if (/^[a-z]$/.test(scheme)) {
    return "A Windows path needs a slash after the drive, such as C:\\fabs\\acme";
  }
  if (scheme === "http") return "Use https:// for a tarball or git+https:// for a Git repository";
  if (scheme === "git" || scheme === "git+http") return "Use git+https:// or git+ssh://";
  return undefined;
}

/**
 * Every value that looks like a URL scheme but is not a supported source is
 * refused with the list of forms `import` reads, instead of falling through to
 * the npm package-name parser and its unhelpful error. Unlike `invalidSource`,
 * this carries a problem with a fix line, so the CLI prints what to write
 * instead.
 */
function unsupportedScheme(input: string, rawScheme: string): MetafabError {
  const shown = redact(input);
  const scheme = rawScheme.toLowerCase();
  const hint = schemeHint(scheme);
  const message =
    `Invalid source "${shown}": unsupported URL scheme "${scheme}:". ` +
    `Supported sources: ${SUPPORTED_SOURCES}${hint === undefined ? "" : `. ${hint}`}`;
  const fix = /^[a-z]$/.test(scheme) ? WINDOWS_PATH_FIX : GIT_SOURCE_FIX;

  return new MetafabError(message, {
    exitCode: ExitCode.Failed,
    code: "invalid-source",
    problems: [{ level: "error", file: shown, message, fix }],
  });
}

function parseGitUrl(input: string, prefix: string): SourceSpec {
  const { base, ref } = splitRef(input);
  const rawUrl = base.slice(prefix.length);
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw invalidSource(input, "the Git URL is not valid");
  }
  if (parsed.hostname === "") throw invalidSource(input, "the Git URL has no host");

  // Git compares the scheme of the URL it is handed case-sensitively, so a
  // source typed as `git+HTTPS://…` would reach it as an unknown protocol.
  // Lower-case only the scheme; keep the rest of the text byte for byte, and
  // record `source` exactly as the user wrote it.
  const schemeEnd = rawUrl.indexOf("://");
  const url = `${rawUrl.slice(0, schemeEnd).toLowerCase()}${rawUrl.slice(schemeEnd)}`;

  return {
    kind: "git",
    url,
    source: base,
    ...(ref === undefined ? {} : { ref: parseGitRef(ref, input) }),
  };
}

function parseScpGit(input: string): SourceSpec {
  const { base, ref } = splitRef(input);
  if (!isScpGit(base)) {
    throw invalidSource(input, "the Git URL is not valid");
  }
  // Keep the scp string as the URL: Git accepts it as written, and rewriting
  // it to `ssh://host/path` would turn the scp form's home-relative path into
  // an absolute one.
  return {
    kind: "git",
    url: base,
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

  if (/^git\+file:/i.test(value)) return parseGitFileUrl(value);

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

  if (isScpGit(value)) return parseScpGit(value);
  if (/^ssh:\/\//i.test(value)) return parseGitUrl(value, "");

  if (/^git\+ssh:\/\//i.test(value)) return parseGitUrl(value, "git+");
  if (/^git\+https:\/\//i.test(value)) return parseGitUrl(value, "git+");

  if (/^https:\/\//i.test(value)) return parseHttps(value);

  // An npm name never contains `:`, and the scp and path forms above have
  // already claimed `git@host:path` and `C:\…` or `C:/…`.
  const scheme = ANY_SCHEME.exec(value);
  if (scheme !== null) throw unsupportedScheme(input, scheme[1] as string);

  const npm = splitNpm(value, input);
  return npm.requested === undefined
    ? { kind: "npm", name: npm.name }
    : { kind: "npm", name: npm.name, requested: npm.requested };
}

/**
 * The URL to hand to Git: `git+https://`, `git+ssh://` and `git+file://` lose
 * `git+`. The scheme is lower-cased because Git compares it case-sensitively,
 * and the rest of the text is kept byte for byte. An scp form has no scheme
 * with `//`, so it is returned unchanged.
 */
export function gitTransportUrl(url: string): string {
  const match = SCHEME.exec(url);
  if (match === null) return url;
  const scheme = (match[1] as string).replace(/^git\+/i, "").toLowerCase();
  return `${scheme}://${url.slice(match[0].length)}`;
}

/**
 * The source `import` accepts for a URL Git accepts: `https://` and `file://`
 * gain `git+`. Every other form is returned unchanged, and only the scheme
 * text changes.
 */
export function importSourceForGitUrl(url: string): string {
  const match = SCHEME.exec(url);
  if (match === null) return url;
  const scheme = (match[1] as string).toLowerCase();
  if (scheme.startsWith("git+") || (scheme !== "https" && scheme !== "file")) return url;
  return `git+${scheme}://${url.slice(match[0].length)}`;
}
