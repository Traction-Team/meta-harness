import { rm } from "node:fs/promises";
import { afterEach, describe, expect, test } from "vitest";
import { resolveReadme } from "../../../src/core/publish/index.js";
import { loadRepo, makePublishRepo } from "./fixtures.js";
import type { PublishRepoOptions } from "./fixtures.js";
import type { TempRepo } from "../../helpers/makeRepo.js";

const repos: TempRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

async function repo(options: PublishRepoOptions = {}): Promise<TempRepo> {
  const created = await makePublishRepo(options);
  repos.push(created);
  return created;
}

async function resolve(target: TempRepo): Promise<string> {
  const { factory, config } = await loadRepo(target);
  return resolveReadme(target.root, factory, config.publish ?? {});
}

describe("resolveReadme", () => {
  test("publish.readme wins over .factory/README.md", async () => {
    const target = await repo({
      publish: [
        "publish:",
        '  name: "@seasb/fab-demo"',
        "  version: 1.2.0",
        "  readme: docs/fab-readme.md",
        "",
      ].join("\n"),
      files: { "docs/fab-readme.md": "# The published README\n" },
    });

    expect(await resolve(target)).toBe("# The published README\n");
  });

  test("falls back to .factory/README.md", async () => {
    expect(await resolve(await repo())).toBe("# Demo project readme\n");
  });

  test("generates a README when neither exists", async () => {
    const target = await repo();
    await rm(target.path(".factory", "README.md"));

    const readme = await resolve(target);

    expect(readme).toContain("# demo");
    expect(readme).toContain("A demo factory.");
    expect(readme).toContain("1. `plan`");
    expect(readme).toContain("2. `build` — stop: The lead approves the result");
    expect(readme).toContain("- `plan` — Plan a slice. Use when starting.");
    expect(readme).toContain("- `build` — Build a slice. Use when planning is done.");
    expect(readme).toContain("- `git` — Git conventions.");
    expect(readme).toContain("npx @seasb/metafab import @seasb/fab-demo");
  });

  test("the generated import command uses the Git URL when there is no npm name", async () => {
    const target = await repo({
      publish: [
        "publish:",
        "  git: git@github.com:acme/fab-demo.git",
        "  version: 1.2.0",
        "",
      ].join("\n"),
    });
    await rm(target.path(".factory", "README.md"));

    expect(await resolve(target)).toContain(
      "npx @seasb/metafab import git@github.com:acme/fab-demo.git",
    );
  });
});
