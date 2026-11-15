import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { npmInvocation } from "../../src/core/sources/npm-cli.js";
import { buildCli } from "../cli/build.js";

/**
 * The package as npm publishes it: the files `npm pack` writes, the manifest
 * fields trusted publishing needs, and the packed CLI installed and run from a
 * temporary directory.
 *
 * `npm run verify` runs the tests before the build, so this file builds first
 * through the helper every spawned-CLI test uses.
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
let packed: PackedTarball;
let manifest: Manifest;
let repoLock: Lockfile;

/** Runs npm through the invocation the CLI uses, so no shell is involved. */
async function npm(args: string[], cwd: string): Promise<{ stdout: string }> {
  const invocation = await npmInvocation();
  return execFileAsync(invocation.command, [...invocation.args, ...args], { cwd, timeout: 120_000 });
}

/**
 * A lockfile `npm ci` can install with `--offline`: every package the repository
 * installs for production, plus this tarball. `npm install` would look the
 * tarball's version ranges up on the registry, and no test reaches the network;
 * `npm ci` reads only the resolved URLs in the lockfile, and each of those is in
 * the cache the repository's own `npm ci` filled.
 */
function offlineLockfile(root: Record<string, unknown>, spec: string): Record<string, unknown> {
  const packages: Record<string, Record<string, unknown>> = {};

  for (const [key, entry] of Object.entries(repoLock.packages)) {
    if (key === "" || entry.dev === true) continue;
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
  await buildCli();
  manifest = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")) as Manifest;
  repoLock = JSON.parse(await readFile(path.join(repoRoot, "package-lock.json"), "utf8")) as Lockfile;
  packDir = await mkdtemp(path.join(tmpdir(), "metafab-release-pack-"));

  const { stdout } = await npm(["pack", "--pack-destination", packDir, "--json"], repoRoot);
  packed = (JSON.parse(stdout) as PackedTarball[])[0]!;
}, 180_000);

afterAll(async () => {
  await rm(packDir, { recursive: true, force: true });
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
        `${JSON.stringify(offlineLockfile(root, spec), null, 2)}\n`,
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
