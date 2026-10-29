import { describe, expect, test } from "vitest";
import { redact, stripSourceCredentials } from "../../../src/core/sources/index.js";

describe("redact", () => {
  test("removes userinfo from URLs", () => {
    expect(redact("fatal: unable to access 'https://secret-token@github.com/o/r.git'")).toBe(
      "fatal: unable to access 'https://***@github.com/o/r.git'",
    );
    expect(redact("git+ssh://user:password@example.com/fab.git")).toBe(
      "git+ssh://***@example.com/fab.git",
    );
  });

  test("removes auth settings and headers", () => {
    expect(redact("npm_config__authToken=secret-value")).toContain("npm_config__authToken=***");
    expect(redact("Authorization: Bearer secret-token")).toBe("Authorization: Bearer ***");
  });

  test("strips credentials from a recorded source but keeps a bare SSH user", () => {
    expect(
      stripSourceCredentials("git+https://oauth2:glpat-xxx@gitlab.com/o/r.git"),
    ).toBe("git+https://gitlab.com/o/r.git");
    expect(stripSourceCredentials("git+ssh://git@example.com/fab.git")).toBe(
      "git+ssh://git@example.com/fab.git",
    );
    expect(stripSourceCredentials("ssh://user:password@example.com/fab.git")).toBe(
      "ssh://user@example.com/fab.git",
    );
    expect(
      stripSourceCredentials("https://bucket.example/fab.tgz?X-Amz-Signature=secret"),
    ).toBe("https://bucket.example/fab.tgz");
    expect(stripSourceCredentials("../platform/.factory")).toBe("../platform/.factory");
    expect(stripSourceCredentials("github:seasb/fab-mark4")).toBe("github:seasb/fab-mark4");
  });

  test("removes URL query strings and token fragments", () => {
    expect(redact("GET https://bucket.example/fab.tgz?X-Amz-Signature=secret&X-Amz-Credential=key")).toBe(
      "GET https://bucket.example/fab.tgz?<redacted>",
    );
    expect(redact("https://example.com/page#access_token=secret")).toBe(
      "https://example.com/page#<redacted>",
    );
  });
});
