import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { pathExists } from "../../../src/util/fs.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";
import type { RunCliResult } from "../../helpers/runCli.js";
import { createGitFixture } from "../sources/git-fixture.js";
import type { GitFixture } from "../sources/git-fixture.js";

const SOURCE = "github:seasb/fab-mark4";
const SOURCE_URL = "https://github.com/seasb/fab-mark4.git";

let fixture: GitFixture;
const repos: TempRepo[] = [];
const roots: string[] = [];

beforeAll(async () => {
  fixture = await createGitFixture();
}, 60_000);

afterAll(async () => {
  await fixture?.cleanup();
}, 120_000);

afterEach(async () => {
  await Promise.all([
    ...repos.splice(0).map((repo) => repo.cleanup()),
    ...roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ]);
});

function parseJson(result: RunCliResult): Record<string, unknown> {
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

/**
 * A `--json` import from a local bare Git repository. Instead of cloning from
 * GitHub, Git rewrites the URL with `insteadOf`, so the command still resolves,
 * fetches and records a real Git source without a network.
 */
async function importFixture(): Promise<{ result: RunCliResult; repo: TempRepo }> {
  const repo = await makeRepo({}, { git: true });
  repos.push(repo);

  const root = await mkdtemp(path.join(tmpdir(), "metafab-import-git-"));
  roots.push(root);
  const gitconfig = path.join(root, "gitconfig");
  await writeFile(
    gitconfig,
    `[url "file://${fixture.repo}"]\n\tinsteadOf = ${SOURCE_URL}\n`,
  );

  const previous = {
    config: process.env.GIT_CONFIG_GLOBAL,
    cache: process.env.METAFAB_CACHE,
  };
  process.env.GIT_CONFIG_GLOBAL = gitconfig;
  process.env.METAFAB_CACHE = path.join(root, "cache");

  try {
    const result = await runCli(["import", SOURCE, "--agents", "claude", "--json"], {
      cwd: repo.root,
    });
    return { result, repo };
  } finally {
    if (previous.config === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = previous.config;
    if (previous.cache === undefined) delete process.env.METAFAB_CACHE;
    else process.env.METAFAB_CACHE = previous.cache;
  }
}

describe("import from a local Git repository", () => {
  test("copies the fab, records the commit, and never copies the project metafab.yaml", async () => {
    const { result, repo } = await importFixture();

    expect(result.code).toBe(0);
    const payload = parseJson(result);
    expect(payload.upstream).toEqual({
      kind: "git",
      source: "github:seasb/fab-mark4",
      requested: "^2.0.0",
      version: "2.0.0",
      commit: fixture.commits.v200,
    });

    expect(await readFile(repo.path(".factory", "factory.yaml"), "utf8")).toContain("name: sample-fab");
    expect(await readFile(repo.path(".factory", "AGENTS.md"), "utf8")).toBe("# Agents at 1.1.0\n");
    expect(await readFile(repo.path(".factory", "metafab.yaml"), "utf8")).not.toContain(
      "belongs-to-the-project",
    );
    expect(await pathExists(repo.path(".factory", "README.md"))).toBe(false);
    expect(await pathExists(repo.path(".claude", "skills", "metafab", "SKILL.md"))).toBe(true);
  });
});
