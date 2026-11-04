import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { npmInvocation } from "../../../src/core/sources/npm-cli.js";
import { toLF } from "../../../src/util/text.js";
import { makeRepo, writeRepoFiles } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import { startRegistry } from "../../helpers/registry/index.js";
import type { Registry } from "../../helpers/registry/index.js";
import { runCli } from "../../helpers/runCli.js";
import type { RunCliResult } from "../../helpers/runCli.js";
import { parseJson } from "./git-fab.js";

let registry: Registry;
const repos: TempRepo[] = [];
const roots: string[] = [];

beforeAll(async () => {
  registry = await startRegistry();
}, 120_000);

afterAll(async () => {
  await registry?.stop();
});

afterEach(async () => {
  await Promise.all([
    ...repos.splice(0).map((repo) => repo.cleanup()),
    ...roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ]);
});

const ENV_KEYS = [
  "npm_config_userconfig",
  "npm_config_cache",
  "npm_config_registry",
  "METAFAB_CACHE",
] as const;

async function withRegistry<T>(cache: string, fn: () => Promise<T>): Promise<T> {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.npm_config_userconfig = registry.env.npm_config_userconfig;
  process.env.npm_config_cache = registry.env.npm_config_cache;
  process.env.npm_config_registry = registry.env.npm_config_registry;
  process.env.METAFAB_CACHE = cache;
  try {
    return await fn();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const execFileAsync = promisify(execFile);

/**
 * Removes a published version, as a registry owner unpublishing it would, so
 * the recorded base really is gone from the registry this test serves.
 */
async function unpublish(name: string, version: string): Promise<void> {
  const npm = await npmInvocation({ env: registry.env });
  await execFileAsync(
    npm.command,
    [
      ...npm.args,
      "unpublish",
      `${name}@${version}`,
      "--registry",
      registry.url,
      "--userconfig",
      registry.npmrc,
      "--cache",
      registry.cache,
      "--force",
      "--ignore-scripts",
    ],
    {
      cwd: registry.root,
      env: registry.env,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    },
  );
}

/**
 * Runs `fn` with an empty npm cache, so the registry is asked again instead of
 * answering from what `import` left in the shared cache.
 */
async function withEmptyNpmCache<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.npm_config_cache;
  const empty = await mkdtemp(path.join(tmpdir(), "metafab-update-npm-empty-"));
  roots.push(empty);
  process.env.npm_config_cache = empty;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.npm_config_cache;
    else process.env.npm_config_cache = previous;
  }
}

async function fabVersion(files: RepoFiles): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "metafab-update-npm-fab-"));
  roots.push(root);
  await writeRepoFiles(root, files);
  return path.join(root, ".factory");
}

function project(): Promise<TempRepo> {
  return makeRepo({}, { git: true }).then((repo) => {
    repos.push(repo);
    return repo;
  });
}

function parse(result: RunCliResult): Record<string, unknown> {
  return parseJson(result);
}

describe("update from npm", () => {
  test("merges a newer version and warns that it is deprecated", async () => {
    const v1 = await fabVersion({
      ".factory/factory.yaml": "format: 1\nname: npm-update\n",
      ".factory/AGENTS.md": "# Agents 1.0.0\n",
      ".factory/skills/guide/SKILL.md":
        "---\nname: guide\ndescription: Use the guide when the task needs it.\n---\n\n# Guide\n\nv1\n",
    });
    await registry.publishFab({ name: "fab-update", version: "1.0.0", factoryDir: v1 });

    const repo = await project();
    const cache = path.join(repo.root, "cache");
    const imported = await withRegistry(cache, () =>
      runCli(["import", "fab-update@^1.0.0", "--agents", "claude", "--json"], { cwd: repo.root }),
    );
    expect(imported.code).toBe(0);

    const v2 = await fabVersion({
      ".factory/factory.yaml": "format: 1\nname: npm-update\n",
      ".factory/AGENTS.md": "# Agents 1.1.0\n",
      ".factory/skills/guide/SKILL.md":
        "---\nname: guide\ndescription: Use the guide when the task needs it.\n---\n\n# Guide\n\nv2\n",
    });
    await registry.publishFab({
      name: "fab-update",
      version: "1.1.0",
      factoryDir: v2,
      deprecated: "This version has a broken workflow.",
    });

    const result = await withRegistry(cache, () =>
      runCli(["update", "--no-build", "--json"], { cwd: repo.root }),
    );
    expect(result.code).toBe(0);
    const payload = parse(result);
    expect(payload.status).toBe("updated");
    expect(payload.from).toBe("1.0.0");
    expect(payload.to).toBe("1.1.0");
    expect(JSON.stringify(payload.problems)).toContain("This version has a broken workflow.");

    expect(toLF(await readFile(repo.path(".factory", "AGENTS.md"), "utf8"))).toBe("# Agents 1.1.0\n");
    const recorded = await readFile(repo.path(".factory", "metafab.yaml"), "utf8");
    expect(recorded).toContain("version: 1.1.0");
    expect(recorded).toContain("requested: ^1.0.0");

    const human = await withRegistry(cache, () => runCli(["update"], { cwd: repo.root }));
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("Already up to date.");

    // A human-readable run prints the deprecation warning on standard error.
    const second = await project();
    const pinned = await withRegistry(cache, () =>
      runCli(["import", "fab-update@1.0.0", "--agents", "claude", "--json"], { cwd: second.root }),
    );
    expect(pinned.code).toBe(0);
    const warned = await withRegistry(cache, () =>
      runCli(["update", "--to", "^1.0.0", "--no-build"], { cwd: second.root }),
    );
    expect(warned.code).toBe(0);
    expect(warned.stderr).toContain("deprecated");
    expect(warned.stderr).toContain("This version has a broken workflow.");
  }, 120_000);

  test("merges without a base when the recorded version was unpublished", async () => {
    const skill =
      "---\nname: guide\ndescription: Use the guide when the task needs it.\n---\n\n# Guide\n\nv1\n";
    const v1 = await fabVersion({
      ".factory/factory.yaml": "format: 1\nname: npm-unpublished\n",
      ".factory/AGENTS.md": "# Agents 1.0.0\n",
      ".factory/skills/guide/SKILL.md": skill,
    });
    await registry.publishFab({ name: "fab-unpublished", version: "1.0.0", factoryDir: v1 });

    const repo = await project();
    const cache = path.join(repo.root, "cache");
    const imported = await withRegistry(cache, () =>
      runCli(["import", "fab-unpublished@^1.0.0", "--agents", "claude", "--json"], {
        cwd: repo.root,
      }),
    );
    expect(imported.code).toBe(0);

    const v2 = await fabVersion({
      ".factory/factory.yaml": "format: 1\nname: npm-unpublished\n",
      ".factory/AGENTS.md": "# Agents 1.1.0\n",
      ".factory/skills/guide/SKILL.md": skill,
    });
    await registry.publishFab({ name: "fab-unpublished", version: "1.1.0", factoryDir: v2 });
    await unpublish("fab-unpublished", "1.0.0");

    // Both caches are empty, so the base is resolved against the registry as it
    // is now, where the version `import` recorded no longer exists.
    const fresh = path.join(repo.root, "fresh-cache");
    const result = await withRegistry(fresh, () =>
      withEmptyNpmCache(() => runCli(["update", "--no-build", "--json"], { cwd: repo.root })),
    );

    // A file upstream changed and the user did not differs on both sides, and
    // without a base that is a conflict, so the build stops.
    expect(result.code).toBe(1);
    const payload = parse(result);
    expect(payload.status).toBe("updated");
    expect(payload.from).toBe("1.0.0");
    expect(payload.to).toBe("1.1.0");
    expect(payload.conflicts).toEqual(["AGENTS.md"]);
    expect(payload.built).toBe(false);
    expect(
      (payload.notes as string[]).some((note) => note.includes("no longer exists upstream")),
    ).toBe(true);
    expect(toLF(await readFile(repo.path(".factory", "AGENTS.md"), "utf8"))).toContain(
      "<<<<<<< yours",
    );
    expect(await readFile(repo.path(".factory", "metafab.yaml"), "utf8")).toContain(
      "version: 1.1.0",
    );
  }, 120_000);
});
