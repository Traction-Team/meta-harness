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
 * full verification run, all before `npm publish`. The verification runs in a
 * job without the OIDC token: with it, npm signs provenance for the tests'
 * own publishes to their local registry, which rejects them.
 */

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const WORKFLOW = path.join(repoRoot, ".github", "workflows", "release.yml");

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

interface Job {
  needs?: string | string[];
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

/** The name of the job with a step whose command matches, such as the one that runs `npm publish`. */
function jobRunning(pattern: RegExp): string {
  for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
    if ((job.steps ?? []).some((step) => pattern.test(step.run ?? ""))) return name;
  }
  throw new Error(`release.yml has no step that runs ${pattern}`);
}

function publishingJob(): Job {
  return workflow.jobs![jobRunning(/\bnpm publish\b/)]!;
}

/** A job's permissions, with the workflow's permissions as the default GitHub applies. */
function permissionsOf(job: Job): Record<string, string> {
  return job.permissions ?? workflow.permissions ?? {};
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
    const permissions = permissionsOf(publishingJob());

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

  test("verifies in a job the publish job waits for", () => {
    const verify = jobRunning(/npm run verify/);
    const needs = [publishingJob().needs ?? []].flat();

    expect(verify).not.toBe(jobRunning(/\bnpm publish\b/));
    expect(needs).toContain(verify);
  });

  test("runs the tests without the OIDC token", () => {
    const verify = workflow.jobs![jobRunning(/npm run verify/)]!;

    expect(permissionsOf(verify)["id-token"]).toBeUndefined();
    expect(workflow.permissions?.["id-token"]).toBeUndefined();
  });

  test("builds without install scripts before publishing", () => {
    const install = runIndex(/^npm ci\b/);
    const build = runIndex(/npm run build/);

    expect(runs()[install]).toMatch(/--ignore-scripts/);
    expect(build).toBeGreaterThan(install);
    expect(build).toBeLessThan(runIndex(/npm publish/));
    expect(runs().some((run) => /npm (run )?test|npm run verify|vitest/.test(run))).toBe(false);
  });

  test("publishes with an npm that can use trusted publishing", () => {
    const upgrade = /npm install --global npm@(\S+)/.exec(runs().find((run) => run.includes("npm install --global npm@")) ?? "");
    const minimum = upgrade === null ? null : semver.minVersion(upgrade[1]!);

    // Trusted publishing needs npm 11.5.1 or later.
    expect(minimum).not.toBeNull();
    expect(semver.gte(minimum!, "11.5.1")).toBe(true);
  });

  test("runs on a Node that can use trusted publishing", () => {
    const setup = (publishingJob().steps ?? []).find((step) => step.uses?.startsWith("actions/setup-node"));
    const declared = String(setup?.with?.["node-version"] ?? "");
    const minimum = semver.minVersion(declared);

    // Trusted publishing needs Node 22.14.0 or later.
    expect(minimum).not.toBeNull();
    expect(semver.gte(minimum!, "22.14.0")).toBe(true);
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
