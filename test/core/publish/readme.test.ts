import { rm } from "node:fs/promises";
import { afterEach, describe, expect, test } from "vitest";
import { resolveReadme } from "../../../src/core/publish/index.js";
import { parseSource } from "../../../src/core/sources/index.js";
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

  test("strips credentials from the generated import command", async () => {
    const target = await repo({
      publish: [
        "publish:",
        "  git: https://x-access-token:ghp_secretvalue@github.com/acme/fab-demo.git",
        "  version: 1.2.0",
        "",
      ].join("\n"),
    });
    await rm(target.path(".factory", "README.md"));

    const readme = await resolve(target);

    expect(readme).not.toContain("ghp_secretvalue");
    expect(readme).not.toContain("x-access-token");
    expect(readme).toContain(
      "npx @seasb/metafab import git+https://github.com/acme/fab-demo.git",
    );
  });

  test("does not write credentials from a file URL in publish.git", async () => {
    // A `file:` URL that names an authority is not a path, so its userinfo is
    // a credential and must not reach the published README. The whole userinfo
    // goes: `import` accepts `localhost` after `git+file://` but no host with a
    // username before it, and this line is what a person runs.
    const target = await repo({
      publish: [
        "publish:",
        "  git: file://user:ghp_secret@localhost/srv/fab.git",
        "  version: 1.0.0",
        "",
      ].join("\n"),
    });
    await rm(target.path(".factory", "README.md"));

    const readme = await resolve(target);

    expect(readme).not.toContain("ghp_secret");
    const source = "git+file://localhost/srv/fab.git";
    expect(readme).toContain(`npx @seasb/metafab import ${source}`);
    expect(parseSource(source, { cwd: target.root }).kind).toBe("git");
  });

  test("names the import form of the Git URL in the generated import command", async () => {
    // `import` reads a plain https URL as a tarball, so the README of a fab
    // published to a Git repository must name the `git+` form.
    const cases: Array<[url: string, source: string]> = [
      ["https://example.com/fab.git", "git+https://example.com/fab.git"],
      ["file:///srv/fabs/fab-demo.git", "git+file:///srv/fabs/fab-demo.git"],
      // These already are the form `import` reads.
      ["git+https://example.com/fab.git", "git+https://example.com/fab.git"],
      ["git+ssh://git@example.com/fab.git", "git+ssh://git@example.com/fab.git"],
      ["git@github.com:acme/fab-demo.git", "git@github.com:acme/fab-demo.git"],
    ];

    for (const [url, source] of cases) {
      const target = await repo({
        publish: [
          "publish:",
          `  git: ${JSON.stringify(url)}`,
          "  version: 1.2.0",
          "",
        ].join("\n"),
      });
      await rm(target.path(".factory", "README.md"));

      expect(await resolve(target), url).toContain(
        `npx @seasb/metafab import ${source}`,
      );
    }
  });
});
