import { describe, expect, test } from "vitest";
import { classifySource } from "../../../src/core/config.js";
import { parseSource } from "../../../src/core/sources/index.js";

describe("classifySource", () => {
  test("classifies package names as npm", () => {
    expect(classifySource("@seasb/fab-base")).toBe("npm");
    expect(classifySource("fab-base")).toBe("npm");
  });

  test("rejects a string that is not a package name or a source", () => {
    expect(() => classifySource("seasb/fab-base")).toThrow();
  });

  test("classifies github: as git", () => {
    expect(classifySource("github:seasb/fab-mark4")).toBe("git");
  });

  test("classifies git+ sources as git", () => {
    expect(classifySource("git+https://github.com/seasb/fab-mark4.git")).toBe("git");
    expect(classifySource("git+ssh://git@github.com/seasb/fab-mark4.git")).toBe("git");
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
});
