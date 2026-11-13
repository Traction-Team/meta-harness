import { cp, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import {
  fetchFab,
  MAX_FAB_ENTRIES,
  MAX_FAB_TOTAL_SIZE,
  MAX_TARBALL_SIZE,
  parseSource,
  resolve,
} from "../../../src/core/sources/index.js";
import type { Resolved } from "../../../src/core/sources/index.js";
import { fetchRecordedBase } from "../../../src/core/update/fetch.js";
import { pathExists } from "../../../src/util/fs.js";
import { startRegistry } from "../../helpers/registry/index.js";
import type { Registry } from "../../helpers/registry/index.js";

const FIXTURES = fileURLToPath(new URL("../../fixtures/fabs/", import.meta.url));
const VALID_FACTORY = path.join(FIXTURES, "valid-fab", ".factory");

let registry: Registry;
let cache: string;

function npmOptions(
  cacheDirectory: string = cache,
  extraEnv: NodeJS.ProcessEnv = {},
): {
  cache: string;
  env: NodeJS.ProcessEnv;
  registry: string;
} {
  return {
    cache: cacheDirectory,
    env: { ...registry.env, ...extraEnv },
    registry: registry.url,
  };
}

function specFor(source: string): ReturnType<typeof parseSource> {
  return parseSource(source, { cwd: process.cwd() });
}

async function resolveSource(source: string): Promise<Resolved> {
  return resolve(specFor(source), npmOptions());
}

async function fetchSource(
  source: string,
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<Awaited<ReturnType<typeof fetchFab>>> {
  return fetchFab(await resolveSource(source), npmOptions(cache, extraEnv));
}

function tamper(integrity: string): string {
  const separator = integrity.indexOf("-");
  const algorithm = integrity.slice(0, separator);
  const digest = integrity.slice(separator + 1);
  const first = digest.startsWith("A") ? "B" : "A";
  return `${algorithm}-${first}${digest.slice(1)}`;
}

beforeAll(async () => {
  registry = await startRegistry();
  cache = await mkdtemp(path.join(tmpdir(), "metafab-npm-cache-"));

  for (const version of ["1.0.0", "1.2.0", "2.0.0"]) {
    await registry.publishFab({ name: "fab-range", version, factoryDir: VALID_FACTORY });
  }
  await registry.publishFab({
    name: "@scope/fab-scoped",
    version: "1.0.0",
    factoryDir: VALID_FACTORY,
  });
  await registry.publishFab({
    name: "fab-deprecated",
    version: "1.0.0",
    factoryDir: VALID_FACTORY,
    deprecated: "Use fab-range@2 instead",
  });
  await registry.publishFab({
    name: "fab-scripts",
    version: "1.0.0",
    factoryDir: VALID_FACTORY,
    files: [".factory", "install.cjs", "marker.cjs"],
    scripts: {
      preinstall: "node marker.cjs preinstall",
      install: "node install.cjs",
      postinstall: "node marker.cjs postinstall",
      prepare: "node marker.cjs prepare",
      prepack: "node marker.cjs prepack",
      postpack: "node marker.cjs postpack",
    },
    extraFiles: {
      "install.cjs": [
        'const fs = require("node:fs");',
        'const path = require("node:path");',
        'fs.writeFileSync(path.join(__dirname, "script-ran.txt"), "ran");',
        "",
      ].join("\n"),
      "marker.cjs": [
        'const fs = require("node:fs");',
        'const path = require("node:path");',
        'const dir = process.env.METAFAB_TEST_MARKER_DIR;',
        'if (dir) fs.writeFileSync(path.join(dir, `${process.argv[2] ?? "lifecycle"}.txt`), "ran");',
        "",
      ].join("\n"),
    },
  });
  await registry.publishFab({
    name: "fab-oversize-size",
    version: "1.0.0",
    factoryDir: VALID_FACTORY,
  });
  await registry.setDistSizes("fab-oversize-size", {
    unpackedSize: MAX_FAB_TOTAL_SIZE + 1,
  });
  await registry.publishFab({
    name: "fab-oversize-files",
    version: "1.0.0",
    factoryDir: VALID_FACTORY,
  });
  await registry.setDistSizes("fab-oversize-files", { fileCount: MAX_FAB_ENTRIES + 1 });
  await registry.publishFab({
    name: "fab-no-sizes",
    version: "1.0.0",
    factoryDir: VALID_FACTORY,
  });
  await registry.setDistSizes("fab-no-sizes", {
    unpackedSize: undefined,
    fileCount: undefined,
  });
  await registry.publishFab({
    name: "fab-no-format",
    version: "1.0.0",
    factoryDir: VALID_FACTORY,
    metafab: null,
  });
  await registry.publishFab({
    name: "fab-bad-format",
    version: "1.0.0",
    factoryDir: VALID_FACTORY,
    metafab: { format: 2 },
  });
  await registry.publishFab({
    name: "fab-shasum",
    version: "1.0.0",
    factoryDir: VALID_FACTORY,
  });
  await registry.stripIntegrity("fab-shasum");

  // 52 incompressible MiB: more than the old 50 MiB download cap, less than the
  // 64 MiB extracted total. It must be accepted, so the total is what binds.
  const bulkRoot = await mkdtemp(path.join(tmpdir(), "metafab-npm-bulk-"));
  try {
    const bulkFactory = path.join(bulkRoot, ".factory");
    await cp(VALID_FACTORY, bulkFactory, { recursive: true });
    for (let index = 0; index < 52; index += 1) {
      await writeFile(
        path.join(bulkFactory, `bulk-${index}.bin`),
        randomBytes(1024 * 1024),
      );
    }
    await registry.publishFab({
      name: "fab-bulk",
      version: "1.0.0",
      factoryDir: bulkFactory,
    });
  } finally {
    await rm(bulkRoot, { recursive: true, force: true });
  }
}, 120_000);

afterAll(async () => {
  await rm(cache, { recursive: true, force: true });
  await registry?.stop();
}, 120_000);

describe("npm sources", { timeout: 60_000 }, () => {
  test("resolves a range to the highest matching version and fetches it", async () => {
    const resolved = await resolveSource("fab-range@^1.0.0");

    expect(resolved).toMatchObject({
      kind: "npm",
      requested: "^1.0.0",
      version: "1.2.0",
      versioned: true,
    });
    expect(resolved.kind === "npm" ? resolved.integrity : undefined).toMatch(/^sha512-/);

    const fetched = await fetchFab(resolved, npmOptions());

    expect(fetched.upstream).toEqual({
      kind: "npm",
      source: "fab-range",
      requested: "^1.0.0",
      version: "1.2.0",
    });
    expect(fetched.versioned).toBe(true);
    expect(fetched.deprecated).toBeUndefined();
    expect(await pathExists(path.join(fetched.factoryDir, "AGENTS.md"))).toBe(true);
    expect(await pathExists(path.join(fetched.factoryDir, "factory.yaml"))).toBe(true);
    expect(await pathExists(path.join(cache, "npm", "fab-range", "1.2.0.tgz"))).toBe(true);
  });

  test("has no cleanup hook because the factory stays in the cache", async () => {
    const fetched = await fetchSource("fab-range@^1.0.0");

    expect(fetched.cleanup).toBeUndefined();
  });

  test("resolves a source without a range to the latest dist-tag", async () => {
    const resolved = await resolveSource("fab-range");

    expect(resolved).toMatchObject({
      kind: "npm",
      requested: "^2.0.0",
      version: "2.0.0",
    });
  });

  test("records an explicit requested range unchanged", async () => {
    const resolved = await resolveSource("fab-range@1.0.0");

    expect(resolved).toMatchObject({ requested: "1.0.0", version: "1.0.0" });
  });

  test("resolves an --to override", async () => {
    const resolved = await resolve(specFor("fab-range"), { ...npmOptions(), to: "1.0.0" });

    expect(resolved).toMatchObject({ requested: "1.0.0", version: "1.0.0" });
  });

  test("falls back to the registry shasum when integrity is missing", async () => {
    const resolved = await resolveSource("fab-shasum@1.0.0");

    expect(resolved.kind === "npm" ? resolved.integrity : undefined).toMatch(/^sha1-/);
    const fetched = await fetchFab(resolved, npmOptions());
    expect(await pathExists(path.join(fetched.factoryDir, "AGENTS.md"))).toBe(true);
  });

  test("fails with exit 3 when no version matches the range", async () => {
    await expect(resolveSource("fab-range@^9.0.0")).rejects.toMatchObject({
      exitCode: ExitCode.FetchFailed,
      code: "fetch-failed",
    });
  });

  test("fails with exit 3 and the npm message for a missing package", async () => {
    try {
      await resolveSource("fab-does-not-exist");
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      const failure = error as MetafabError;
      expect(failure.exitCode).toBe(ExitCode.FetchFailed);
      expect(failure.message).toContain("fab-does-not-exist");
      expect(failure.message).toContain("404");
      return;
    }
    throw new Error("expected resolution to fail");
  });

  test("rejects a tarball whose integrity does not match", async () => {
    const resolved = await resolveSource("fab-range@1.2.0");
    expect(resolved.kind).toBe("npm");
    const integrity = resolved.kind === "npm" ? resolved.integrity : undefined;
    expect(integrity).toBeDefined();

    const mismatchCache = await mkdtemp(path.join(tmpdir(), "metafab-npm-mismatch-"));
    try {
      const broken = { ...resolved, integrity: tamper(integrity as string) } as Resolved;
      await expect(fetchFab(broken, npmOptions(mismatchCache))).rejects.toMatchObject({
        exitCode: ExitCode.InvalidFab,
        code: "invalid-fab",
      });
    } finally {
      await rm(mismatchCache, { recursive: true, force: true });
    }
  });

  test("reuses the cached tarball and fab without contacting the registry", async () => {
    const resolved = await resolveSource("fab-range@1.2.0");
    const first = await fetchFab(resolved, npmOptions());
    const tarball = path.join(cache, "npm", "fab-range", "1.2.0.tgz");
    const before = await stat(tarball);

    const deadRegistry = {
      cache,
      env: { ...registry.env, npm_config_registry: "http://127.0.0.1:1/" },
      registry: "http://127.0.0.1:1/",
    };
    const second = await fetchFab(resolved, deadRegistry);

    expect(second.factoryDir).toBe(first.factoryDir);
    expect((await stat(tarball)).mtimeMs).toBe(before.mtimeMs);
  });

  test("resolves and fetches a scoped package", async () => {
    const fetched = await fetchSource("@scope/fab-scoped@^1.0.0");

    expect(fetched.upstream).toEqual({
      kind: "npm",
      source: "@scope/fab-scoped",
      requested: "^1.0.0",
      version: "1.0.0",
    });
    expect(await pathExists(path.join(cache, "npm", "@scope", "fab-scoped", "1.0.0.tgz"))).toBe(
      true,
    );
  });

  test("reports the npm deprecation message", async () => {
    const resolved = await resolveSource("fab-deprecated@1.0.0");
    const fetched = await fetchFab(resolved, npmOptions());

    expect(resolved.kind === "npm" ? resolved.deprecated : undefined).toBe(
      "Use fab-range@2 instead",
    );
    expect(fetched.deprecated).toBe("Use fab-range@2 instead");
  });

  test("does not run install scripts from a package", async () => {
    const markers = await mkdtemp(path.join(tmpdir(), "metafab-scripts-"));
    try {
      const fetched = await fetchSource("fab-scripts@1.0.0", {
        METAFAB_TEST_MARKER_DIR: markers,
      });

      expect(await pathExists(path.join(fetched.factoryDir, "install.cjs"))).toBe(false);
      expect(await pathExists(path.join(path.dirname(fetched.factoryDir), "install.cjs"))).toBe(
        true,
      );
      expect(await pathExists(path.join(fetched.factoryDir, "script-ran.txt"))).toBe(false);
      expect(await pathExists(path.join(path.dirname(fetched.factoryDir), "script-ran.txt"))).toBe(
        false,
      );
      // preinstall, postinstall, prepare, prepack and postpack each write a marker.
      expect(await readdir(markers)).toEqual([]);
    } finally {
      await rm(markers, { recursive: true, force: true });
    }
  });

  test("fails with exit 4 when metafab.format is missing", async () => {
    await expect(fetchSource("fab-no-format@1.0.0")).rejects.toMatchObject({
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
    });
  });

  test("rejects an npm tarball larger than the compressed size cap", async () => {
    const resolved = await resolveSource("fab-range@1.2.0");
    const smallCache = await mkdtemp(path.join(tmpdir(), "metafab-npm-large-"));
    try {
      await expect(
        fetchFab(resolved, { ...npmOptions(smallCache), maxTarballSize: 128 }),
      ).rejects.toMatchObject({
        exitCode: ExitCode.InvalidFab,
        code: "invalid-fab",
      });
    } finally {
      await rm(smallCache, { recursive: true, force: true });
    }
  });

  test("refuses a package whose metadata reports more unpacked bytes than the fab limit", async () => {
    const resolved = await resolveSource("fab-oversize-size@1.0.0");
    expect(resolved.kind === "npm" ? resolved.unpackedSize : undefined).toBe(
      MAX_FAB_TOTAL_SIZE + 1,
    );

    const smallCache = await mkdtemp(path.join(tmpdir(), "metafab-npm-oversize-"));
    try {
      await expect(fetchFab(resolved, npmOptions(smallCache))).rejects.toMatchObject({
        exitCode: ExitCode.InvalidFab,
        code: "invalid-fab",
        message: expect.stringContaining(
          `it unpacks to ${MAX_FAB_TOTAL_SIZE + 1} bytes, more than the ${MAX_FAB_TOTAL_SIZE}-byte fab limit`,
        ),
      });
      expect(
        await pathExists(path.join(smallCache, "npm", "fab-oversize-size", "1.0.0.tgz")),
      ).toBe(false);
    } finally {
      await rm(smallCache, { recursive: true, force: true });
    }
  });

  test("refuses a package whose metadata reports more files than the fab limit", async () => {
    const resolved = await resolveSource("fab-oversize-files@1.0.0");
    expect(resolved.kind === "npm" ? resolved.fileCount : undefined).toBe(MAX_FAB_ENTRIES + 1);

    const smallCache = await mkdtemp(path.join(tmpdir(), "metafab-npm-many-files-"));
    try {
      await expect(fetchFab(resolved, npmOptions(smallCache))).rejects.toMatchObject({
        exitCode: ExitCode.InvalidFab,
        code: "invalid-fab",
        message: expect.stringContaining(
          `it has ${MAX_FAB_ENTRIES + 1} files, more than the ${MAX_FAB_ENTRIES}-file fab limit`,
        ),
      });
      expect(
        await pathExists(path.join(smallCache, "npm", "fab-oversize-files", "1.0.0.tgz")),
      ).toBe(false);
    } finally {
      await rm(smallCache, { recursive: true, force: true });
    }
  });

  test("fetches a package whose metadata reports no unpacked size or file count", async () => {
    const resolved = await resolveSource("fab-no-sizes@1.0.0");
    expect(resolved.kind === "npm" ? resolved.unpackedSize : undefined).toBeUndefined();
    expect(resolved.kind === "npm" ? resolved.fileCount : undefined).toBeUndefined();

    const fetched = await fetchFab(resolved, npmOptions());
    expect(await pathExists(path.join(fetched.factoryDir, "AGENTS.md"))).toBe(true);
  });

  test("skips the metadata size check for a recorded base but not for a new source", async () => {
    const recordedCache = await mkdtemp(path.join(tmpdir(), "metafab-npm-recorded-"));
    const freshCache = await mkdtemp(path.join(tmpdir(), "metafab-npm-fresh-"));
    try {
      const base = await fetchRecordedBase(
        { kind: "npm", source: "fab-oversize-size", requested: "^1.0.0", version: "1.0.0" },
        { cwd: process.cwd(), ...npmOptions(recordedCache) },
      );
      expect(await pathExists(path.join(base.factoryDir, "AGENTS.md"))).toBe(true);
      expect(
        await pathExists(path.join(recordedCache, "npm", "fab-oversize-size", "1.0.0.tgz")),
      ).toBe(true);

      const resolved = await resolve(
        specFor("fab-oversize-size@1.0.0"),
        npmOptions(freshCache),
      );
      await expect(fetchFab(resolved, npmOptions(freshCache))).rejects.toMatchObject({
        exitCode: ExitCode.InvalidFab,
        code: "invalid-fab",
      });
      expect(
        await pathExists(path.join(freshCache, "npm", "fab-oversize-size", "1.0.0.tgz")),
      ).toBe(false);
    } finally {
      await rm(recordedCache, { recursive: true, force: true });
      await rm(freshCache, { recursive: true, force: true });
    }
  });

  test("keeps the download cap larger than the extracted total the spec allows", () => {
    expect(MAX_TARBALL_SIZE).toBeGreaterThan(MAX_FAB_TOTAL_SIZE);
  });

  test("accepts a fab bigger than 50 MiB compressed when its total is within the cap", async () => {
    const fetched = await fetchSource("fab-bulk@1.0.0");

    expect(await pathExists(path.join(fetched.factoryDir, "bulk-51.bin"))).toBe(true);
  });

  test("fails with exit 4 when metafab.format is not 1", async () => {
    await expect(fetchSource("fab-bad-format@1.0.0")).rejects.toMatchObject({
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
    });
  });
});
