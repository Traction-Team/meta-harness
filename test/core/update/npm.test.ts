import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
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
});
