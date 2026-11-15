import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import { PUBLISH_RETRY_FIX, prepareFab, publishFab } from "../../../src/core/publish/index.js";
import type { PublishConfig } from "../../../src/core/config/types.js";
import { npmInvocation } from "../../../src/core/sources/npm-cli.js";
import { extractTarball } from "../../../src/core/sources/extract.js";
import { listFiles } from "../../../src/util/fs.js";
import { startRegistry } from "../../helpers/registry/index.js";
import type { Registry } from "../../helpers/registry/index.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import { loadRepo, makePublishRepo } from "./fixtures.js";
import { listRemoteRefs, makeBareFabRepo, noIdentityEnv, remoteRef } from "./git-fab-fixture.js";

const execFileAsync = promisify(execFile);

let registry: Registry;
const cleanups: Array<() => Promise<void>> = [];

beforeAll(async () => {
  registry = await startRegistry();
});

afterAll(async () => {
  await registry?.stop();
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function track<T extends { cleanup(): Promise<void> }>(value: T): T {
  cleanups.push(() => value.cleanup());
  return value;
}

function npmPublishSection(name: string, version: string): string {
  return ["publish:", `  name: ${JSON.stringify(name)}`, `  version: ${version}`, ""].join("\n");
}

function bothPublishSection(name: string, url: string, version: string): string {
  return [
    "publish:",
    `  name: ${JSON.stringify(name)}`,
    `  git: ${JSON.stringify(url)}`,
    `  version: ${version}`,
    "",
  ].join("\n");
}

interface Fixture {
  repo: TempRepo;
  publish: PublishConfig;
  prepared: Awaited<ReturnType<typeof prepareFab>>;
}

async function prepare(publishSection: string, files?: RepoFiles): Promise<Fixture> {
  const repo = track(await makePublishRepo({ publish: publishSection, files }));
  const { factory, config } = await loadRepo(repo);
  const prepared = track(await prepareFab(factory, config));
  return { repo, publish: config.publish as PublishConfig, prepared };
}

async function npmViewJson(args: string[]): Promise<unknown> {
  const npm = await npmInvocation({ env: registry.env });
  const { stdout } = await execFileAsync(npm.command, [...npm.args, "view", ...args, "--json"], {
    env: registry.env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  return JSON.parse(stdout) as unknown;
}

async function publishedVersion(name: string, version: string): Promise<string | undefined> {
  const parsed = await npmViewJson([`${name}@${version}`, "version"]);
  return typeof parsed === "string" ? parsed : undefined;
}

async function publishedIntegrity(name: string, version: string): Promise<string | undefined> {
  const parsed = (await npmViewJson([`${name}@${version}`])) as {
    dist?: { integrity?: unknown };
  };
  return typeof parsed.dist?.integrity === "string" ? parsed.dist.integrity : undefined;
}

async function packPublished(name: string, version: string): Promise<string[]> {
  const root = await mkdtemp(path.join(tmpdir(), "metafab-publish-pack-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));

  const npm = await npmInvocation({ env: registry.env });
  await execFileAsync(
    npm.command,
    [
      ...npm.args,
      "pack",
      `${name}@${version}`,
      "--pack-destination",
      root,
      "--ignore-scripts",
      "--json",
    ],
    { env: registry.env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true },
  );

  const tarball = (await readdir(root)).find((entry) => entry.endsWith(".tgz"));
  if (tarball === undefined) throw new Error("npm pack produced no tarball");

  const extracted = path.join(root, "fab");
  await extractTarball(path.join(root, tarball), extracted, { stripPrefix: "package" });
  return listFiles(extracted);
}

/** The paths `npm pack` would put in the tarball of `root`, without publishing. */
async function npmPackPaths(root: string): Promise<string[]> {
  const npm = await npmInvocation({ env: registry.env });
  const { stdout } = await execFileAsync(
    npm.command,
    [...npm.args, "pack", root, "--dry-run", "--json", "--ignore-scripts"],
    { env: registry.env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true },
  );
  const parsed = JSON.parse(stdout) as Array<{ files?: Array<{ path?: unknown }> }>;
  return (parsed[0]?.files ?? [])
    .map((file) => file.path)
    .filter((file): file is string => typeof file === "string")
    .sort();
}

/**
 * An npm registry URL nothing listens on, so `npm view` fails for a reason other
 * than the 404 that means "this version is new". The port is released before it
 * is used, and the retry count is zero so the failure is immediate.
 */
async function unreachableRegistryEnv(): Promise<NodeJS.ProcessEnv> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (address === null || typeof address === "string") throw new Error("cannot allocate a port");

  return {
    ...registry.env,
    npm_config_registry: `http://127.0.0.1:${address.port}/`,
    npm_config_fetch_retries: "0",
  };
}

// A registry publish spawns npm and Git several times over; Windows is slower
// than the 5s default.
describe("the npm target", { timeout: 60_000 }, () => {
  it("publishes the fab and skips it when the registry has identical content", async () => {
    const name = "@seasb/fab-publish-once";
    const fixture = await prepare(npmPublishSection(name, "1.2.0"));
    const output: string[] = [];

    const first = await publishFab(fixture.prepared, fixture.publish, {
      env: registry.env,
      stderr: (text) => output.push(text),
    });

    expect(first.targets).toEqual([
      { target: "npm", status: "published", detail: expect.stringContaining("1.2.0") },
    ]);
    expect(output.join("")).toContain(name);
    expect(await publishedVersion(name, "1.2.0")).toBe("1.2.0");

    const second = await publishFab(fixture.prepared, fixture.publish, {
      env: registry.env,
      stderr: () => undefined,
    });
    expect(second.targets).toEqual([
      { target: "npm", status: "skipped", detail: expect.stringContaining("identical") },
    ]);
  });

  it("refuses an existing version with different content and leaves the registry alone", async () => {
    const name = "@seasb/fab-publish-conflict";
    const other = track(
      await makePublishRepo({ files: { ".factory/AGENTS.md": "# another fab\n" } }),
    );
    await registry.publishFab({
      name,
      version: "1.2.0",
      factoryDir: other.path(".factory"),
    });
    const integrity = await publishedIntegrity(name, "1.2.0");

    const fixture = await prepare(npmPublishSection(name, "1.2.0"));
    await expect(
      publishFab(fixture.prepared, fixture.publish, {
        env: registry.env,
        stderr: () => undefined,
      }),
    ).rejects.toMatchObject({ code: "publish-version-exists" });

    expect(await publishedIntegrity(name, "1.2.0")).toBe(integrity);
  });

  it("stages exactly the files npm packs, so both targets carry the same fab", async () => {
    const fixture = await prepare(npmPublishSection("@seasb/fab-packed", "1.2.0"), {
      ".factory/.DS_Store": "ignored by npm\n",
      ".factory/.git/config": "[core]\n",
      ".factory/.gitignore": "ignored by npm\n",
      ".factory/.lock-wscript": "ignored by npm\n",
      ".factory/.npmignore": "ignored by npm\n",
      ".factory/.npmrc": "registry=https://example.invalid/\n",
      ".factory/AGENTS.md.vendor.orig": "ignored by npm\n",
      ".factory/CVS/entries": "ignored by npm\n",
      ".factory/archived-packages/old.md": "ignored by npm\n",
      ".factory/build/config.gypi": "ignored by npm\n",
      ".factory/npm-debug.log": "ignored by npm\n",
      ".factory/skills/git/._SKILL.md": "ignored by npm\n",
      ".factory/skills/git/.wafpickle-9": "ignored by npm\n",
      ".factory/skills/git/notes.swp": "kept: npm only ignores .*.swp\n",
      ".factory/skills/git/.notes.swp": "ignored by npm\n",
      // npm applies these at the package root only, which is the fab root.
      ".factory/node_modules/dep/index.js": "kept by npm\n",
      ".factory/package-lock.json": "kept by npm\n",
    });

    expect(await npmPackPaths(fixture.prepared.root)).toEqual(fixture.prepared.files);
  });

  it("publishes to both targets and keeps package.json out of the Git fab", async () => {
    const name = "@seasb/fab-publish-both";
    const bare = track(await makeBareFabRepo());
    const fixture = await prepare(bothPublishSection(name, bare.repo, "1.2.0"));
    const identity = await noIdentityEnv(registry.env);
    cleanups.push(identity.cleanup);

    const result = await publishFab(fixture.prepared, fixture.publish, {
      env: identity.env,
      stderr: () => undefined,
    });

    expect(result.targets).toEqual([
      { target: "npm", status: "published", detail: expect.stringContaining("1.2.0") },
      { target: "git", status: "published", detail: expect.stringContaining("1.2.0") },
    ]);
    expect(await publishedVersion(name, "1.2.0")).toBe("1.2.0");

    const npmFiles = await packPublished(name, "1.2.0");
    expect(npmFiles).toContain("package.json");
    expect(npmFiles).toContain(".factory/factory.yaml");
    expect(npmFiles).not.toContain(".factory/metafab.yaml");

    expect(await listRemoteRefs(bare.repo)).toContain("refs/tags/v1.2.0");
    const head = await remoteRef(bare.repo, "refs/heads/main");
    expect(head).toBeDefined();
    const gitFiles = await listRemoteTree(bare.repo, head as string);
    expect(gitFiles).toContain(".factory/factory.yaml");
    expect(gitFiles).not.toContain("package.json");
  });

  it("checks every target before publishing anything", async () => {
    const name = "@seasb/fab-publish-blocked";
    const other = track(
      await makePublishRepo({ files: { ".factory/AGENTS.md": "# another fab\n" } }),
    );
    await registry.publishFab({
      name,
      version: "1.2.0",
      factoryDir: other.path(".factory"),
    });

    const bare = track(await makeBareFabRepo());
    const fixture = await prepare(bothPublishSection(name, bare.repo, "1.2.0"));
    const identity = await noIdentityEnv(registry.env);
    cleanups.push(identity.cleanup);

    await expect(
      publishFab(fixture.prepared, fixture.publish, {
        env: identity.env,
        stderr: () => undefined,
      }),
    ).rejects.toMatchObject({ code: "publish-version-exists" });

    expect(await listRemoteRefs(bare.repo)).toEqual([]);
  });

  it("reports a failed npm view as a publish problem with the retry fix", async () => {
    const fixture = await prepare(npmPublishSection("@seasb/fab-unreachable", "1.2.0"));

    const failure = (await publishFab(fixture.prepared, fixture.publish, {
      env: await unreachableRegistryEnv(),
      stderr: () => undefined,
    }).catch((error: unknown) => error)) as MetafabError;

    expect(failure).toBeInstanceOf(MetafabError);
    expect(failure.code).toBe("publish-npm-failed");
    expect(failure.exitCode).toBe(ExitCode.FetchFailed);
    expect(failure.problems).toEqual([
      {
        level: "error",
        file: ".factory/metafab.yaml",
        message: failure.message,
        fix: PUBLISH_RETRY_FIX,
      },
    ]);
  });
});

async function listRemoteTree(repo: string, revision: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["--git-dir", repo, "ls-tree", "-r", "--name-only", revision],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true },
  );
  return stdout.split("\n").filter((line) => line !== "");
}
