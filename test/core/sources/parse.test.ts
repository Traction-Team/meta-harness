import { homedir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import {
  gitTransportUrl,
  importSourceForGitUrl,
  parseSource,
} from "../../../src/core/sources/index.js";

const CWD = path.resolve("/work/repo");

function failure(source: string): MetafabError {
  try {
    parseSource(source, { cwd: CWD });
  } catch (error) {
    return error as MetafabError;
  }
  throw new Error(`expected parseSource to refuse ${source}`);
}

describe("parseSource", () => {
  test("parses every row of the supported-sources table", () => {
    expect(parseSource("@seasb/fab-mark4@^1.2.0", { cwd: CWD })).toEqual({
      kind: "npm",
      name: "@seasb/fab-mark4",
      requested: "^1.2.0",
    });

    expect(parseSource("github:seasb/fab-mark4#v1.2.0", { cwd: CWD })).toEqual({
      kind: "git",
      url: "https://github.com/seasb/fab-mark4.git",
      source: "github:seasb/fab-mark4",
      ref: { type: "name", name: "v1.2.0" },
    });

    expect(parseSource("git+ssh://git@example.com/fab-acme.git", { cwd: CWD })).toEqual({
      kind: "git",
      url: "ssh://git@example.com/fab-acme.git",
      source: "git+ssh://git@example.com/fab-acme.git",
    });

    expect(parseSource("git+https://example.com/fab-acme.git", { cwd: CWD })).toEqual({
      kind: "git",
      url: "https://example.com/fab-acme.git",
      source: "git+https://example.com/fab-acme.git",
    });

    expect(parseSource("https://example.com/fab-acme-1.0.0.tgz", { cwd: CWD })).toEqual({
      kind: "https",
      url: "https://example.com/fab-acme-1.0.0.tgz",
    });

    // A plain https URL is an HTTPS tarball even when it ends in `.git`; only
    // `git+https://` selects Git.
    expect(parseSource("https://example.com/fab-acme.git", { cwd: CWD })).toEqual({
      kind: "https",
      url: "https://example.com/fab-acme.git",
    });

    expect(parseSource("ssh://git@example.com/fab-acme.git", { cwd: CWD })).toEqual({
      kind: "git",
      url: "ssh://git@example.com/fab-acme.git",
      source: "ssh://git@example.com/fab-acme.git",
    });

    expect(parseSource("git@example.com:fab-acme.git#v1.0.0", { cwd: CWD })).toEqual({
      kind: "git",
      url: "git@example.com:fab-acme.git",
      source: "git@example.com:fab-acme.git",
      ref: { type: "name", name: "v1.0.0" },
    });

    expect(parseSource("../platform/.factory", { cwd: CWD })).toEqual({
      kind: "path",
      path: path.resolve("/work/platform/.factory"),
      source: "../platform/.factory",
    });

    expect(parseSource("file:../fab-acme", { cwd: CWD })).toEqual({
      kind: "path",
      path: path.resolve("/work/fab-acme"),
      source: "file:../fab-acme",
    });
  });

  test("parses npm names, scopes and ranges", () => {
    expect(parseSource("fab-acme", { cwd: CWD })).toEqual({ kind: "npm", name: "fab-acme" });
    expect(parseSource("@seasb/fab-mark4", { cwd: CWD })).toEqual({
      kind: "npm",
      name: "@seasb/fab-mark4",
    });
    expect(parseSource("fab-acme@1.2.3", { cwd: CWD })).toEqual({
      kind: "npm",
      name: "fab-acme",
      requested: "1.2.3",
    });
    expect(parseSource("@seasb/fab-mark4@latest", { cwd: CWD })).toEqual({
      kind: "npm",
      name: "@seasb/fab-mark4",
      requested: "latest",
    });
  });

  test("parses every Git ref form", () => {
    expect(parseSource("github:seasb/fab-mark4", { cwd: CWD })).toEqual({
      kind: "git",
      url: "https://github.com/seasb/fab-mark4.git",
      source: "github:seasb/fab-mark4",
    });
    expect(parseSource("github:seasb/fab-mark4#semver:^1.2.0", { cwd: CWD })).toEqual({
      kind: "git",
      url: "https://github.com/seasb/fab-mark4.git",
      source: "github:seasb/fab-mark4",
      ref: { type: "range", range: "^1.2.0" },
    });
    expect(parseSource("github:seasb/fab-mark4#main", { cwd: CWD })).toEqual({
      kind: "git",
      url: "https://github.com/seasb/fab-mark4.git",
      source: "github:seasb/fab-mark4",
      ref: { type: "name", name: "main" },
    });
    expect(parseSource("github:seasb/fab-mark4#3f9c2e1", { cwd: CWD })).toEqual({
      kind: "git",
      url: "https://github.com/seasb/fab-mark4.git",
      source: "github:seasb/fab-mark4",
      ref: { type: "name", name: "3f9c2e1" },
    });
    expect(parseSource("github:seasb/fab-mark4.git", { cwd: CWD })).toEqual({
      kind: "git",
      url: "https://github.com/seasb/fab-mark4.git",
      source: "github:seasb/fab-mark4.git",
    });
  });

  test("resolves home and absolute paths", () => {
    expect(parseSource("~", { cwd: CWD })).toEqual({
      kind: "path",
      path: homedir(),
      source: "~",
    });
    expect(parseSource("~/factories/base", { cwd: CWD })).toEqual({
      kind: "path",
      path: path.join(homedir(), "factories/base"),
      source: "~/factories/base",
    });
    expect(parseSource("/opt/factories/base", { cwd: CWD })).toEqual({
      kind: "path",
      path: path.resolve("/opt/factories/base"),
      source: "/opt/factories/base",
    });
  });

  test("parses Windows paths", () => {
    expect(parseSource("C:\\fab\\acme", { cwd: CWD })).toEqual({
      kind: "path",
      path: path.win32.resolve("C:\\fab\\acme"),
      source: "C:\\fab\\acme",
    });
    expect(parseSource("C:/fab/acme", { cwd: CWD })).toEqual({
      kind: "path",
      path: path.win32.resolve("C:\\fab\\acme"),
      source: "C:/fab/acme",
    });
    expect(parseSource("\\\\server\\share\\fab", { cwd: CWD })).toEqual({
      kind: "path",
      path: path.win32.resolve("\\\\server\\share\\fab"),
      source: "\\\\server\\share\\fab",
    });
    expect(parseSource("~\\fab", { cwd: CWD })).toEqual({
      kind: "path",
      path: path.join(homedir(), "fab"),
      source: "~\\fab",
    });
  });

  test("keeps the scp form as the Git URL", () => {
    // Rewriting it to ssh:// would make the scp path absolute: Git treats
    // `git@host:path` as relative to the user's home directory.
    expect(parseSource("git@example.com:fab-acme.git", { cwd: CWD })).toEqual({
      kind: "git",
      url: "git@example.com:fab-acme.git",
      source: "git@example.com:fab-acme.git",
    });
  });

  test("never reads a Windows drive path as scp", () => {
    // Git's rule: the first colon must come before any slash, and a drive
    // letter is never a host.
    for (const value of ["C:\\x", "C:/x", "C:\\Users\\me@work\\fab", "C:/Users/me@work/fab"]) {
      const spec = parseSource(value, { cwd: CWD });
      expect(spec.kind, value).toBe("path");
    }
  });

  test("accepts upper-case and mixed-case schemes", () => {
    expect(parseSource("HTTPS://bucket.example/fab.tgz", { cwd: CWD })).toEqual({
      kind: "https",
      url: "HTTPS://bucket.example/fab.tgz",
    });
    // Git compares the URL scheme case-sensitively, so the fetch URL is
    // lower-cased while the recorded source keeps the user's text.
    expect(parseSource("git+HTTPS://example.com/fab.git", { cwd: CWD })).toEqual({
      kind: "git",
      url: "https://example.com/fab.git",
      source: "git+HTTPS://example.com/fab.git",
    });
    expect(parseSource("Git+Ssh://git@example.com/fab.git", { cwd: CWD })).toEqual({
      kind: "git",
      url: "ssh://git@example.com/fab.git",
      source: "Git+Ssh://git@example.com/fab.git",
    });
    expect(parseSource("SSH://git@example.com/fab.git", { cwd: CWD })).toEqual({
      kind: "git",
      url: "ssh://git@example.com/fab.git",
      source: "SSH://git@example.com/fab.git",
    });
  });

  test("rejects invalid sources", () => {
    const invalid = [
      "",
      "   ",
      "github:",
      "github:owner",
      "github:owner/repo#",
      "github:owner/repo#semver:",
      "git+ssh://",
      "git+https://",
      "https://",
      "file:",
      "fab@",
      "@scope",
      "fab@bad#range",
      "not a package",
    ];

    for (const source of invalid) {
      expect(() => parseSource(source, { cwd: CWD }), source).toThrowError(MetafabError);
      try {
        parseSource(source, { cwd: CWD });
      } catch (error) {
        expect((error as MetafabError).exitCode).toBe(ExitCode.Failed);
        expect((error as MetafabError).code).toBe("invalid-source");
      }
    }
  });

  test("parses git+file URLs and records the source as typed", () => {
    // The bare fab repository `publish.git: file:///…` writes, read back.
    expect(parseSource("git+file:///srv/fab.git#v1.0.0", { cwd: CWD })).toEqual({
      kind: "git",
      url: "file:///srv/fab.git",
      source: "git+file:///srv/fab.git",
      ref: { type: "name", name: "v1.0.0" },
    });
    expect(parseSource("git+file://localhost/srv/fab.git", { cwd: CWD })).toEqual({
      kind: "git",
      url: "file://localhost/srv/fab.git",
      source: "git+file://localhost/srv/fab.git",
    });
    // Git compares the scheme case-sensitively, so the transport URL is
    // lower-cased; the recorded source keeps the user's text.
    expect(parseSource("GIT+FILE:///srv/fab.git", { cwd: CWD })).toEqual({
      kind: "git",
      url: "file:///srv/fab.git",
      source: "GIT+FILE:///srv/fab.git",
    });
    expect(parseSource("git+file:///C:/fabs/fab.git", { cwd: CWD })).toEqual({
      kind: "git",
      url: "file:///C:/fabs/fab.git",
      source: "git+file:///C:/fabs/fab.git",
    });
    expect(parseSource("git+file://C:\\fabs\\fab.git", { cwd: CWD })).toEqual({
      kind: "git",
      url: "file://C:\\fabs\\fab.git",
      source: "git+file://C:\\fabs\\fab.git",
    });
    // `update` re-parses the recorded source, so an encoded path stays encoded.
    expect(parseSource("git+file:///srv/my%20fab.git", { cwd: CWD })).toEqual({
      kind: "git",
      url: "file:///srv/my%20fab.git",
      source: "git+file:///srv/my%20fab.git",
    });
  });

  test("refuses a git+file URL that is not an absolute path", () => {
    const refused: Array<[source: string, reason: string]> = [
      ["git+file://host/fab.git", "a Git file URL cannot name a host"],
      ["git+file:../fab.git", "a Git file URL must be absolute"],
      ["git+file:///", "the Git file URL has no path"],
      ["git+file://", "the Git file URL has no path"],
    ];

    for (const [source, reason] of refused) {
      const error = failure(source);
      expect(error.code, source).toBe("invalid-source");
      expect(error.exitCode, source).toBe(ExitCode.Failed);
      expect(error.message, source).toContain(reason);
    }
  });

  test("refuses an unsupported URL scheme with the supported forms", () => {
    const refused: Array<[source: string, message: string]> = [
      ["ftp://x/f.tgz", 'unsupported URL scheme "ftp:"'],
      ["http://x/f.tgz", 'unsupported URL scheme "http:"'],
      // The scheme is lower-cased before it picks a hint and is quoted so.
      ["HTTP://x/f.tgz", 'unsupported URL scheme "http:"'],
      ["git://x/f.git", 'unsupported URL scheme "git:"'],
      ["git+http://x/f.git", 'unsupported URL scheme "git+http:"'],
      ["gitlab:a/b", 'unsupported URL scheme "gitlab:"'],
    ];

    for (const [source, message] of refused) {
      const error = failure(source);
      expect(error.code, source).toBe("invalid-source");
      expect(error.exitCode, source).toBe(ExitCode.Failed);
      expect(error.message, source).toContain(message);
      expect(error.message, source).toContain("Supported sources: an npm name");
      expect(error.message, source).toContain("git+file:///<path>");
      expect(error.problems, source).toEqual([
        {
          level: "error",
          file: source,
          message: error.message,
          fix: "Use git+https://, git+ssh://, git+file://, ssh://, user@host:path or github:owner/repo for a Git repository, an https:// URL for a tarball, an npm name, or a local path",
        },
      ]);
    }
  });

  test("hints at the supported transport for the schemes it will not read", () => {
    expect(failure("http://x/f.tgz").message).toContain(
      "Use https:// for a tarball or git+https:// for a Git repository",
    );
    expect(failure("HTTP://x/f.tgz").message).toContain(
      "Use https:// for a tarball or git+https:// for a Git repository",
    );
    expect(failure("git://x/f.git").message).toContain("Use git+https:// or git+ssh://");
    expect(failure("git+http://x/f.git").message).toContain("Use git+https:// or git+ssh://");
  });

  test("reads a one-letter scheme as a Windows drive path with no slash", () => {
    const error = failure("C:fab");

    expect(error.code).toBe("invalid-source");
    expect(error.exitCode).toBe(ExitCode.Failed);
    expect(error.message).toBe(
      'Invalid source "C:fab": unsupported URL scheme "c:". ' +
        "Supported sources: an npm name, github:owner/repo, git+https://, git+ssh://, ssh://, git@host:path, git+file:///<path>, an https:// tarball, or a local path. " +
        "A Windows path needs a slash after the drive, such as C:\\fabs\\acme",
    );
    expect(error.problems).toEqual([
      {
        level: "error",
        file: "C:fab",
        message: error.message,
        fix: "Write the path as C:\\fabs\\acme or C:/fabs/acme",
      },
    ]);
  });
});

describe("gitTransportUrl and importSourceForGitUrl", () => {
  test("changes only the scheme text", () => {
    const forms: Array<[input: string, transport: string, imported: string]> = [
      [
        "git+https://example.com/fab.git",
        "https://example.com/fab.git",
        "git+https://example.com/fab.git",
      ],
      [
        "git+ssh://git@example.com/fab.git",
        "ssh://git@example.com/fab.git",
        "git+ssh://git@example.com/fab.git",
      ],
      [
        "git+file:///srv/fab.git",
        "file:///srv/fab.git",
        "git+file:///srv/fab.git",
      ],
      ["https://example.com/fab.git", "https://example.com/fab.git", "git+https://example.com/fab.git"],
      ["ssh://git@example.com/fab.git", "ssh://git@example.com/fab.git", "ssh://git@example.com/fab.git"],
      ["file:///srv/fab.git", "file:///srv/fab.git", "git+file:///srv/fab.git"],
      // Credentials are neither added nor lost.
      [
        "git+https://user:secret@example.com/Fab.git",
        "https://user:secret@example.com/Fab.git",
        "git+https://user:secret@example.com/Fab.git",
      ],
      // The scp form and the github shorthand have no scheme with `//`.
      ["git@example.com:fab.git", "git@example.com:fab.git", "git@example.com:fab.git"],
      ["github:seasb/fab.git", "github:seasb/fab.git", "github:seasb/fab.git"],
    ];

    for (const [input, transport, imported] of forms) {
      expect(gitTransportUrl(input), input).toBe(transport);
      expect(importSourceForGitUrl(input), input).toBe(imported);
    }
  });

  test("lower-cases the scheme Git compares case-sensitively", () => {
    expect(gitTransportUrl("GIT+HTTPS://Example.com/Fab.git")).toBe(
      "https://Example.com/Fab.git",
    );
    expect(gitTransportUrl("GIT+FILE:///srv/Fab.git")).toBe("file:///srv/Fab.git");
    expect(importSourceForGitUrl("HTTPS://Example.com/Fab.git")).toBe(
      "git+https://Example.com/Fab.git",
    );
  });
});
