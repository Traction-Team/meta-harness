import { rm, writeFile } from "node:fs/promises";
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

  it("reports a path npm never packs as a warning without failing", async () => {
    const bare = track(await makeBareFabRepo());
    const repo = track(
      await makePublishRepo({
        publish: bothPublishSection("@seasb/fab-warn", fileUrl(bare.repo), "1.2.0"),
        files: { ".factory/skills/git/.gitignore": "*.log\n" },
      }),
    );
    await build(repo);

    const result = await runCli(["publish", "--dry-run", "--json"], { cwd: repo.root });
    const json = parsed(result.stdout);

    expect(result.code).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.files).not.toContain(".factory/skills/git/.gitignore");
    expect(json.problems).toEqual([
      expect.objectContaining({
        level: "warning",
        file: ".factory/skills/git/.gitignore",
        message: expect.stringContaining("npm never packs"),
      }),
    ]);

    const human = await runCli(["publish", "--dry-run"], { cwd: repo.root });

    expect(human.code).toBe(0);
    expect(human.stderr).toContain(".factory/skills/git/.gitignore:1: warning:");
  });

  it("never prints a credential from publish.git", async () => {
    const repo = track(
      await makePublishRepo({
        publish: [
          "publish:",
          "  git: https://x-access-token:ghp_topsecret@github.com/acme/fab.git",
          "  version: 1.2.0",
          "",
        ].join("\n"),
      }),
    );
    await rm(repo.path(".factory", "README.md"));
    await build(repo);

    const human = await runCli(["publish", "--dry-run"], { cwd: repo.root });

    expect(human.code).toBe(0);
    expect(human.stdout).toContain("git (https://github.com/acme/fab.git)");
    expect(`${human.stdout}\n${human.stderr}`).not.toContain("ghp_topsecret");
    expect(`${human.stdout}\n${human.stderr}`).not.toContain("x-access-token");

    const json = parsed((await runCli(["publish", "--dry-run", "--json"], { cwd: repo.root })).stdout);

    expect(JSON.stringify(json)).not.toContain("ghp_topsecret");
    expect(JSON.stringify(json)).not.toContain("x-access-token");
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
    expect(json.problems).toEqual([]);
    expect(json).not.toHaveProperty("summary");
    expect(result.stderr).toBe("");
  });

  it("refuses a fab that breaks the fab rules before the dry-run report", async () => {
    const repo = track(
      await makePublishRepo({
        files: { ".factory/scripts/big.bin": new Uint8Array(1024 * 1024 + 1) },
      }),
    );
    await build(repo);

    const result = await runCli(["publish", "--dry-run", "--json"], { cwd: repo.root });
    const json = parsed(result.stdout);

    expect(result.code).toBe(4);
    expect(json).toMatchObject({ ok: false, command: "publish", exitCode: 4 });
    expect(json.files).toBeUndefined();
    expect(json.problems?.map((problem) => problem.file)).toContain(".factory/scripts/big.bin");
  });

  it("includes problems on a failed publish", async () => {
    const bare = track(await makeBareFabRepo());
    const repo = track(
      await makePublishRepo({ publish: gitPublishSection(fileUrl(bare.repo), "1.2.0") }),
    );
    await build(repo);
    const identity = trackEnv(await noIdentityEnv());
    const first = await withProcessEnv(identity, () =>
      runCli(["publish", "--json"], { cwd: repo.root }),
    );
    expect(first.code).toBe(0);

    await writeFile(
      repo.path(".factory", "metafab.yaml"),
      ["metafab-skill: false", gitPublishSection(fileUrl(bare.repo), "1.3.0", undefined, "missing")].join(
        "\n",
      ),
    );
    const failedRun = await withProcessEnv(identity, () =>
      runCli(["publish", "--json"], { cwd: repo.root }),
    );
    const json = parsed(failedRun.stdout);

    expect(failedRun.code).toBe(1);
    expect(json.ok).toBe(false);
    expect(json.problems).toEqual([]);
    expect(json.targets).toEqual([
      { target: "git", status: "failed", detail: expect.stringContaining("missing") },
    ]);
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
