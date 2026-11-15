import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import * as tar from "tar";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { npmInvocation } from "../../src/core/sources/npm-cli.js";
import { buildDist } from "../cli/build.js";

/**
 * The package as npm publishes it: the files `npm pack` writes, the manifest
 * fields trusted publishing needs, and the packed CLI installed and run from a
 * temporary directory.
 *
 * `npm run verify` runs the tests before the build, so this file compiles the
 * repository's own `dist/` first. `npm pack` packs this checkout, because the
 * test "leaves the repository's own files out" checks the `files` list against
 * the real tree. No other test file reads or writes `dist/`.
 */

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

interface PackedFile {
  path: string;
}

interface PackedTarball {
  name: string;
  version: string;
  filename: string;
  files: PackedFile[];
}

interface Manifest {
  version: string;
  bin: Record<string, string>;
  dependencies: Record<string, string>;
  engines?: Record<string, string>;
  repository?: unknown;
  publishConfig?: unknown;
}

interface Lockfile {
  packages: Record<string, Record<string, unknown>>;
}

let packDir = "";
let depsDir = "";
let cacheDir = "";
let packed: PackedTarball;
let manifest: Manifest;
let repoLock: Lockfile;
let dependencies: Map<string, string>;

/**
 * Runs npm through the invocation the CLI uses, so no shell is involved, with
 * a cache the test owns: whatever this machine's npm cache holds must not
 * decide whether the install works.
 */
async function npm(args: string[], cwd: string): Promise<{ stdout: string }> {
  const invocation = await npmInvocation();
  return execFileAsync(invocation.command, [...invocation.args, ...args, "--cache", cacheDir], {
    cwd,
    timeout: 120_000,
  });
}

/**
 * A tarball of every package this repository installs for production, packed
 * from `node_modules` in this checkout. `npm pack` cannot make them: it runs
 * the package's `prepare` script, and a package installed from the registry no
 * longer carries the tools that script needs.
 */
async function packDependencies(destination: string): Promise<Map<string, string>> {
  const tarballs = new Map<string, string>();

  for (const [key, entry] of Object.entries(repoLock.packages)) {
    if (key === "" || entry.dev === true) continue;
    const name = key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
    const file = path.join(destination, `${name.replace("/", "-")}-${String(entry.version)}.tgz`);

    await tar.create(
      { gzip: true, cwd: path.join(repoRoot, key), prefix: "package/", file, portable: true },
      ["."],
    );
    tarballs.set(key, file);
  }

  return tarballs;
}

/**
 * A lockfile `npm ci` can install with `--offline` and an empty cache: every
 * package the repository installs for production, plus this tarball, each
 * resolved to a file this test packed. `npm install` would look the tarball's
 * version ranges up on the registry, and no test reaches the network.
 */
function offlineLockfile(
  root: Record<string, unknown>,
  spec: string,
  tarballs: Map<string, string>,
  project: string,
): Record<string, unknown> {
  const packages: Record<string, Record<string, unknown>> = {};

  for (const [key, installed] of Object.entries(repoLock.packages)) {
    if (key === "" || installed.dev === true) continue;
    const tarball = tarballs.get(key);
    if (tarball === undefined) throw new Error(`the test packed no tarball for ${key}`);

    const entry: Record<string, unknown> = { ...installed };
    // `integrity` describes the registry's bytes; this tarball was packed from
    // the installed copy, so the entry points at the file instead.
    delete entry.integrity;
    entry.resolved = `file:${path.relative(project, tarball)}`;
    packages[key] = entry;
  }

  packages[`node_modules/${packed.name}`] = {
    version: packed.version,
    resolved: spec,
    bin: manifest.bin,
    dependencies: manifest.dependencies,
    engines: manifest.engines,
  };

  return { ...root, lockfileVersion: 3, requires: true, packages: { "": root, ...packages } };
}

beforeAll(async () => {
  await buildDist();
  manifest = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")) as Manifest;
  repoLock = JSON.parse(await readFile(path.join(repoRoot, "package-lock.json"), "utf8")) as Lockfile;
  packDir = await mkdtemp(path.join(tmpdir(), "metafab-release-pack-"));
  depsDir = await mkdtemp(path.join(tmpdir(), "metafab-release-deps-"));
  cacheDir = await mkdtemp(path.join(tmpdir(), "metafab-release-cache-"));

  const { stdout } = await npm(["pack", "--pack-destination", packDir, "--json"], repoRoot);
  packed = (JSON.parse(stdout) as PackedTarball[])[0]!;
  dependencies = await packDependencies(depsDir);
}, 180_000);

afterAll(async () => {
  await rm(packDir, { recursive: true, force: true });
  await rm(depsDir, { recursive: true, force: true });
  await rm(cacheDir, { recursive: true, force: true });
});

describe("the published package", { timeout: 180_000 }, () => {
  test("packs the CLI, the manifest and the README", () => {
    const paths = packed.files.map((file) => file.path);

    expect(paths).toContain("dist/cli.js");
    expect(paths).toContain("package.json");
    expect(paths).toContain("README.md");
    // `build` reads the built-in skill out of the package at run time.
    expect(paths.some((file) => file.startsWith("resources/metafab-skill/"))).toBe(true);
  });

  test("leaves the repository's own files out", () => {
    const sources = packed.files
      .map((file) => file.path)
      .filter((file) => /^(test|docs|\.factory)\//.test(file));

    expect(sources).toEqual([]);
  });

  test("carries the repository and provenance trusted publishing needs", () => {
    expect(manifest.repository).toEqual({
      type: "git",
      url: "git+https://github.com/Traction-Team/meta-harness.git",
    });
    expect(manifest.publishConfig).toEqual({ access: "public", provenance: true });
  });

  test("names a packed file as its bin", () => {
    const paths = packed.files.map((file) => file.path);

    expect(Object.keys(manifest.bin)).toEqual(["metafab"]);
    for (const target of Object.values(manifest.bin)) expect(paths).toContain(target);
  });

  test("installs offline and reports the packed version", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "metafab-release-install-"));

    try {
      const spec = `file:${packed.filename}`;
      const root = {
        name: "metafab-release-check",
        version: "0.0.0",
        private: true,
        dependencies: { [packed.name]: spec },
      };

      await copyFile(path.join(packDir, packed.filename), path.join(project, packed.filename));
      await writeFile(path.join(project, "package.json"), `${JSON.stringify(root, null, 2)}\n`);
      await writeFile(
        path.join(project, "package-lock.json"),
        `${JSON.stringify(offlineLockfile(root, spec, dependencies, project), null, 2)}\n`,
      );
      await npm(["ci", "--offline", "--no-audit", "--no-fund"], project);

      const installedDir = path.join(project, "node_modules", ...packed.name.split("/"));
      const installed = JSON.parse(await readFile(path.join(installedDir, "package.json"), "utf8")) as Manifest;
      const entry = path.join(installedDir, installed.bin.metafab!);
      const { stdout } = await execFileAsync(process.execPath, [entry, "--version"], {
        cwd: project,
        timeout: 60_000,
      });

      // The version comes from the packed package.json, which this release sets
      // to 1.0.0, not from a constant compiled into the CLI.
      expect(installed.version).toBe(manifest.version);
      expect(stdout.trim()).toBe(manifest.version);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
});
