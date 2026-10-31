import { afterEach, describe, expect, it } from "vitest";
import type { Problem } from "../../../src/errors.js";
import { runCli } from "../../helpers/runCli.js";
import type { TempRepo } from "../../helpers/makeRepo.js";
import { bothPublishSection, makePublishRepo, withProcessEnv } from "./fixtures.js";
import {
  fileUrl,
  gitPublishSection,
  listRemoteRefs,
  makeBareFabRepo,
  noIdentityEnv,
} from "./git-fab-fixture.js";

interface Cleanable {
  cleanup(): Promise<void>;
}

interface PublishJson {
  ok: boolean;
  command: string;
  exitCode: number;
  version?: string;
  files?: string[];
  size?: number;
  targets?: Array<{ target: string; status: string; detail: string }>;
  problems?: Problem[];
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function track<T extends Cleanable>(value: T): T {
  cleanups.push(() => value.cleanup());
  return value;
}

function trackEnv(value: { env: NodeJS.ProcessEnv; cleanup(): Promise<void> }): NodeJS.ProcessEnv {
  cleanups.push(value.cleanup);
  return value.env;
}

async function build(repo: TempRepo): Promise<void> {
  const result = await runCli(["build"], { cwd: repo.root });
  expect(result.code).toBe(0);
}

function parsed(stdout: string): PublishJson {
  return JSON.parse(stdout) as PublishJson;
}

describe("metafab publish", () => {
  it("refuses a repository without a publish section", async () => {
    const repo = track(await makePublishRepo({ publish: "" }));

    const result = await runCli(["publish", "--json"], { cwd: repo.root });
    const json = parsed(result.stdout);

    expect(result.code).toBe(1);
    expect(json).toMatchObject({ ok: false, command: "publish", exitCode: 1 });
    expect(json.problems?.[0]?.file).toBe(".factory/metafab.yaml");
    expect(json.problems?.[0]?.message).toContain('no "publish" section');
  });

  it("reports an invalid publish section as a configuration problem", async () => {
    const repo = track(
      await makePublishRepo({
        publish: ["publish:", '  name: "@seasb/fab-demo"', "  version: latest", ""].join("\n"),
      }),
    );

    const result = await runCli(["publish", "--json"], { cwd: repo.root });
    const json = parsed(result.stdout);

    expect(result.code).toBe(1);
    expect(json.ok).toBe(false);
    expect(
      json.problems?.some((problem) => problem.message.includes("not a semantic version")),
    ).toBe(true);
  });

  it("stops on check errors before it touches a target", async () => {
    const bare = track(await makeBareFabRepo());
    const repo = track(
      await makePublishRepo({
        publish: gitPublishSection(fileUrl(bare.repo), "1.2.0"),
        files: {
          ".factory/factory.yaml": [
            "format: 1",
            "name: demo",
            "pipeline:",
            "  - missing",
            "",
          ].join("\n"),
        },
      }),
    );

    const result = await runCli(["publish", "--json"], { cwd: repo.root });
    const json = parsed(result.stdout);

    expect(result.code).toBe(1);
    expect(json.ok).toBe(false);
    expect(
      json.problems?.some((problem) => problem.message.includes("unknown workflow")),
    ).toBe(true);
    expect(await listRemoteRefs(bare.repo)).toEqual([]);
  });

  it("publishes nothing and touches no target with --dry-run", async () => {
    const bare = track(await makeBareFabRepo());
    const repo = track(
      await makePublishRepo({ publish: bothPublishSection("@seasb/fab-dry", fileUrl(bare.repo), "1.2.0") }),
    );
    await build(repo);

    const result = await withProcessEnv(
      { npm_config_registry: "http://127.0.0.1:9/", npm_config_cache: repo.path("npm-cache") },
      () => runCli(["publish", "--dry-run", "--json"], { cwd: repo.root }),
    );
    const json = parsed(result.stdout);

    expect(result.code).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.version).toBe("1.2.0");
    expect(json.targets).toEqual([
      { target: "npm", status: "skipped", detail: expect.stringContaining("Dry run") },
      { target: "git", status: "skipped", detail: expect.stringContaining("Dry run") },
    ]);
    expect(json.files).toContain("package.json");
    expect(json.files).toContain(".factory/factory.yaml");
    expect(json.files).not.toContain(".factory/metafab.yaml");
    expect(await listRemoteRefs(bare.repo)).toEqual([]);
  });

  it("emits the publish report as JSON", async () => {
    const bare = track(await makeBareFabRepo());
    const repo = track(
      await makePublishRepo({ publish: gitPublishSection(fileUrl(bare.repo), "1.2.0") }),
    );
    await build(repo);
    const identity = trackEnv(await noIdentityEnv());

    const result = await withProcessEnv(identity, () =>
      runCli(["publish", "--json"], { cwd: repo.root }),
    );
    const json = parsed(result.stdout);

    expect(result.code).toBe(0);
    expect(json).toMatchObject({
      ok: true,
      command: "publish",
      exitCode: 0,
      version: "1.2.0",
      targets: [{ target: "git", status: "published", detail: expect.stringContaining("1.2.0") }],
    });
    expect(json.files).toEqual([...(json.files ?? [])].sort());
    expect(json.files).toContain("README.md");
    expect(json.files).not.toContain("package.json");
    expect(json.size).toBeGreaterThan(0);
    expect(json).not.toHaveProperty("summary");
    expect(result.stderr).toBe("");
  });

  it("prints the fab files, size and targets as human output", async () => {
    const bare = track(await makeBareFabRepo());
    const repo = track(
      await makePublishRepo({ publish: gitPublishSection(fileUrl(bare.repo), "1.2.0") }),
    );
    await build(repo);
    const identity = trackEnv(await noIdentityEnv());

    const result = await withProcessEnv(identity, () =>
      runCli(["publish"], { cwd: repo.root }),
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Files:");
    expect(result.stdout).toContain(".factory/factory.yaml");
    expect(result.stdout).toMatch(/\d+ files?, /);
    expect(result.stdout).toContain("git: published");
    expect(result.stderr).toBe("");
  });
});
