import { describe, expect, it } from "vitest";
import { provenanceEnabled } from "../../../src/core/publish/index.js";

describe("provenance detection", () => {
  it("is off outside a CI system that issues a token", () => {
    expect(provenanceEnabled({})).toBe(false);
    expect(provenanceEnabled({ CI: "true", GITHUB_ACTIONS: "true" })).toBe(false);
    expect(provenanceEnabled({ GITLAB_CI: "true" })).toBe(false);
  });

  it("is on in GitHub Actions with an OIDC request URL", () => {
    expect(
      provenanceEnabled({
        GITHUB_ACTIONS: "true",
        ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.test/token",
      }),
    ).toBe(true);
  });

  it("is on in GitLab CI with a Sigstore token", () => {
    expect(provenanceEnabled({ GITLAB_CI: "true", SIGSTORE_ID_TOKEN: "token" })).toBe(true);
  });

  it("treats a disabled CI flag as absent", () => {
    expect(
      provenanceEnabled({
        GITHUB_ACTIONS: "false",
        ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.test/token",
      }),
    ).toBe(false);
  });
});
