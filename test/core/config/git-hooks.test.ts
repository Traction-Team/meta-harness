import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, test } from "vitest";
import {
  createConfig,
  createConfigText,
  parseConfig,
  setGitHooks,
  setGitHooksText,
} from "../../../src/core/config.js";
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

describe("git-hooks parsing", () => {
  test("a missing key gives false and an absent raw value", () => {
    const config = parseConfig("");

    expect(config.gitHooks).toBe(false);
    expect(config.gitHooksRaw).toBeUndefined();
    expect(config.gitHooksPresent).toBe(false);
    expect(config.problems).toEqual([]);
  });

  test.each([
    ["git-hooks: true\n", true],
    ["git-hooks: false\n", false],
  ])("reads %s", (text, value) => {
    const config = parseConfig(text);

    expect(config.gitHooks).toBe(value);
    expect(config.gitHooksRaw).toBe(value);
    expect(config.gitHooksPresent).toBe(true);
    expect(config.problems).toEqual([]);
  });

  test("a string value is a type error and falls back to false", () => {
    const config = parseConfig('git-hooks: "yes"\n');

    expect(config.gitHooks).toBe(false);
    expect(config.gitHooksRaw).toBeUndefined();
    expect(config.gitHooksPresent).toBe(true);
    expect(config.problems).toHaveLength(1);
    expect(config.problems[0]?.level).toBe("error");
    expect(config.problems[0]?.message).toBe(`"git-hooks" must be a boolean.`);
  });

  test("git-hooks is a known top-level key", () => {
    const config = parseConfig("git-hooks: true\n");

    expect(config.problems).toEqual([]);
  });
});

describe("createConfigText with git-hooks", () => {
  test("lists agents, then git-hooks when given", () => {
    expect(createConfigText({ agents: ["claude", "codex"], gitHooks: true })).toBe(
      "agents: [claude, codex]\ngit-hooks: true\n",
    );
    expect(createConfigText({ agents: "all", gitHooks: false })).toBe(
      "agents: all\ngit-hooks: false\n",
    );
  });

  test("omits an unspecified git-hooks", () => {
    const text = createConfigText({ agents: "all" });

    expect(text).toBe("agents: all\n");
    expect(text).not.toContain("git-hooks");
  });

  test("createConfig writes git-hooks for a new file", async () => {
    const repo = await repoWith();

    const created = await createConfig(repo.path(".factory"), {
      agents: ["claude"],
      gitHooks: true,
    });

    expect(created).toBe(true);
    expect(await readFile(repo.path(".factory/metafab.yaml"), "utf8")).toBe(
      "agents: [claude]\ngit-hooks: true\n",
    );
    const config = parseConfig(await readFile(repo.path(".factory/metafab.yaml"), "utf8"));
    expect(config.gitHooks).toBe(true);
    expect(config.gitHooksRaw).toBe(true);
  });
});

describe("setGitHooksText", () => {
  test("appends the key without losing comments or other keys", () => {
    const original = [
      "# team settings",
      "agents: [claude]",
      "",
      "# keep the built-in skill",
      "metafab-skill: true",
      "",
    ].join("\n");

    const written = setGitHooksText(original, true);

    expect(written).toContain("# team settings\n");
    expect(written).toContain("# keep the built-in skill\n");
    expect(written).toContain("agents: [claude]\n");
    expect(written).toContain("metafab-skill: true\n");
    expect(written).toContain("\ngit-hooks: true\n");
    const config = parseConfig(written);
    expect(config.gitHooks).toBe(true);
    expect(config.gitHooksRaw).toBe(true);
  });

  test("replaces an existing value and keeps its comment", () => {
    const original = "agents: all\ngit-hooks: true # pinned by hand\n";

    const written = setGitHooksText(original, false);

    expect(written).toBe("agents: all\ngit-hooks: false # pinned by hand\n");
    expect(parseConfig(written).gitHooks).toBe(false);
  });

  test("replaces a non-boolean value", () => {
    const written = setGitHooksText('git-hooks: "yes"\n', true);

    expect(parseConfig(written).gitHooks).toBe(true);
    expect(parseConfig(written).problems).toEqual([]);
  });

  test("is a no-op when the value already matches", () => {
    const original = "agents: all\ngit-hooks: true\n";

    expect(setGitHooksText(original, true)).toBe(original);
  });

  test("keeps exactly one trailing LF", () => {
    const written = setGitHooksText("", true);

    expect(written).toBe("git-hooks: true\n");
  });
});

describe("setGitHooks", () => {
  test("writes a missing factory file and keeps an existing file's comments", async () => {
    const missing = await repoWith();

    await setGitHooks(missing.path(".factory"), true);

    expect(await readFile(missing.path(".factory/metafab.yaml"), "utf8")).toBe(
      "git-hooks: true\n",
    );

    const existing = await repoWith({
      ".factory/metafab.yaml": "# our factory\nagents: all\n",
    });

    await setGitHooks(existing.path(".factory"), true);

    expect(await readFile(existing.path(".factory/metafab.yaml"), "utf8")).toBe(
      "# our factory\nagents: all\n\ngit-hooks: true\n",
    );
  });
});
