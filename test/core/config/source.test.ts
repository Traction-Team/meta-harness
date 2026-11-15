import { describe, expect, test } from "vitest";
import { classifySource, parseConfig, sourceProblem } from "../../../src/core/config.js";
import { parseSource } from "../../../src/core/sources/index.js";

describe("classifySource", () => {
  test("classifies package names as npm", () => {
    expect(classifySource("@seasb/fab-base")).toBe("npm");
    expect(classifySource("fab-base")).toBe("npm");
  });

  test("never throws for a string that is not a package name or a source", () => {
    // Config validation turns the fallback kind into a problem; throwing here
    // would make `parseConfig` throw instead of returning its problems.
    expect(classifySource("seasb/fab-base")).toBe("npm");
    expect(classifySource("git+ssh://")).toBe("git");
  });

  test("classifies github: as git", () => {
    expect(classifySource("github:seasb/fab-mark4")).toBe("git");
  });

  test("classifies git+ sources as git", () => {
    expect(classifySource("git+https://github.com/seasb/fab-mark4.git")).toBe("git");
    expect(classifySource("git+ssh://git@github.com/seasb/fab-mark4.git")).toBe("git");
    expect(classifySource("git+file:///srv/fab.git")).toBe("git");
  });

  test("classifies a plain https source as an unversioned tarball", () => {
    // The spec's table makes `https://…` an HTTPS tarball; `git+https://` is
    // the Git form. A `.git` suffix does not change that.
    expect(classifySource("https://github.com/seasb/fab-mark4.git")).toBe("unversioned");
  });

  test("classifies ssh and git@ sources as git", () => {
    expect(classifySource("git@github.com:seasb/fab-mark4.git")).toBe("git");
    expect(classifySource("ssh://git@github.com/seasb/fab-mark4.git")).toBe("git");
  });

  test("classifies path-like sources as unversioned", () => {
    expect(classifySource("../platform/.factory")).toBe("unversioned");
    expect(classifySource("./factory")).toBe("unversioned");
    expect(classifySource("/opt/factories/base")).toBe("unversioned");
    expect(classifySource("~/factories/base")).toBe("unversioned");
    expect(classifySource("file:../fab-acme")).toBe("unversioned");
  });

  test("agrees with parseSource on every supported source form", () => {
    const sources = [
      "@seasb/fab-mark4@^1.2.0",
      "github:seasb/fab-mark4#v1.2.0",
      "git+ssh://git@example.com/fab-acme.git",
      "git+https://example.com/fab-acme.git",
      "git+file:///srv/fab-acme.git",
      "https://example.com/fab-acme.git",
      "https://example.com/fab-acme-1.0.0.tgz",
      "../platform/.factory",
      "file:../fab-acme",
      "git@github.com:seasb/fab-mark4.git",
      "ssh://git@github.com/seasb/fab-mark4.git",
    ];
    const kinds = { npm: "npm", git: "git", path: "unversioned", https: "unversioned" } as const;

    for (const source of sources) {
      const spec = parseSource(source, { cwd: process.cwd() });
      expect(classifySource(source), source).toBe(kinds[spec.kind]);
    }
  });

  test("treats an empty source as npm", () => {
    expect(classifySource("")).toBe("npm");
  });

  test("reports the source import would refuse and an unknown key without throwing", () => {
    const config = parseConfig("upstream:\n  source: gitlab.com/o/r\nbogus: true\n");

    expect(config.problems).toHaveLength(2);
    expect(config.problems[0]?.message).toBe('Unknown key "bogus".');
    // `import` refuses this as an npm name, and `check` now says so on the
    // `source` line instead of asking for a version.
    expect(config.problems[1]?.message).toContain('Invalid source "gitlab.com/o/r":');
    for (const problem of config.problems) {
      expect(problem.file).toBe(".factory/metafab.yaml");
      expect(problem.line).toBeGreaterThan(0);
      expect(problem.fix).toBeTruthy();
    }
  });
});

describe("sourceProblem", () => {
  test("returns undefined for every supported form", () => {
    const sources = [
      "@seasb/fab-mark4@^1.2.0",
      "github:seasb/fab-mark4#v1.2.0",
      "git+ssh://git@example.com/fab-acme.git",
      "git+https://example.com/fab-acme.git",
      "git+file:///srv/fab-acme.git",
      "https://example.com/fab-acme-1.0.0.tgz",
      "git@github.com:seasb/fab-mark4.git",
      "ssh://git@github.com/seasb/fab-mark4.git",
      "../platform/.factory",
      "file:../fab-acme",
    ];

    for (const source of sources) {
      expect(sourceProblem(source, process.cwd()), source).toBeUndefined();
    }
  });

  test("returns the message and fix import gives for an unsupported scheme", () => {
    expect(sourceProblem("ftp://x", process.cwd())).toEqual({
      message:
        'Invalid source "ftp://x": unsupported URL scheme "ftp:". ' +
        "Supported sources: an npm name, github:owner/repo, git+https://, git+ssh://, ssh://, git@host:path, git+file:///<path>, an https:// tarball, or a local path",
      fix: "Use git+https://, git+ssh://, git+file://, ssh://, user@host:path or github:owner/repo for a Git repository, an https:// URL for a tarball, an npm name, or a local path",
    });
  });

  test("never throws", () => {
    const sources = [
      "",
      " ",
      "ftp://x",
      "git+file://localhost/",
      "git+file://host/x.git",
      "git+ssh://",
      "not a package",
      "C:fab",
    ];

    for (const source of sources) {
      expect(() => sourceProblem(source, process.cwd()), source).not.toThrow();
    }
  });
});
