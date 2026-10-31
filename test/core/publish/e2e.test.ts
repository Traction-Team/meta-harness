import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ExitCode } from "../../../src/errors.js";
import type { Problem } from "../../../src/errors.js";
import { prepareFab } from "../../../src/core/publish/index.js";
import type { PreparedFab } from "../../../src/core/publish/index.js";
import { fetchFab, npmInvocation, resolve } from "../../../src/core/sources/index.js";
import { compareTrees } from "../../../src/util/fs.js";
import { runCli } from "../../helpers/runCli.js";
import { startRegistry } from "../../helpers/registry/index.js";
import type { Registry } from "../../helpers/registry/index.js";
import type { TempRepo } from "../../helpers/makeRepo.js";
import { bothPublishSection, loadRepo, makePublishRepo, withProcessEnv } from "./fixtures.js";
import {
  fileUrl,
  handCommit,
  listRemoteRefs,
  makeBareFabRepo,
  noIdentityEnv,
  remoteRef,
  runGitIn,
} from "./git-fab-fixture.js";

interface Cleanable {
  cleanup(): Promise<void>;
}

interface PublishJson {
  ok: boolean;
  command: string;
  exitCode: number;
  version?: string;
  code?: string;
  files?: string[];
  size?: number;
  targets?: Array<{ target: string; status: string; detail: string }>;
  problems?: Problem[];
}

const VERSION = "1.2.0";
const execFileAsync = promisify(execFile);

let registry: Registry;
const cleanups: Array<() => Promise<void>> = [];

beforeAll(async () => {
  registry = await startRegistry();
}, 120_000);

afterAll(async () => {
  await registry?.stop();
});

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

function parsed(stdout: string): PublishJson {
  return JSON.parse(stdout) as PublishJson;
}

/** The registry and Git settings a command reads from the process environment. */
function publishEnvironment(
  identity: NodeJS.ProcessEnv,
  npmCache: string,
): NodeJS.ProcessEnv {
  return {
    npm_config_userconfig: registry.npmrc,
    npm_config_cache: npmCache,
    npm_config_registry: registry.url,
    ...(identity.GIT_CONFIG_GLOBAL === undefined
      ? {}
      : { GIT_CONFIG_GLOBAL: identity.GIT_CONFIG_GLOBAL }),
    ...(identity.GIT_CONFIG_NOSYSTEM === undefined
      ? {}
      : { GIT_CONFIG_NOSYSTEM: identity.GIT_CONFIG_NOSYSTEM }),
  };
}

async function distTags(name: string): Promise<Record<string, string>> {
  const npm = await npmInvocation({ env: registry.env });
  const { stdout } = await execFileAsync(
    npm.command,
    [...npm.args, "view", name, "dist-tags", "--json"],
    { env: registry.env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true },
  );
  return JSON.parse(stdout) as Record<string, string>;
}

function contentDifferences(
  expected: string,
  actual: string,
): Promise<Array<{ path: string; kind: string }>> {
  return compareTrees(expected, actual).then((differences) =>
    differences.filter((difference) => difference.kind !== "mode"),
  );
}

describe("publish end to end", () => {
  it(
    "publishes to a registry and a fab repository, and imports both",
    async () => {
      const name = "@seasb/fab-e2e-import";
      const bare = track(await makeBareFabRepo());
      const repo = track(
        await makePublishRepo({
          publish: bothPublishSection(name, fileUrl(bare.repo), VERSION),
        }),
      );
      const built = await runCli(["build"], { cwd: repo.root });
      expect(built.code).toBe(0);

      const identity = trackEnv(await noIdentityEnv());
      const cache = repo.path("metafab-cache");
      const env = publishEnvironment(identity, repo.path("npm-cache"));
      const staged = track(await prepareFabFor(repo));

      const published = await withProcessEnv(env, () =>
        runCli(["publish", "--tag", "next", "--json"], { cwd: repo.root }),
      );
      const report = parsed(published.stdout);

      expect(published.code).toBe(0);
      expect(report).toMatchObject({
        ok: true,
        command: "publish",
        exitCode: 0,
        version: VERSION,
        targets: [
          { target: "npm", status: "published", detail: expect.stringContaining(VERSION) },
          { target: "git", status: "published", detail: expect.stringContaining(VERSION) },
        ],
      });
      expect(report.files).toContain(".factory/factory.yaml");
      expect(await distTags(name)).toMatchObject({ next: VERSION });

      // Import the npm fab through the sources layer, as `metafab import` will.
      const npmResolved = await resolve(
        { kind: "npm", name },
        { env: registry.env, cache },
      );
      expect(npmResolved).toMatchObject({ kind: "npm", version: VERSION });
      const npmFab = await fetchFab(npmResolved, { env: registry.env, cache });
      expect(npmFab.upstream).toMatchObject({
        kind: "npm",
        source: name,
        version: VERSION,
      });
      expect(await contentDifferences(staged.factoryDir, npmFab.factoryDir)).toEqual([]);

      // Import the Git fab: the tag is the version, and the commit is the tag's commit.
      const head = await remoteRef(bare.repo, "refs/heads/main");
      const tagCommit = await runGitIn(process.cwd(), [
        "--git-dir",
        bare.repo,
        "rev-parse",
        `refs/tags/v${VERSION}^{commit}`,
      ]);
      expect(tagCommit).toBe(head);
      const gitResolved = await resolve(
        { kind: "git", url: bare.repo, source: bare.repo },
        { env: identity, cache },
      );
      expect(gitResolved).toMatchObject({ kind: "git", version: VERSION, commit: tagCommit });
      const gitFab = await fetchFab(gitResolved, { env: identity, cache });
      expect(gitFab.upstream).toMatchObject({
        kind: "git",
        version: VERSION,
        commit: head,
      });
      expect(await contentDifferences(staged.factoryDir, gitFab.factoryDir)).toEqual([]);
    },
    120_000,
  );

  it(
    "refuses a changed fab at a published version",
    async () => {
      const name = "@seasb/fab-e2e-version";
      const bare = track(await makeBareFabRepo());
      const repo = track(
        await makePublishRepo({
          publish: bothPublishSection(name, fileUrl(bare.repo), VERSION),
        }),
      );
      expect((await runCli(["build"], { cwd: repo.root })).code).toBe(0);

      const identity = trackEnv(await noIdentityEnv());
      const env = publishEnvironment(identity, repo.path("npm-cache"));

      const first = await withProcessEnv(env, () =>
        runCli(["publish", "--json"], { cwd: repo.root }),
      );
      expect(first.code).toBe(0);
      const refs = await listRemoteRefs(bare.repo);

      // A change that `check` does not care about, so the refusal is the version.
      await writeFile(repo.path(".factory", "scripts", "release.sh"), "#!/bin/sh\necho changed\n");
      const second = await withProcessEnv(env, () =>
        runCli(["publish", "--json"], { cwd: repo.root }),
      );
      const report = parsed(second.stdout);

      expect(second.code).toBe(1);
      expect(report.ok).toBe(false);
      expect(report.code).toBe("publish-version-exists");
      expect(report.problems?.length).toBeGreaterThan(0);
      expect(await listRemoteRefs(bare.repo)).toEqual(refs);
    },
    120_000,
  );

  it(
    "refuses a fab repository edited outside publish with exit code 5",
    async () => {
      const name = "@seasb/fab-e2e-head";
      const bare = track(await makeBareFabRepo());
      const repo = track(
        await makePublishRepo({
          publish: bothPublishSection(name, fileUrl(bare.repo), VERSION),
        }),
      );
      expect((await runCli(["build"], { cwd: repo.root })).code).toBe(0);

      const identity = trackEnv(await noIdentityEnv());
      const env = publishEnvironment(identity, repo.path("npm-cache"));

      const first = await withProcessEnv(env, () =>
        runCli(["publish", "--json"], { cwd: repo.root }),
      );
      expect(first.code).toBe(0);
      const tags = (await listRemoteRefs(bare.repo)).filter((ref) =>
        ref.startsWith("refs/tags/"),
      );

      await handCommit(bare.repo, { ".factory/AGENTS.md": "# edited by hand\n" });
      await writeFile(
        repo.path(".factory", "metafab.yaml"),
        `metafab-skill: false\n${bothPublishSection(name, fileUrl(bare.repo), "1.3.0")}`,
      );

      const refused = await withProcessEnv(env, () =>
        runCli(["publish", "--json"], { cwd: repo.root }),
      );
      const report = parsed(refused.stdout);

      expect(refused.code).toBe(ExitCode.NotOwned);
      expect(report.ok).toBe(false);
      expect(report.code).toBe("publish-git-not-ours");
      expect(report.problems?.[0]?.fix).toContain("Revert the commits");
      expect(await remoteRef(bare.repo, "refs/tags/v1.3.0")).toBeUndefined();
      expect(
        (await listRemoteRefs(bare.repo)).filter((ref) => ref.startsWith("refs/tags/")),
      ).toEqual(tags);
    },
    120_000,
  );
});

/** The staged fab the published targets must carry, for a content comparison. */
async function prepareFabFor(repo: TempRepo): Promise<PreparedFab> {
  const { factory, config } = await loadRepo(repo);
  return prepareFab(factory, config);
}
