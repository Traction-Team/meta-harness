import { lstat, mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  cacheLayout,
  cacheRoot,
  fabKey,
  getOrCreate,
  sweepStale,
} from "../../../src/core/sources/index.js";
import { pathExists } from "../../../src/util/fs.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, lstat: vi.fn(actual.lstat), rm: vi.fn(actual.rm) };
});

let actualFs: typeof import("node:fs/promises");

beforeAll(async () => {
  actualFs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
});

beforeEach(() => {
  vi.mocked(lstat).mockImplementation(actualFs.lstat as never);
  vi.mocked(rm).mockImplementation(actualFs.rm as never);
});

afterAll(() => {
  vi.mocked(lstat).mockReset();
  vi.mocked(rm).mockReset();
});

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "metafab-cache-"));
}

function tempSiblings(base: string): Promise<string[]> {
  return readdir(base).then((entries) => entries.filter((entry) => /\.(?:tmp|old)-/.test(entry)));
}

/**
 * Reports the `ino` values in turn from `lstat`, so a test can give the entry
 * an identity the filesystem cannot make it produce, such as an inode of 0 or
 * two inodes above `Number.MAX_SAFE_INTEGER`. Everything else is the real stat.
 */
function mockIno(...values: bigint[]): void {
  let call = 0;
  vi.mocked(lstat).mockImplementation((async (target: string, options?: unknown) => {
    const info = await (actualFs.lstat as (
      target: string,
      options?: unknown,
    ) => Promise<{ dev: bigint; ino: bigint; ctimeNs: bigint }>)(target, options);
    const ino = values[Math.min(call, values.length - 1)] as bigint;
    call += 1;
    return { dev: info.dev, ino, ctimeNs: info.ctimeNs };
  }) as never);
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
    // The same repository reached with a token or a signed query is one mirror.
    expect(
      layout.gitMirror("https://oauth2:glpat-xxx@github.com/seasb/fab-mark4.git?token=signed"),
    ).toBe(mirror);
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

  test("fabKey keeps a key of 120 characters unchanged", () => {
    const key = "k".repeat(120);
    expect(fabKey(key)).toBe(key);
  });

  test("fabKey caps a longer key with a digest of the whole key", () => {
    const shared = "a".repeat(80);
    const first = fabKey(`${shared}${"b".repeat(50)}`);
    const second = fabKey(`${shared}${"c".repeat(50)}`);

    expect(first).toHaveLength(113);
    expect(first.startsWith(shared)).toBe(true);
    expect(fabKey(`${shared}${"b".repeat(50)}`)).toBe(first);
    expect(second).not.toBe(first);
  });
});

describe("sweepStale", () => {
  test("removes old temporary siblings and keeps fresh or unrelated entries", async () => {
    const base = await tempDir();
    try {
      const name = "entry";
      const staleTmp = path.join(base, `${name}.tmp-stale`);
      const staleOld = path.join(base, `${name}.old-stale`);
      const freshTmp = path.join(base, `${name}.tmp-fresh`);
      const unrelated = path.join(base, "other.tmp-stale");
      for (const directory of [staleTmp, staleOld, freshTmp, unrelated]) {
        await mkdir(directory, { recursive: true });
      }
      const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await utimes(staleTmp, old, old);
      await utimes(staleOld, old, old);

      await sweepStale(base, name);

      expect(await pathExists(staleTmp)).toBe(false);
      expect(await pathExists(staleOld)).toBe(false);
      expect(await pathExists(freshTmp)).toBe(true);
      expect(await pathExists(unrelated)).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("does nothing when the parent does not exist", async () => {
    const base = await tempDir();
    try {
      await expect(sweepStale(path.join(base, "missing"), "entry")).resolves.toBeUndefined();
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe("getOrCreate", () => {
  test("creates a missing entry in a staging directory and renames it into place", async () => {
    const base = await tempDir();
    try {
      const target = path.join(base, "entry");
      const result = await getOrCreate(target, {
        root: base,
        validate: (dir) => readFile(path.join(dir, "value"), "utf8"),
        create: async (staging) => {
          await mkdir(staging, { recursive: true });
          await writeFile(path.join(staging, "value"), "good");
        },
      });

      expect(result).toBe("good");
      expect(await readFile(path.join(target, "value"), "utf8")).toBe("good");
      expect(await tempSiblings(base)).toEqual([]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("replaces a corrupt entry, validating it once", async () => {
    const base = await tempDir();
    try {
      const target = path.join(base, "entry");
      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, "value"), "corrupt");

      const validated: string[] = [];
      const result = await getOrCreate(target, {
        root: base,
        validate: async (dir) => {
          validated.push(path.basename(dir));
          const value = await readFile(path.join(dir, "value"), "utf8");
          if (value !== "good") throw new Error("corrupt entry");
          return value;
        },
        create: async (staging) => {
          await mkdir(staging, { recursive: true });
          await writeFile(path.join(staging, "value"), "good");
        },
      });

      expect(result).toBe("good");
      // The entry that failed is the one still there, so it is moved aside
      // without a second walk; only the staging entry is validated.
      expect(validated).toEqual(["entry", expect.stringMatching(/^entry\.tmp-/)]);
      expect(await readFile(path.join(target, "value"), "utf8")).toBe("good");
      expect(await tempSiblings(base)).toEqual([]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("validates the entry again when lstat reports inode 0", async () => {
    const base = await tempDir();
    try {
      const target = path.join(base, "entry");
      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, "value"), "corrupt");
      // Some network filesystems report 0, which tells two entries apart from
      // nothing, so the entry has to be walked again before it is moved aside.
      mockIno(0n);

      let validations = 0;
      const result = await getOrCreate(target, {
        root: base,
        validate: async (dir) => {
          validations += 1;
          const value = await readFile(path.join(dir, "value"), "utf8");
          if (value !== "good") throw new Error("corrupt entry");
          return value;
        },
        create: async (staging) => {
          await mkdir(staging, { recursive: true });
          await writeFile(path.join(staging, "value"), "good");
        },
      });

      expect(result).toBe("good");
      // The target, the target again, then the staging entry.
      expect(validations).toBe(3);
      expect(await readFile(path.join(target, "value"), "utf8")).toBe("good");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("validates the entry again when its inode changed above Number.MAX_SAFE_INTEGER", async () => {
    const base = await tempDir();
    try {
      const target = path.join(base, "entry");
      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, "value"), "corrupt");

      const first = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
      const second = first + 1n;
      // One apart, and the same value once read as a number: only a bigint
      // comparison tells them apart.
      expect(Number(first)).toBe(Number(second));
      mockIno(first, second);

      let validations = 0;
      const result = await getOrCreate(target, {
        root: base,
        validate: async (dir) => {
          validations += 1;
          const value = await readFile(path.join(dir, "value"), "utf8");
          if (value !== "good") throw new Error("corrupt entry");
          return value;
        },
        create: async (staging) => {
          await mkdir(staging, { recursive: true });
          await writeFile(path.join(staging, "value"), "good");
        },
      });

      expect(result).toBe("good");
      // The entry changed between the two looks, so it is validated again
      // before it is moved aside: the target, the target again, then staging.
      expect(validations).toBe(3);
      expect(await readFile(path.join(target, "value"), "utf8")).toBe("good");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("creates the entry when it is removed before the first look", async () => {
    const base = await tempDir();
    try {
      const target = path.join(base, "entry");
      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, "value"), "corrupt");
      // Another command discarded the entry just before this one looked.
      await rm(target, { recursive: true, force: true });

      let validations = 0;
      const result = await getOrCreate(target, {
        root: base,
        validate: async (dir) => {
          validations += 1;
          const value = await readFile(path.join(dir, "value"), "utf8");
          if (value !== "good") throw new Error("corrupt entry");
          return value;
        },
        create: async (staging) => {
          await mkdir(staging, { recursive: true });
          await writeFile(path.join(staging, "value"), "good");
        },
      });

      expect(result).toBe("good");
      // Only the staging entry is validated: an absent entry is created, not
      // validated, and its absence is not an error.
      expect(validations).toBe(1);
      expect(await readFile(path.join(target, "value"), "utf8")).toBe("good");
      expect(await tempSiblings(base)).toEqual([]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("a failing create leaves no staging sibling and rethrows its own error", async () => {
    const base = await tempDir();
    try {
      const target = path.join(base, "entry");
      await expect(
        getOrCreate(target, {
          root: base,
          validate: (dir) => readFile(path.join(dir, "value"), "utf8"),
          create: async (staging) => {
            await mkdir(staging, { recursive: true });
            await writeFile(path.join(staging, "value"), "partial");
            throw new Error("create failed");
          },
        }),
      ).rejects.toThrow("create failed");

      expect(await tempSiblings(base)).toEqual([]);
      await expect(readFile(path.join(target, "value"), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("a failing create rethrows its own error even when the cleanup fails", async () => {
    const base = await tempDir();
    try {
      const target = path.join(base, "entry");
      const cleanupError = Object.assign(new Error("EBUSY: resource busy"), { code: "EBUSY" });
      vi.mocked(rm).mockRejectedValue(cleanupError);

      await expect(
        getOrCreate(target, {
          root: base,
          validate: (dir) => readFile(path.join(dir, "value"), "utf8"),
          create: async () => {
            throw new Error("create failed");
          },
        }),
      ).rejects.toThrow("create failed");
    } finally {
      vi.mocked(rm).mockImplementation(actualFs.rm as never);
      await rm(base, { recursive: true, force: true });
    }
  });

  test("two overlapping creates both return the entry and neither deletes the other's", async () => {
    const base = await tempDir();
    try {
      const target = path.join(base, "entry");
      let entered!: () => void;
      const enteredCreate = new Promise<void>((resolve) => {
        entered = resolve;
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });

      let creates = 0;
      const options = {
        root: base,
        validate: (dir: string) => readFile(path.join(dir, "value"), "utf8"),
        create: async (staging: string) => {
          creates += 1;
          if (creates === 1) {
            entered();
            await gate;
          }
          await mkdir(staging, { recursive: true });
          await writeFile(path.join(staging, "value"), "good");
        },
      };

      const first = getOrCreate(target, options);
      await enteredCreate;
      const second = await getOrCreate(target, options);
      (globalThis as any).__id = "first";
      release();
      const firstResult = await first;

      expect(firstResult).toBe("good");
      expect(second).toBe("good");
      expect(await readFile(path.join(target, "value"), "utf8")).toBe("good");
      expect(await tempSiblings(base)).toEqual([]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("keeps the entry another command installed while a bad one was validated", async () => {
    const base = await tempDir();
    try {
      const target = path.join(base, "entry");
      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, "value"), "corrupt");

      // The first command reads the corrupt entry and hangs inside validate.
      // The second replaces the entry while the first is still in there; the
      // first must not delete the good entry it now finds.
      let entered!: () => void;
      const enteredValidate = new Promise<void>((resolve) => {
        entered = resolve;
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let hang = true;
      let creates = 0;

      const options = {
        root: base,
        validate: async (dir: string) => {
          const value = await readFile(path.join(dir, "value"), "utf8");
          if (hang) {
            hang = false;
            entered();
            await gate;
          }
          if (value !== "good") throw new Error("corrupt entry");
          return value;
        },
        create: async (staging: string) => {
          creates += 1;
          await mkdir(staging, { recursive: true });
          await writeFile(path.join(staging, "value"), "good");
        },
      };

      (globalThis as any).__id = "first";
      const first = getOrCreate(target, options);
      await enteredValidate;
      (globalThis as any).__id = "second";
      const second = await getOrCreate(target, options);
      (globalThis as any).__id = "first";
      release();

      expect(await first).toBe("good");
      expect(second).toBe("good");
      expect(creates).toBe(1);
      expect(await readFile(path.join(target, "value"), "utf8")).toBe("good");
      expect(await tempSiblings(base)).toEqual([]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("creates the entry when the corrupt target vanishes while it is validated", async () => {
    const base = await tempDir();
    try {
      const target = path.join(base, "entry");
      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, "value"), "corrupt");

      const result = await getOrCreate(target, {
        root: base,
        validate: async (dir) => {
          const value = await readFile(path.join(dir, "value"), "utf8");
          // Another command moves the bad entry aside while this one is
          // validating it, so the second look finds nothing to move aside.
          if (dir === target) await rm(target, { recursive: true, force: true });
          if (value !== "good") throw new Error("corrupt entry");
          return value;
        },
        create: async (staging) => {
          await mkdir(staging, { recursive: true });
          await writeFile(path.join(staging, "value"), "good");
        },
      });

      expect(result).toBe("good");
      expect(await readFile(path.join(target, "value"), "utf8")).toBe("good");
      expect(await tempSiblings(base)).toEqual([]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("a corrupt staging entry is removed and its own error is rethrown", async () => {
    const base = await tempDir();
    try {
      const target = path.join(base, "entry");
      await expect(
        getOrCreate(target, {
          root: base,
          validate: async (dir) => {
            const value = await readFile(path.join(dir, "value"), "utf8");
            if (value !== "good") throw new Error("corrupt entry");
            return value;
          },
          create: async (staging) => {
            await mkdir(staging, { recursive: true });
            await writeFile(path.join(staging, "value"), "still corrupt");
          },
        }),
      ).rejects.toThrow("corrupt entry");

      expect(await pathExists(target)).toBe(false);
      expect(await tempSiblings(base)).toEqual([]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
