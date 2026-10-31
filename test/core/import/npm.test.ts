import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { pathExists } from "../../../src/util/fs.js";
import { makeRepo, writeRepoFiles } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import { startRegistry } from "../../helpers/registry/index.js";
import type { Registry } from "../../helpers/registry/index.js";
import { runCli } from "../../helpers/runCli.js";
import type { RunCliResult } from "../../helpers/runCli.js";

function skill(name: string, body: string): string {
  return `---\nname: ${name}\ndescription: Use ${name} when the task needs it.\n---\n\n# ${name}\n\n${body}\n`;
}

const FAB: RepoFiles = {
  ".factory/factory.yaml": "format: 1\nname: npm-fab\n",
  ".factory/AGENTS.md": "# npm fab\n",
  ".factory/skills/guide/SKILL.md": skill("guide", "Fab body."),
  ".factory/metafab.yaml": "publish:\n  name: fab-import\n",
  ".factory/README.md": "# Not imported\n",
};

let registry: Registry;
const repos: TempRepo[] = [];
const roots: string[] = [];

beforeAll(async () => {
  registry = await startRegistry();

  const fabRoot = await mkdtemp(path.join(tmpdir(), "metafab-import-npm-fab-"));
  roots.push(fabRoot);
  await writeRepoFiles(fabRoot, FAB);
  await registry.publishFab({
    name: "fab-import",
    version: "1.0.0",
    factoryDir: path.join(fabRoot, ".factory"),
  });
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

function parseJson(result: RunCliResult): Record<string, unknown> {
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

describe("import from npm", () => {
  test("imports a published fab from a local registry", async () => {
    const repo = await makeRepo({}, { git: true });
    repos.push(repo);
    const root = await mkdtemp(path.join(tmpdir(), "metafab-import-npm-"));
    roots.push(root);

    const previous = {
      userconfig: process.env.npm_config_userconfig,
      cache: process.env.npm_config_cache,
      registry: process.env.npm_config_registry,
      metafabCache: process.env.METAFAB_CACHE,
    };
    process.env.npm_config_userconfig = registry.env.npm_config_userconfig;
    process.env.npm_config_cache = registry.env.npm_config_cache;
    process.env.npm_config_registry = registry.env.npm_config_registry;
    process.env.METAFAB_CACHE = path.join(root, "cache");

    let result: RunCliResult;
    try {
      result = await runCli(["import", "fab-import@^1.0.0", "--agents", "claude", "--json"], {
        cwd: repo.root,
      });
    } finally {
      for (const [key, value] of [
        ["npm_config_userconfig", previous.userconfig],
        ["npm_config_cache", previous.cache],
        ["npm_config_registry", previous.registry],
        ["METAFAB_CACHE", previous.metafabCache],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    expect(result.code).toBe(0);
    const payload = parseJson(result);
    expect(payload.upstream).toEqual({
      kind: "npm",
      source: "fab-import",
      requested: "^1.0.0",
      version: "1.0.0",
    });

    expect(await readFile(repo.path(".factory", "factory.yaml"), "utf8")).toBe(
      "format: 1\nname: npm-fab\n",
    );
    expect(await readFile(repo.path(".factory", "skills", "guide", "SKILL.md"), "utf8")).toBe(
      skill("guide", "Fab body."),
    );
    expect(await readFile(repo.path(".factory", "metafab.yaml"), "utf8")).not.toContain(
      "publish:",
    );
    expect(await pathExists(repo.path(".factory", "README.md"))).toBe(false);
    expect(await pathExists(repo.path(".claude", "skills", "guide", "SKILL.md"))).toBe(true);
  });
});
