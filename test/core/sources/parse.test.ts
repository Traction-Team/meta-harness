import { homedir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import { parseSource } from "../../../src/core/sources/index.js";

const CWD = path.resolve("/work/repo");

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
});
