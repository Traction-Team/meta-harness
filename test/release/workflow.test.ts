import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { beforeAll, describe, expect, test } from "vitest";
import { parse } from "yaml";

/**
 * `.github/workflows/release.yml` is the only thing that publishes, so its
 * guards are checked here: a pushed `v*` tag, the OIDC permission npm trusted
 * publishing exchanges, the tag naming the version in `package.json`, and the
 * full verification run, all before `npm publish`.
 */

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const WORKFLOW = path.join(repoRoot, ".github", "workflows", "release.yml");

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

interface Job {
  permissions?: Record<string, string>;
  steps?: Step[];
}

interface Workflow {
  on?: { push?: { tags?: string[] } };
  permissions?: Record<string, string>;
  jobs?: Record<string, Job>;
}

let source = "";
let workflow: Workflow;

/** The job that publishes, found by the command it runs. */
function publishingJob(): Job {
  for (const job of Object.values(workflow.jobs ?? {})) {
    if ((job.steps ?? []).some((step) => /\bnpm publish\b/.test(step.run ?? ""))) return job;
  }
  throw new Error("release.yml has no step that runs npm publish");
}

function runs(): string[] {
  return (publishingJob().steps ?? []).map((step) => step.run ?? "");
}

function runIndex(pattern: RegExp): number {
  return runs().findIndex((run) => pattern.test(run));
}

beforeAll(async () => {
  source = await readFile(WORKFLOW, "utf8");
  workflow = parse(source) as Workflow;
});

describe("the release workflow", () => {
  test("runs on a pushed v* tag", () => {
    expect(workflow.on?.push?.tags).toEqual(["v*"]);
  });

  test("grants the OIDC token npm trusted publishing exchanges", () => {
    const permissions = { ...workflow.permissions, ...publishingJob().permissions };

    expect(permissions.contents).toBe("read");
    expect(permissions["id-token"]).toBe("write");
  });

  test("fails on a tag that does not name the package version", () => {
    const check = runIndex(/GITHUB_REF_NAME/);

    expect(check).toBeGreaterThanOrEqual(0);
    expect(check).toBeLessThan(runIndex(/npm publish/));
    expect(runs()[check]).toMatch(/package\.json/);
    expect(runs()[check]).toMatch(/exit 1/);
  });

  test("verifies before publishing", () => {
    const verify = runIndex(/npm run verify/);

    expect(verify).toBeGreaterThanOrEqual(0);
    expect(verify).toBeLessThan(runIndex(/npm publish/));
  });

  test("publishes with an npm that can use trusted publishing", () => {
    const upgrade = /npm install --global npm@(\S+)/.exec(runs().find((run) => run.includes("npm install --global npm@")) ?? "");
    const minimum = upgrade === null ? null : semver.minVersion(upgrade[1]!);

    // Trusted publishing needs npm 11.5.1 or later.
    expect(minimum).not.toBeNull();
    expect(semver.gte(minimum!, "11.5.1")).toBe(true);
  });

  test("points setup-node at the npm registry", () => {
    const setup = (publishingJob().steps ?? []).find((step) => step.uses?.startsWith("actions/setup-node"));

    expect(setup).toBeDefined();
    expect(String(setup?.with?.["registry-url"])).toContain("registry.npmjs.org");
  });

  test("publishes without a long-lived npm token", () => {
    expect(source).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/);
  });
});
