import { realpath } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { findFactory, resolveNewFactoryRoot } from "../../src/core/discovery.js";
import { MetafabError } from "../../src/errors.js";
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

  test("falls back to the current directory when git is not a repository", async () => {
    const repo = await makeRepo({ "nested/file.txt": "" });

    try {
      const notARepository = async () => ({
        exitCode: 128,
        stdout: "",
        stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
      });

      expect(await resolveNewFactoryRoot(repo.path("nested"), notARepository)).toBe(repo.path("nested"));
    } finally {
      await repo.cleanup();
    }
  });

  test("rethrows other git failures as a MetafabError", async () => {
    const repo = await makeRepo({ "nested/file.txt": "" });

    try {
      const refused = async () => ({
        exitCode: 128,
        stdout: "",
        stderr: "fatal: detected dubious ownership in repository at '/repo'\n",
      });

      const error = await resolveNewFactoryRoot(repo.path("nested"), refused).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(MetafabError);
      expect((error as MetafabError).code).toBe("git-failed");
      expect((error as MetafabError).message).toContain("dubious ownership");
    } finally {
      await repo.cleanup();
    }
  });

  test("falls back to the current directory when git cannot be spawned", async () => {
    const repo = await makeRepo({ "nested/file.txt": "" });

    try {
      const missingGit = async () => {
        throw new Error("spawn git ENOENT");
      };

      expect(await resolveNewFactoryRoot(repo.path("nested"), missingGit)).toBe(repo.path("nested"));
    } finally {
      await repo.cleanup();
    }
  });
});
