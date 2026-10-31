import { afterEach, describe, expect, test } from "vitest";
import { buildPackageJson, keywordsFor } from "../../../src/core/publish/index.js";
import { MetafabError } from "../../../src/errors.js";
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

describe("keywordsFor", () => {
  test("always includes metafab, deduplicated", () => {
    expect(keywordsFor({ keywords: ["factory", "metafab", "factory", " "] })).toEqual([
      "metafab",
      "factory",
    ]);
    expect(keywordsFor({})).toEqual(["metafab"]);
  });
});

describe("buildPackageJson", () => {
  test("writes the fixed fields and the factory description", async () => {
    const target = await repo();
    const { factory, config } = await loadRepo(target);

    const packageJson = buildPackageJson(factory, config.publish ?? {}, {});

    expect(packageJson).toEqual({
      name: "@seasb/fab-demo",
      version: "1.2.0",
      description: "A demo factory.",
      keywords: ["metafab"],
      files: [".factory", "README.md"],
      metafab: { format: 1 },
    });
    expect("license" in packageJson).toBe(false);
  });

  test("publish.description wins and license appears only when set", async () => {
    const target = await repo({
      publish: [
        "publish:",
        '  name: "@seasb/fab-demo"',
        "  version: 1.2.0",
        "  description: The published description.",
        "  license: MIT",
        "",
      ].join("\n"),
    });
    const { factory, config } = await loadRepo(target);

    const packageJson = buildPackageJson(factory, config.publish ?? {}, {});

    expect(packageJson.description).toBe("The published description.");
    expect(packageJson.license).toBe("MIT");
  });

  test("names the GitHub repository when provenance is available", async () => {
    const target = await repo();
    const { factory, config } = await loadRepo(target);

    const packageJson = buildPackageJson(factory, config.publish ?? {}, {
      GITHUB_ACTIONS: "true",
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://token.example/",
      GITHUB_SERVER_URL: "https://github.example.com/",
      GITHUB_REPOSITORY: "acme/fab-demo",
    });

    expect(packageJson.repository).toBe("https://github.example.com/acme/fab-demo");
  });

  test("defaults the GitHub server when the environment omits it", async () => {
    const target = await repo();
    const { factory, config } = await loadRepo(target);

    const packageJson = buildPackageJson(factory, config.publish ?? {}, {
      GITHUB_ACTIONS: "true",
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://token.example/",
      GITHUB_REPOSITORY: "acme/fab-demo",
    });

    expect(packageJson.repository).toBe("https://github.com/acme/fab-demo");
  });

  test("names the GitLab project when provenance is available", async () => {
    const target = await repo();
    const { factory, config } = await loadRepo(target);

    const packageJson = buildPackageJson(factory, config.publish ?? {}, {
      GITLAB_CI: "true",
      SIGSTORE_ID_TOKEN: "token",
      CI_PROJECT_URL: "https://gitlab.com/acme/fab-demo",
    });

    expect(packageJson.repository).toBe("https://gitlab.com/acme/fab-demo");
  });

  test("writes no repository when CI cannot attest provenance", async () => {
    const target = await repo();
    const { factory, config } = await loadRepo(target);

    const packageJson = buildPackageJson(factory, config.publish ?? {}, {
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "acme/fab-demo",
    });

    expect("repository" in packageJson).toBe(false);
  });

  test("refuses the npm target without a name", async () => {
    const target = await repo({
      publish: ["publish:", "  git: git@github.com:acme/fab-demo.git", "  version: 1.2.0", ""].join(
        "\n",
      ),
    });
    const { factory, config } = await loadRepo(target);

    expect(() => buildPackageJson(factory, config.publish ?? {})).toThrow(MetafabError);
  });
});
