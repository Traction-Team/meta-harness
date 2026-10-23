import { chmod, readFile, stat } from "node:fs/promises";
import { afterEach, describe, expect, test } from "vitest";
import { MetafabError } from "../../../src/errors.js";
import {
  createConfig,
  createConfigText,
  parseConfig,
  removeUpstream,
  removeUpstreamText,
  setUpstream,
  setUpstreamText,
} from "../../../src/core/config.js";
import type { UpstreamEntry } from "../../../src/core/config.js";
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

const fixture = (name: string): URL => new URL(`../../fixtures/config/${name}`, import.meta.url);

async function fixtureText(name: string): Promise<string> {
  return readFile(fixture(name), "utf8");
}

const npmEntry: UpstreamEntry = {
  kind: "npm",
  source: "@seasb/fab-base",
  requested: "^2.0.0",
  version: "2.1.0",
};

function specWithoutUpstream(specExample: string): string {
  return specExample.slice(0, specExample.indexOf("\n# Written by metafab import."));
}

function expectOneTrailingNewline(text: string): void {
  expect(text.endsWith("\n")).toBe(true);
  expect(text.endsWith("\n\n")).toBe(false);
}

describe("setUpstreamText and removeUpstreamText", () => {
  test("adds the spec example's upstream block byte for byte, then removes it", async () => {
    const specExample = await fixtureText("spec-example.yaml");
    const original = specWithoutUpstream(specExample);

    const written = setUpstreamText(original, npmEntry);

    expect(written).toBe(specExample);
    expect(removeUpstreamText(written)).toBe(original);
  });

  test("preserves comments and key order on other keys", async () => {
    const original = await fixtureText("comments-order.yaml");

    const written = setUpstreamText(original, npmEntry);

    expect(written.startsWith(original.trimEnd())).toBe(true);
    expect(written).toContain("# Factory settings, kept in this order for humans.");
    expect(written).toContain("# Both agent tools share .agents/skills.");
    expect(written.indexOf("metafab-skill:")).toBeLessThan(written.indexOf("agents:"));
    expect(removeUpstreamText(written)).toBe(original);
  });

  test("refreshes an existing upstream comment without duplicating it", async () => {
    const original = await fixtureText("comments-order.yaml");
    const once = setUpstreamText(original, npmEntry);
    const twice = setUpstreamText(once, npmEntry);

    expect(twice).toBe(once);
    expect(twice.match(/Written by metafab import/g)).toHaveLength(1);
    expect(twice.match(/^# Written by metafab import\. Do not edit\.$/gm)).toHaveLength(1);
    expect(removeUpstreamText(twice)).toBe(original);
  });

  test("serializes npm fields only", () => {
    const text = setUpstreamText("", npmEntry);

    expect(text).toBe(
      '# Written by metafab import. Do not edit.\nupstream:\n  source: "@seasb/fab-base"\n  requested: ^2.0.0\n  version: 2.1.0\n',
    );
  });

  test("serializes Git fields with requested and version", () => {
    const entry: UpstreamEntry = {
      kind: "git",
      source: "github:seasb/fab-mark4",
      requested: "^1.2.0",
      version: "1.2.0",
      commit: "3f9c2e1a7b4d0c8e5f6a2b1c9d8e7f6a5b4c3d2e",
    };

    const text = setUpstreamText("agents: all\n", entry);
    const config = parseConfig(text);

    expect(config.upstream).toEqual(entry);
    expect(text).toContain("  requested: ^1.2.0\n");
    expect(text).toContain("  version: 1.2.0\n");
    expect(text).toContain("  commit: 3f9c2e1a7b4d0c8e5f6a2b1c9d8e7f6a5b4c3d2e\n");
  });

  test("serializes Git fields without requested and version", () => {
    const entry: UpstreamEntry = {
      kind: "git",
      source: "git@github.com:seasb/fab-mark4.git",
      commit: "abc123",
    };

    const text = setUpstreamText("", entry);

    expect(text).toBe(
      "# Written by metafab import. Do not edit.\nupstream:\n  source: git@github.com:seasb/fab-mark4.git\n  commit: abc123\n",
    );
    expect(text).not.toContain("requested:");
    expect(text).not.toContain("version:");
  });

  test("serializes unversioned fields only", () => {
    const entry: UpstreamEntry = { kind: "unversioned", source: "../platform/.factory" };
    const text = setUpstreamText("", entry);

    expect(text).toBe(
      "# Written by metafab import. Do not edit.\nupstream:\n  source: ../platform/.factory\n",
    );
    expect(text).not.toContain("requested:");
    expect(text).not.toContain("version:");
    expect(text).not.toContain("commit:");
  });

  test("removing a config without upstream is a no-op", async () => {
    const original = await fixtureText("comments-order.yaml");

    expect(removeUpstreamText(original)).toBe(original);
  });

  test("rejects invalid YAML instead of rewriting it", async () => {
    const original = "agents: [claude\n";

    expect(() => setUpstreamText(original, npmEntry)).toThrow(MetafabError);
    expect(() => removeUpstreamText(original)).toThrow(MetafabError);
  });

  test("every writer ends with exactly one LF", async () => {
    expectOneTrailingNewline(createConfigText({ agents: ["claude", "codex"] }));
    expectOneTrailingNewline(createConfigText({ agents: "all" }));
    expectOneTrailingNewline(setUpstreamText("", npmEntry));
    expectOneTrailingNewline(removeUpstreamText(await fixtureText("spec-example.yaml")));
  });
});

describe("createConfig", () => {
  test("writes agents and creates a missing directory", async () => {
    const repo = await repoWith();

    const created = await createConfig(repo.path(".factory"), { agents: ["claude", "codex"] });

    expect(created).toBe(true);
    expect(await readFile(repo.path(".factory/metafab.yaml"), "utf8")).toBe(
      "agents: [claude, codex]\n",
    );
  });

  test("writes all as a scalar", async () => {
    const repo = await repoWith();

    await createConfig(repo.path(".factory"), { agents: "all" });

    expect(await readFile(repo.path(".factory/metafab.yaml"), "utf8")).toBe("agents: all\n");
  });

  test("leaves an existing file untouched", async () => {
    const original = "agents: [cursor]\n";
    const repo = await repoWith({ ".factory/metafab.yaml": original });

    const created = await createConfig(repo.path(".factory"), { agents: ["claude", "codex"] });

    expect(created).toBe(false);
    expect(await readFile(repo.path(".factory/metafab.yaml"), "utf8")).toBe(original);
  });
});

describe("file writers", () => {
  test("setUpstream and removeUpstream round-trip the spec example", async () => {
    const specExample = await fixtureText("spec-example.yaml");
    const original = specWithoutUpstream(specExample);
    const repo = await repoWith({ ".factory/metafab.yaml": original });

    await setUpstream(repo.path(".factory"), npmEntry);
    expect(await readFile(repo.path(".factory/metafab.yaml"), "utf8")).toBe(specExample);

    await removeUpstream(repo.path(".factory"));
    expect(await readFile(repo.path(".factory/metafab.yaml"), "utf8")).toBe(original);
  });

  test("setUpstream preserves the file's permissions", async () => {
    const repo = await repoWith({ ".factory/metafab.yaml": "agents: all\n" });
    const file = repo.path(".factory/metafab.yaml");
    await chmod(file, 0o600);

    await setUpstream(repo.path(".factory"), npmEntry);

    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  test("setUpstream rejects invalid YAML and leaves the file untouched", async () => {
    const original = "agents: [claude\n";
    const repo = await repoWith({ ".factory/metafab.yaml": original });

    await expect(setUpstream(repo.path(".factory"), npmEntry)).rejects.toThrow(MetafabError);
    expect(await readFile(repo.path(".factory/metafab.yaml"), "utf8")).toBe(original);
  });

  test("removeUpstream is a no-op when the file or key is missing", async () => {
    const repo = await repoWith();

    await removeUpstream(repo.path(".factory"));
    await expect(readFile(repo.path(".factory/metafab.yaml"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });

    const original = "agents: all\n";
    const existing = await repoWith({ ".factory/metafab.yaml": original });
    await removeUpstream(existing.path(".factory"));
    expect(await readFile(existing.path(".factory/metafab.yaml"), "utf8")).toBe(original);
  });
});
