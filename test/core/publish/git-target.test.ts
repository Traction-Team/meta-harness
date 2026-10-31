import { chmod } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { ExitCode } from "../../../src/errors.js";
import { prepareFab, publishFab } from "../../../src/core/publish/index.js";
import type { PublishConfig } from "../../../src/core/config/types.js";
import { loadRepo, makePublishRepo } from "./fixtures.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import {
  commitMessage,
  gitPublishSection,
  handCommit,
  listRemoteRefs,
  makeBareFabRepo,
  noIdentityEnv,
  remoteRef,
  runGitIn,
  showFile,
  tagMessage,
} from "./git-fab-fixture.js";

interface Cleanable {
  cleanup(): Promise<void>;
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

/** Git settings that store LF and check out CRLF, as a Windows checkout does. */
function withAutocrlf(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.autocrlf",
    GIT_CONFIG_VALUE_0: "true",
  };
}

interface Fixture {
  repo: TempRepo;
  publish: PublishConfig;
  prepared: Awaited<ReturnType<typeof prepareFab>>;
}

async function prepare(
  url: string,
  version: string,
  files?: RepoFiles,
  branch?: string,
): Promise<Fixture> {
  const repo = track(
    await makePublishRepo({
      publish: gitPublishSection(url, version, undefined, branch),
      files,
    }),
  );
  const { factory, config } = await loadRepo(repo);
  const prepared = track(await prepareFab(factory, config));
  return { repo, publish: config.publish as PublishConfig, prepared };
}

async function publish(
  url: string,
  version: string,
  files?: RepoFiles,
  branch?: string,
): Promise<Awaited<ReturnType<typeof publishFab>>> {
  const fixture = await prepare(url, version, files, branch);
  const env = trackEnv(await noIdentityEnv());
  return publishFab(fixture.prepared, fixture.publish, { env, stderr: () => undefined });
}

const VERSION = "1.2.0";

describe("the Git target", () => {
  it("publishes a fab to an empty bare repository", async () => {
    const bare = track(await makeBareFabRepo());

    const result = await publish(bare.repo, VERSION);

    expect(result.version).toBe(VERSION);
    expect(result.targets).toEqual([
      { target: "git", status: "published", detail: expect.stringContaining(VERSION) },
    ]);
    expect(await listRemoteRefs(bare.repo)).toEqual([
      "refs/heads/main",
      "refs/tags/v1.2.0",
    ]);

    const head = await remoteRef(bare.repo, "refs/heads/main");
    expect(head).toBeDefined();
    expect(await commitMessage(bare.repo, head as string)).toBe(`Publish ${VERSION}`);
    expect((await tagMessage(bare.repo, "v1.2.0")).trim()).toBe(`metafab publish ${VERSION}`);

    expect(await showFile(bare.repo, head as string, "README.md")).toBe("# Demo project readme");
    expect(await showFile(bare.repo, head as string, ".factory/factory.yaml")).toContain("name: demo");
    await expect(showFile(bare.repo, head as string, ".factory/metafab.yaml")).rejects.toThrow();
    await expect(showFile(bare.repo, head as string, "package.json")).rejects.toThrow();
  });

  it("uses publish.branch, then the remote default branch", async () => {
    const bare = track(await makeBareFabRepo("trunk"));

    await publish(bare.repo, "1.0.0", undefined, "trunk");
    expect(await listRemoteRefs(bare.repo)).toEqual([
      "refs/heads/trunk",
      "refs/tags/v1.0.0",
    ]);

    await publish(bare.repo, "1.1.0");
    expect(await listRemoteRefs(bare.repo)).toEqual([
      "refs/heads/trunk",
      "refs/tags/v1.0.0",
      "refs/tags/v1.1.0",
    ]);
  });

  it("skips a version whose tag already carries identical content", async () => {
    const bare = track(await makeBareFabRepo());
    await publish(bare.repo, VERSION);
    const head = await remoteRef(bare.repo, "refs/heads/main");

    const result = await publish(bare.repo, VERSION);

    expect(result.targets).toEqual([
      { target: "git", status: "skipped", detail: expect.stringContaining("identical") },
    ]);
    expect(await remoteRef(bare.repo, "refs/heads/main")).toBe(head);
  });

  it("refuses a version whose tag carries different content without changing the repository", async () => {
    const bare = track(await makeBareFabRepo());
    await publish(bare.repo, VERSION);
    const head = await remoteRef(bare.repo, "refs/heads/main");

    await expect(
      publish(bare.repo, VERSION, { ".factory/AGENTS.md": "# something else\n" }),
    ).rejects.toMatchObject({ code: "publish-version-exists" });

    expect(await remoteRef(bare.repo, "refs/heads/main")).toBe(head);
  });

  it("skips a version whose tag differs only by line endings Git normalises", async () => {
    const bare = track(await makeBareFabRepo());
    const files = { ".factory/AGENTS.md": "# Agents\r\n\r\nCRLF.\r\n" };
    const first = await prepare(bare.repo, VERSION, files);
    const env = withAutocrlf(trackEnv(await noIdentityEnv()));

    await publishFab(first.prepared, first.publish, { env, stderr: () => undefined });

    const again = await prepare(bare.repo, VERSION, files);
    const result = await publishFab(again.prepared, again.publish, {
      env,
      stderr: () => undefined,
    });

    expect(result.targets).toEqual([
      { target: "git", status: "skipped", detail: expect.stringContaining("identical") },
    ]);
  });

  it("refuses a version when only a file mode changed", async () => {
    const bare = track(await makeBareFabRepo());
    await publish(bare.repo, VERSION);

    const target = track(
      await makePublishRepo({ publish: gitPublishSection(bare.repo, VERSION) }),
    );
    await chmod(target.path(".factory", "scripts", "release.sh"), 0o644);
    const { factory, config } = await loadRepo(target);
    const prepared = track(await prepareFab(factory, config));
    const env = trackEnv(await noIdentityEnv());

    await expect(
      publishFab(prepared, config.publish as PublishConfig, { env, stderr: () => undefined }),
    ).rejects.toMatchObject({ code: "publish-version-exists" });
  });

  it("refuses to overwrite a hand commit on the fab branch with exit code 5", async () => {
    const bare = track(await makeBareFabRepo());
    await publish(bare.repo, VERSION);
    await handCommit(bare.repo, { ".factory/AGENTS.md": "# edited by hand\n" });

    await expect(publish(bare.repo, "1.3.0")).rejects.toMatchObject({
      exitCode: ExitCode.NotOwned,
    });
    expect(await remoteRef(bare.repo, "refs/tags/v1.3.0")).toBeUndefined();
  });

  it("leaves the project repository untouched", async () => {
    const bare = track(await makeBareFabRepo());
    const fixture = await prepare(bare.repo, VERSION);

    await runGitIn(fixture.repo.root, ["init", "--quiet"]);
    await runGitIn(fixture.repo.root, ["add", "-A"]);
    await runGitIn(fixture.repo.root, ["commit", "--quiet", "-m", "initial"]);

    const statusBefore = await runGitIn(fixture.repo.root, ["status", "--porcelain"]);
    const headBefore = await runGitIn(fixture.repo.root, ["rev-parse", "HEAD"]);

    const env = trackEnv(await noIdentityEnv());
    await publishFab(fixture.prepared, fixture.publish, { env, stderr: () => undefined });

    expect(await runGitIn(fixture.repo.root, ["status", "--porcelain"])).toBe(statusBefore);
    expect(await runGitIn(fixture.repo.root, ["rev-parse", "HEAD"])).toBe(headBefore);
  });
});
