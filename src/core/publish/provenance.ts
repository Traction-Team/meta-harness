/**
 * npm can attach provenance only where the CI system hands it an OIDC token:
 * GitHub Actions through `ACTIONS_ID_TOKEN_REQUEST_URL`, GitLab CI through
 * `SIGSTORE_ID_TOKEN`. v1 detects the bundle and never overrides it with a flag
 * (plan 1.011, open question 2).
 */
function enabled(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "false" && normalized !== "0";
}

export function provenanceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (enabled(env.GITHUB_ACTIONS) && enabled(env.ACTIONS_ID_TOKEN_REQUEST_URL)) return true;
  if (enabled(env.GITLAB_CI) && enabled(env.SIGSTORE_ID_TOKEN)) return true;
  return false;
}
