import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { toLF } from "../../../src/util/text.js";
import { makeRepo, writeRepoFiles } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";
import type { RunCliResult } from "../../helpers/runCli.js";
import { makePublishRepo, withProcessEnv } from "../publish/fixtures.js";
import {
  disableAutoMaintenance,
  fileUrl,
  gitPublishSection,
  makeBareFabRepo,
  noIdentityEnv,
  runGitIn,
} from "../publish/git-fab-fixture.js";
import type { BareFabRepo } from "../publish/git-fab-fixture.js";

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

interface Upstream {
  kind: string;
  source: string;
  requested?: string;
  version?: string;
  commit?: string;
}

interface CommandJson {
  status?: string;
  from?: string;
  to?: string;
  upstream?: Upstream;
}

function parsed(result: RunCliResult): CommandJson {
  return JSON.parse(result.stdout) as CommandJson;
}

const SKILL_V1 = "# Git conventions\n";
const SKILL_V2 = "# Git conventions upstream\n";
const LOCAL_AGENTS = "# Agents\n\nedited locally\n";

function skill(title: string): string {
  return `---\nname: git\ndescription: Git conventions.\n---\n\n${title}`;
}

/** The version tag's commit, the commit `import` records. */
function tagCommit(repo: string, tag: string): Promise<string> {
  return runGitIn(process.cwd(), [
    "--git-dir",
    repo,
    "rev-parse",
    `refs/tags/${tag}^{commit}`,
  ]);
}

/** A publisher repository with `url` as its Git target at `version`. */
async function makePublisher(url: string, version: string, title: string): Promise<TempRepo> {
  const repo = await makePublishRepo({
    publish: gitPublishSection(url, version),
    files: { ".factory/skills/git/SKILL.md": skill(title) },
  });
  track(repo);
  const built = await runCli(["build"], { cwd: repo.root });
  expect(built.code).toBe(0);
  return repo;
}

/** Bumps the publisher to 1.1.0, changing a file other than the local edit. */
async function bumpPublisher(
  repo: TempRepo,
  url: string,
  title: string,
): Promise<void> {
  await writeRepoFiles(repo.root, {
    ".factory/metafab.yaml": ["metafab-skill: false", gitPublishSection(url, "1.1.0")].join("\n"),
    ".factory/skills/git/SKILL.md": skill(title),
  });
}

async function metafabYaml(repo: TempRepo): Promise<string> {
  return readFile(repo.path(".factory", "metafab.yaml"), "utf8");
}

/**
 * Publish 1.0.0, import it as `source`, edit one file locally, publish 1.1.0
 * with a change to another file, then update and diff. The whole run uses no
 * identity and a private cache, so no Git config or earlier download leaks in.
 */
async function roundTrip(options: {
  bare: BareFabRepo;
  gitRepo: string;
  publishUrl: string;
  source: string;
}): Promise<void> {
  const { bare, gitRepo, publishUrl, source } = options;
  const publisher = await makePublisher(publishUrl, "1.0.0", SKILL_V1);
  const project = track(await makeRepo({}, { git: true }));
  const identity = trackEnv(await noIdentityEnv());
  const env = { ...identity, METAFAB_CACHE: path.join(bare.root, "cache") };

  await withProcessEnv(env, async () => {
    const published = await runCli(["publish", "--json"], { cwd: publisher.root });
    expect(published.code).toBe(0);
    const firstCommit = await tagCommit(gitRepo, "v1.0.0");

    const imported = await runCli(
      ["import", source, "--agents", "claude", "--json"],
      { cwd: project.root },
    );
    expect(imported.code).toBe(0);
    expect(parsed(imported).upstream).toEqual({
      kind: "git",
      source,
      requested: "^1.0.0",
      version: "1.0.0",
      commit: firstCommit,
    });
    expect(toLF(await metafabYaml(project))).toContain("version: 1.0.0");

    await writeRepoFiles(project.root, { ".factory/AGENTS.md": LOCAL_AGENTS });

    await bumpPublisher(publisher, publishUrl, SKILL_V2);
    // The installed skills track `.factory/`, and `publish` runs `check`.
    expect((await runCli(["build"], { cwd: publisher.root })).code).toBe(0);
    const republished = await runCli(["publish", "--json"], { cwd: publisher.root });
    expect(republished.code).toBe(0);
    const secondCommit = await tagCommit(gitRepo, "v1.1.0");

    const updated = await runCli(["update", "--json"], { cwd: project.root });
    expect(updated.code).toBe(0);
    expect(parsed(updated)).toMatchObject({ status: "updated", from: "1.0.0", to: "1.1.0" });
    expect(toLF(await readFile(project.path(".factory", "AGENTS.md"), "utf8"))).toBe(
      LOCAL_AGENTS,
    );
    expect(toLF(await readFile(project.path(".factory", "skills", "git", "SKILL.md"), "utf8"))).toBe(
      skill(SKILL_V2),
    );
    const recorded = await metafabYaml(project);
    expect(recorded).toContain("version: 1.1.0");
    expect(recorded).toContain(`commit: ${secondCommit}`);

    const diff = await runCli(["diff"], { cwd: project.root });
    expect(diff.code).toBe(0);
    expect(diff.stdout).toContain("--- a/upstream/AGENTS.md");
    expect(diff.stdout).toContain("+edited locally");

    const again = await runCli(["update", "--json"], { cwd: project.root });
    expect(again.code).toBe(0);
    expect(parsed(again).status).toBe("up-to-date");
  });
}

describe("git+file:// sources", { timeout: 120_000 }, () => {
  test("publishes to a bare repository, imports it and updates it", async () => {
    const bare = track(await makeBareFabRepo());
    await roundTrip({
      bare,
      gitRepo: bare.repo,
      publishUrl: fileUrl(bare.repo),
      source: `git+${pathToFileURL(bare.repo).href}`,
    });
  });

  test("round-trips a repository whose path has a space and a #", async () => {
    const bare = track(await makeBareFabRepo());
    const repo = path.join(bare.root, "fab repo #1", "fab.git");
    await mkdir(path.dirname(repo), { recursive: true });
    await runGitIn(bare.root, ["init", "--quiet", "--bare", "--initial-branch=main", repo]);
    await disableAutoMaintenance(repo);

    const source = `git+${pathToFileURL(repo).href}`;
    expect(source).toContain("%20");
    expect(source).toContain("%23");

    await roundTrip({ bare, gitRepo: repo, publishUrl: pathToFileURL(repo).href, source });
  });

  test("round-trips a repository whose path holds a literal #", async () => {
    // `publish.git` is written with a literal `#`, which Git reads literally in
    // a file path. The generated README encodes it, because a source would read
    // a literal `#` as the ref, and `import` then reads the same repository.
    const bare = track(await makeBareFabRepo());
    const repo = path.join(bare.root, "my#fab", "fab.git");
    await mkdir(path.dirname(repo), { recursive: true });
    await runGitIn(bare.root, ["init", "--quiet", "--bare", "--initial-branch=main", repo]);
    await disableAutoMaintenance(repo);

    const posix = repo.split(path.sep).join("/");
    const publishUrl = posix.startsWith("/") ? `file://${posix}` : `file:///${posix}`;
    const source = `git+${publishUrl.replace("#", "%23")}`;
    expect(source).toContain("my%23fab");

    const publisher = await makePublisher(publishUrl, "1.0.0", SKILL_V1);
    // The generated README is the one that names the import line.
    await rm(publisher.path(".factory", "README.md"));
    const project = track(await makeRepo({}, { git: true }));
    const identity = trackEnv(await noIdentityEnv());
    const env = { ...identity, METAFAB_CACHE: path.join(bare.root, "cache") };

    await withProcessEnv(env, async () => {
      expect((await runCli(["publish", "--json"], { cwd: publisher.root })).code).toBe(0);
      const commit = await tagCommit(repo, "v1.0.0");

      const readme = await runGitIn(process.cwd(), [
        "--git-dir",
        repo,
        "show",
        "v1.0.0:README.md",
      ]);
      expect(readme).toContain(`npx @seasb/metafab import ${source}`);

      const imported = await runCli(["import", source, "--agents", "claude", "--json"], {
        cwd: project.root,
      });
      expect(imported.code).toBe(0);
      expect(parsed(imported).upstream).toEqual({
        kind: "git",
        source,
        requested: "^1.0.0",
        version: "1.0.0",
        commit,
      });

      await bumpPublisher(publisher, publishUrl, SKILL_V2);
      // The installed skills track `.factory/`, and `publish` runs `check`.
      expect((await runCli(["build"], { cwd: publisher.root })).code).toBe(0);
      expect((await runCli(["publish", "--json"], { cwd: publisher.root })).code).toBe(0);

      const updated = await runCli(["update", "--json"], { cwd: project.root });
      expect(updated.code).toBe(0);
      expect(parsed(updated)).toMatchObject({ status: "updated", from: "1.0.0", to: "1.1.0" });
    });
  });

  test.skipIf(process.platform !== "win32")(
    "imports and updates from the Windows drive form",
    async () => {
      const bare = track(await makeBareFabRepo());
      const source = `git+file://${bare.repo}`;
      expect(bare.repo).toMatch(/^[A-Za-z]:\\/);

      const publisher = await makePublisher(pathToFileURL(bare.repo).href, "1.0.0", SKILL_V1);
      const project = track(await makeRepo({}, { git: true }));
      const identity = trackEnv(await noIdentityEnv());
      const env = { ...identity, METAFAB_CACHE: path.join(bare.root, "cache") };

      await withProcessEnv(env, async () => {
        expect((await runCli(["publish", "--json"], { cwd: publisher.root })).code).toBe(0);
        const commit = await tagCommit(bare.repo, "v1.0.0");

        const imported = await runCli(
          ["import", source, "--agents", "claude", "--json"],
          { cwd: project.root },
        );
        expect(imported.code).toBe(0);
        expect(parsed(imported).upstream).toEqual({
          kind: "git",
          source,
          requested: "^1.0.0",
          version: "1.0.0",
          commit,
        });

        const updated = await runCli(["update", "--json"], { cwd: project.root });
        expect(updated.code).toBe(0);
        expect(parsed(updated).status).toBe("up-to-date");
      });
    },
  );
});
