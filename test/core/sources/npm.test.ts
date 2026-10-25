import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import {
  fetchFab,
  parseSource,
  resolve,
} from "../../../src/core/sources/index.js";
import type { Resolved } from "../../../src/core/sources/index.js";
import { pathExists } from "../../../src/util/fs.js";
import { startRegistry } from "../../helpers/registry/index.js";
import type { Registry } from "../../helpers/registry/index.js";

const FIXTURES = fileURLToPath(new URL("../../fixtures/fabs/", import.meta.url));
const VALID_FACTORY = path.join(FIXTURES, "valid-fab", ".factory");

let registry: Registry;
let cache: string;

function npmOptions(cacheDirectory: string = cache): {
  cache: string;
  env: NodeJS.ProcessEnv;
  registry: string;
} {
  return { cache: cacheDirectory, env: registry.env, registry: registry.url };
}

function specFor(source: string): ReturnType<typeof parseSource> {
  return parseSource(source, { cwd: process.cwd() });
}

async function resolveSource(source: string): Promise<Resolved> {
  return resolve(specFor(source), npmOptions());
}

async function fetchSource(source: string): Promise<Awaited<ReturnType<typeof fetchFab>>> {
  return fetchFab(await resolveSource(source), npmOptions());
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
    files: [".factory", "install.cjs"],
    scripts: { install: "node install.cjs" },
    extraFiles: {
      "install.cjs": [
        'const fs = require("node:fs");',
        'const path = require("node:path");',
        'fs.writeFileSync(path.join(__dirname, "script-ran.txt"), "ran");',
        "",
      ].join("\n"),
    },
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
}, 120_000);

afterAll(async () => {
  await rm(cache, { recursive: true, force: true });
  await registry?.stop();
});

describe("npm sources", () => {
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
    const fetched = await fetchSource("fab-scripts@1.0.0");

    expect(await pathExists(path.join(fetched.factoryDir, "install.cjs"))).toBe(false);
    expect(await pathExists(path.join(path.dirname(fetched.factoryDir), "install.cjs"))).toBe(true);
    expect(await pathExists(path.join(fetched.factoryDir, "script-ran.txt"))).toBe(false);
    expect(await pathExists(path.join(path.dirname(fetched.factoryDir), "script-ran.txt"))).toBe(
      false,
    );
  });

  test("fails with exit 4 when metafab.format is missing", async () => {
    await expect(fetchSource("fab-no-format@1.0.0")).rejects.toMatchObject({
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
    });
  });

  test("fails with exit 4 when metafab.format is not 1", async () => {
    await expect(fetchSource("fab-bad-format@1.0.0")).rejects.toMatchObject({
      exitCode: ExitCode.InvalidFab,
      code: "invalid-fab",
    });
  });
});
