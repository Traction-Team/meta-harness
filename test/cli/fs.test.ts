import { chmod, lstat, readdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { compareTrees, copyTree, isDirectory, listFiles, normalizeProblemPath, pathExists, readdirTyped, toPosixPath } from "../../src/util/fs.js";
import { makeRepo } from "../helpers/makeRepo.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readdir: vi.fn(actual.readdir), lstat: vi.fn(actual.lstat) };
});

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(readdir).mockImplementation(actual.readdir as never);
  vi.mocked(lstat).mockImplementation(actual.lstat as never);
});

/** A directory entry of no type, as DT_UNKNOWN reports it. */
function untypedEntry(name: string): {
  name: string;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
} {
  return {
    name,
    isFile: () => false,
    isDirectory: () => false,
    isSymbolicLink: () => false,
  };
}

describe("readdirTyped", () => {
  test("types an untyped file, directory and link from lstat", async () => {
    const repo = await makeRepo({
      "dir/file.txt": "file",
      "dir/sub/keep.txt": "nested",
      "dir/target.txt": "target",
    });
    await symlink("target.txt", repo.path("dir", "link"));

    try {
      vi.mocked(readdir).mockResolvedValue([
        untypedEntry("file.txt"),
        untypedEntry("sub"),
        untypedEntry("link"),
      ] as never);

      const entries = await readdirTyped(repo.path("dir"));
      const byName = new Map(entries.map((entry) => [entry.name, entry]));

      expect(byName.get("file.txt")?.isFile()).toBe(true);
      expect(byName.get("sub")?.isDirectory()).toBe(true);
      expect(byName.get("link")?.isSymbolicLink()).toBe(true);
    } finally {
      await repo.cleanup();
    }
  });

  test("drops an entry that vanished before the lstat", async () => {
    const repo = await makeRepo({ "kept.txt": "kept" });

    try {
      vi.mocked(readdir).mockResolvedValue([
        untypedEntry("kept.txt"),
        untypedEntry("gone.txt"),
      ] as never);

      const entries = await readdirTyped(repo.root);

      expect(entries.map((entry) => entry.name)).toEqual(["kept.txt"]);
    } finally {
      await repo.cleanup();
    }
  });

  test("rethrows an lstat error other than ENOENT with its code unchanged", async () => {
    const repo = await makeRepo({ "secret.txt": "secret" });

    try {
      vi.mocked(readdir).mockResolvedValue([untypedEntry("secret.txt")] as never);
      const actual = await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
      vi.mocked(lstat).mockImplementation((async (target: string) => {
        if (String(target).endsWith("secret.txt")) {
          throw Object.assign(new Error("EACCES: permission denied, lstat"), { code: "EACCES" });
        }
        return actual.lstat(target);
      }) as never);

      await expect(readdirTyped(repo.root)).rejects.toMatchObject({ code: "EACCES" });
    } finally {
      await repo.cleanup();
    }
  });
});


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

  test("emits forward slashes for nested paths", async () => {
    const repo = await makeRepo({
      "packages/a/src/deep/file.txt": "content",
    });

    try {
      const files = await listFiles(repo.root);
      expect(files).toEqual(["packages/a/src/deep/file.txt"]);
      for (const file of files) expect(file).not.toContain("\\");
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
  test("converts platform separators to forward slashes", () => {
    expect(toPosixPath(path.join("packages", "a", "deep", "file.txt"))).toBe("packages/a/deep/file.txt");
    expect(toPosixPath(path.join("a", "b"))).not.toContain("\\");
  });

  test("normalizes problem paths to repository-relative forward slashes", () => {
    expect(normalizeProblemPath("packages\\a\\deep\\file.ts")).toBe("packages/a/deep/file.ts");
    expect(normalizeProblemPath("./src\\cli.ts")).toBe("src/cli.ts");
    expect(normalizeProblemPath("/repo/packages\\a\\file.ts", "/repo")).toBe("packages/a/file.ts");
    expect(normalizeProblemPath("packages/a/file.ts")).not.toContain("\\");
  });

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
