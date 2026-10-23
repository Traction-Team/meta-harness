import { chmod, writeFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { compareTrees, copyTree, isDirectory, listFiles, pathExists } from "../../src/util/fs.js";
import { makeRepo } from "../helpers/makeRepo.js";

describe("listFiles", () => {
  test("lists nested files with forward-slash relative paths", async () => {
    const repo = await makeRepo({
      "b.txt": "b",
      "a/one.txt": "one",
      "a/deep/two.txt": "two",
    });

    try {
      expect(await listFiles(repo.root)).toEqual(["a/deep/two.txt", "a/one.txt", "b.txt"]);
    } finally {
      await repo.cleanup();
    }
  });

  test("skips ignored paths", async () => {
    const repo = await makeRepo({
      "keep.txt": "keep",
      "node_modules/pkg/index.js": "ignored",
    });

    try {
      const files = await listFiles(repo.root, {
        ignore: (relativePath) => relativePath === "node_modules",
      });
      expect(files).toEqual(["keep.txt"]);
    } finally {
      await repo.cleanup();
    }
  });
});

describe("path helpers", () => {
  test("report missing and existing paths", async () => {
    const repo = await makeRepo({ "dir/file.txt": "content" });

    try {
      expect(await pathExists(repo.path("dir"))).toBe(true);
      expect(await isDirectory(repo.path("dir"))).toBe(true);
      expect(await isDirectory(repo.path("dir/file.txt"))).toBe(false);
      expect(await pathExists(repo.path("missing"))).toBe(false);
    } finally {
      await repo.cleanup();
    }
  });
});

describe("copyTree", () => {
  test("copies content and mode bits", async () => {
    const source = await makeRepo({ "bin/run.sh": "#!/bin/sh\n", "lib/a.txt": "a" });

    try {
      await chmod(source.path("bin/run.sh"), 0o755);
      const destination = await makeRepo();

      try {
        await copyTree(source.root, destination.root);
        expect(await listFiles(destination.root)).toEqual(["bin/run.sh", "lib/a.txt"]);
        if (process.platform !== "win32") {
          expect(await compareTrees(source.root, destination.root)).toEqual([]);
        }
      } finally {
        await destination.cleanup();
      }
    } finally {
      await source.cleanup();
    }
  });
});

describe("compareTrees", () => {
  test("reports missing, extra, changed and different content", async () => {
    const left = await makeRepo({ "same.txt": "same", "changed.txt": "one", "mode.txt": "mode" });
    const right = await makeRepo({ "same.txt": "same", "changed.txt": "two", "extra.txt": "extra" });

    try {
      const differences = await compareTrees(left.root, right.root);
      expect(differences).toContainEqual({ path: "changed.txt", kind: "content" });
      expect(differences).toContainEqual({ path: "extra.txt", kind: "extra" });
      expect(differences).toContainEqual({ path: "mode.txt", kind: "missing" });
      expect(differences.some((difference) => difference.path === "same.txt")).toBe(false);
    } finally {
      await left.cleanup();
      await right.cleanup();
    }
  });

  test.skipIf(process.platform === "win32")("reports a mode difference", async () => {
    const left = await makeRepo({ "run.sh": "#!/bin/sh\n" });
    const right = await makeRepo({ "run.sh": "#!/bin/sh\n" });

    try {
      await chmod(left.path("run.sh"), 0o644);
      await chmod(right.path("run.sh"), 0o755);

      expect(await compareTrees(left.root, right.root)).toEqual([{ path: "run.sh", kind: "mode" }]);
    } finally {
      await left.cleanup();
      await right.cleanup();
    }
  });
});

describe("temporary repos", () => {
  test("writes nested files and can initialise git", async () => {
    const repo = await makeRepo({ "nested/file.txt": "content" }, { git: true });

    try {
      expect(await pathExists(repo.path("nested/file.txt"))).toBe(true);
      expect(await pathExists(repo.path(".git"))).toBe(true);
      await writeFile(repo.path("nested/other.txt"), "other");
      expect(await pathExists(repo.path("nested/other.txt"))).toBe(true);
    } finally {
      await repo.cleanup();
    }
  });
});
