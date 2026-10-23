import { realpath } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { findFactory, resolveNewFactoryRoot } from "../../src/core/discovery.js";
import { MetafabError } from "../../src/errors.js";
import { runGit } from "../../src/util/git.js";
import { makeRepo } from "../helpers/makeRepo.js";

describe("findFactory", () => {
  test("finds the nearest factory in a nested monorepo layout", async () => {
    const repo = await makeRepo({
      ".factory/factory.yaml": "format: 1\n",
      "packages/a/b/index.ts": "",
    });

    try {
      const location = await findFactory(repo.path("packages/a/b"));
      expect(location.root).toBe(repo.root);
      expect(location.factoryDir).toBe(repo.path(".factory"));
    } finally {
      await repo.cleanup();
    }
  });

  test("prefers the nearest factory", async () => {
    const repo = await makeRepo({
      ".factory/factory.yaml": "format: 1\n",
      "inner/.factory/factory.yaml": "format: 1\n",
      "inner/deep/file.txt": "",
    });

    try {
      const location = await findFactory(repo.path("inner/deep"));
      expect(location.root).toBe(repo.path("inner"));
      expect(location.factoryDir).toBe(repo.path("inner/.factory"));
    } finally {
      await repo.cleanup();
    }
  });

  test("fails with exit code 1 and an init fix when no factory exists", async () => {
    const repo = await makeRepo({ "README.md": "" });

    try {
      const error = await findFactory(repo.root).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(MetafabError);
      const failure = error as MetafabError;
      expect(failure.exitCode).toBe(1);
      expect(failure.code).toBe("factory-not-found");
      expect(failure.problems?.[0]?.fix).toBe("Run metafab init");
    } finally {
      await repo.cleanup();
    }
  });
});

describe("resolveNewFactoryRoot", () => {
  test("uses the nearest factory when one exists", async () => {
    const repo = await makeRepo({
      ".factory/factory.yaml": "format: 1\n",
      "nested/file.txt": "",
    });

    try {
      expect(await resolveNewFactoryRoot(repo.path("nested"))).toBe(repo.root);
    } finally {
      await repo.cleanup();
    }
  });

  test("uses the git repository root when there is no factory", async () => {
    const repo = await makeRepo({ "nested/file.txt": "" }, { git: true });

    try {
      expect(await resolveNewFactoryRoot(repo.path("nested"))).toBe(await realpath(repo.root));
    } finally {
      await repo.cleanup();
    }
  });

  test("falls back to the current directory outside git", async () => {
    const repo = await makeRepo({ "nested/file.txt": "" });

    try {
      const insideGit = await runGit(["rev-parse", "--is-inside-work-tree"], { cwd: repo.root });
      if (insideGit.exitCode === 0 && insideGit.stdout.trim() === "true") return;

      expect(await resolveNewFactoryRoot(repo.path("nested"))).toBe(repo.path("nested"));
    } finally {
      await repo.cleanup();
    }
  });
});
