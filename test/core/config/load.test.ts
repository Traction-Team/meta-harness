import { afterEach, describe, expect, test } from "vitest";
import { TARGETS, loadConfig } from "../../../src/core/config.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";

const repos: TempRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

async function repoWith(files: Record<string, string> = {}): Promise<TempRepo> {
  const repo = await makeRepo(files);
  repos.push(repo);
  return repo;
}

describe("loadConfig", () => {
  test("a missing metafab.yaml is an empty config with defaults", async () => {
    const repo = await repoWith();

    const config = await loadConfig(repo.path(".factory"));

    expect(config.agents).toEqual(TARGETS);
    expect(config.metafabSkill).toBe(true);
    expect(config.problems).toEqual([]);
  });

  test("reads .factory/metafab.yaml below the given factory directory", async () => {
    const repo = await repoWith({ ".factory/metafab.yaml": "agents: []\nmetafab-skill: false\n" });

    const config = await loadConfig(repo.path(".factory"));

    expect(config.agents).toEqual([]);
    expect(config.metafabSkill).toBe(false);
  });

  test("reports invalid YAML without throwing", async () => {
    const repo = await repoWith({ ".factory/metafab.yaml": "agents: [claude\n" });

    const config = await loadConfig(repo.path(".factory"));

    expect(config.problems).toHaveLength(1);
    expect(config.problems[0]?.file).toBe(".factory/metafab.yaml");
    expect(config.agents).toEqual(TARGETS);
  });
});
