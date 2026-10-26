import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  cacheLayout,
  cacheRoot,
  fabKey,
  getOrCreate,
} from "../../../src/core/sources/index.js";

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "metafab-cache-"));
}

describe("cacheRoot", () => {
  test("defaults to ~/.metafab/cache", () => {
    expect(cacheRoot({})).toBe(path.join(homedir(), ".metafab", "cache"));
  });

  test("uses METAFAB_CACHE when set", () => {
    const root = path.join(tmpdir(), "metafab-cache-override");
    expect(cacheRoot({ METAFAB_CACHE: root })).toBe(path.resolve(root));
    expect(cacheRoot({ METAFAB_CACHE: "   " })).toBe(path.join(homedir(), ".metafab", "cache"));
  });
});

describe("cacheLayout", () => {
  test("builds every cache path", () => {
    const layout = cacheLayout("/cache");

    expect(layout.root).toBe("/cache");
    expect(layout.npmTarball("@seasb/fab-mark4", "1.2.0")).toBe(
      path.join("/cache", "npm", "@seasb", "fab-mark4", "1.2.0.tgz"),
    );
    const mirror = layout.gitMirror("https://github.com/seasb/fab-mark4.git");
    expect(mirror).toBe(path.join("/cache", "git", path.basename(mirror)));
    expect(path.basename(mirror)).toMatch(/^[a-f0-9]{64}$/);
    expect(layout.gitMirror("https://github.com/seasb/fab-mark4.git")).toBe(mirror);
    expect(layout.fabDir("@seasb-fab-mark4-1.2.0")).toBe(
      path.join("/cache", "fabs", "@seasb-fab-mark4-1.2.0"),
    );
    expect(layout.fabFactoryDir("@seasb-fab-mark4-1.2.0")).toBe(
      path.join("/cache", "fabs", "@seasb-fab-mark4-1.2.0", ".factory"),
    );
  });

  test("fabKey makes a single safe path segment", () => {
    expect(fabKey("@seasb/fab-mark4", "1.2.0")).toBe("@seasb-fab-mark4-1.2.0");
    expect(fabKey("github:seasb/fab-mark4", "3f9c2e1")).toBe("github-seasb-fab-mark4-3f9c2e1");
    expect(() => fabKey("..")).toThrow();
    expect(() => fabKey()).toThrow();
  });
});

describe("getOrCreate", () => {
  test("creates a missing entry", async () => {
    const base = await tempDir();
    try {
      const target = path.join(base, "entry");
      const result = await getOrCreate(target, {
        validate: () => readFile(path.join(target, "value"), "utf8"),
        create: async () => {
          await mkdir(target, { recursive: true });
          await writeFile(path.join(target, "value"), "good");
        },
      });

      expect(result).toBe("good");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("deletes a corrupt entry and fetches it once more", async () => {
    const base = await tempDir();
    try {
      const target = path.join(base, "entry");
      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, "value"), "corrupt");

      let validations = 0;
      const result = await getOrCreate(target, {
        validate: async () => {
          validations += 1;
          const value = await readFile(path.join(target, "value"), "utf8");
          if (value !== "good") throw new Error("corrupt entry");
          return value;
        },
        create: async () => {
          await mkdir(target, { recursive: true });
          await writeFile(path.join(target, "value"), "good");
        },
      });

      expect(result).toBe("good");
      expect(validations).toBe(2);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("deletes an entry whose creation fails", async () => {
    const base = await tempDir();
    try {
      const target = path.join(base, "entry");
      await expect(
        getOrCreate(target, {
          validate: () => readFile(path.join(target, "value"), "utf8"),
          create: async () => {
            await mkdir(target, { recursive: true });
            await writeFile(path.join(target, "value"), "partial");
            throw new Error("create failed");
          },
        }),
      ).rejects.toThrow("create failed");

      await expect(readFile(path.join(target, "value"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("deletes an entry that is still invalid after fetching", async () => {
    const base = await tempDir();
    try {
      const target = path.join(base, "entry");
      await expect(
        getOrCreate(target, {
          validate: async () => {
            const value = await readFile(path.join(target, "value"), "utf8");
            if (value !== "good") throw new Error("corrupt entry");
            return value;
          },
          create: async () => {
            await mkdir(target, { recursive: true });
            await writeFile(path.join(target, "value"), "still corrupt");
          },
        }),
      ).rejects.toThrow("corrupt entry");

      await expect(readFile(path.join(target, "value"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
