import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildCli, repoRoot, sweepOld } from "./build.js";
import type { BuiltCli } from "./build.js";

const execFileAsync = promisify(execFile);

const V1_COMMANDS = [
  "init",
  "build",
  "create",
  "pipeline add",
  "pipeline remove",
  "map",
  "check",
  "import",
  "update",
  "diff",
  "detach",
  "publish",
];

let built: BuiltCli;

async function runEntry(entry: string, ...args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFileAsync(process.execPath, [entry, ...args], { cwd: repoRoot });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      code: typeof failure.code === "number" ? failure.code : 1,
    };
  }
}

function runCli(...args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return runEntry(built.cliPath, ...args);
}

beforeAll(async () => {
  built = await buildCli();
}, 180_000);

afterAll(async () => {
  await built?.cleanup();
});

describe("spawned cli", () => {
  test("package.json bin.metafab points at the built entry", async () => {
    const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")) as {
      bin?: Record<string, string>;
    };
    const bin = pkg.bin?.metafab;
    expect(typeof bin).toBe("string");
    expect(path.isAbsolute(bin ?? "")).toBe(false);
    expect((await stat(path.join(built.root, ...(bin ?? "").split("/")))).isFile()).toBe(true);
  });

  test("the built entry starts with a node shebang and is executable", async () => {
    const content = await readFile(built.cliPath, "utf8");
    expect(content.startsWith("#!/usr/bin/env node\n")).toBe(true);
    if (process.platform !== "win32") {
      expect((await stat(built.cliPath)).mode & 0o111).not.toBe(0);
    }
  });

  test("--help lists every v1 command", async () => {
    const result = await runCli("--help");
    expect(result.code).toBe(0);
    for (const command of V1_COMMANDS) expect(result.stdout).toContain(command);
  });

  test("--version prints the package version", async () => {
    const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")) as {
      version: string;
    };
    const result = await runCli("--version");
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(pkg.version);
  });

  test.skipIf(process.platform === "win32")("runs through a symlinked entry", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "metafab-link-"));

    try {
      const link = path.join(dir, "metafab");
      await symlink(built.cliPath, link);
      const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")) as {
        version: string;
      };
      const result = await runEntry(link, "--version");
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe(pkg.version);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// These run after the spawned tests above, because the last one removes the
// build every test in this file shares.
describe("the test build", () => {
  test("buildCli compiles once, into a directory that carries what the CLI reads", async () => {
    const again = await buildCli();

    expect(again.root).toBe(built.root);
    expect((await stat(path.join(again.root, "package.json"))).isFile()).toBe(true);
    expect((await stat(path.join(again.root, "resources", "metafab-skill"))).isDirectory()).toBe(true);
    expect((await stat(again.cliPath)).isFile()).toBe(true);
    if (process.platform !== "win32") {
      expect((await stat(again.cliPath)).mode & 0o111).not.toBe(0);
    }
  });

  test("sweepOld removes a build a killed run left and keeps a fresh one", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "metafab-sweep-"));

    try {
      const old = path.join(parent, "old");
      const fresh = path.join(parent, "fresh");
      await mkdir(old);
      await mkdir(fresh);
      const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await utimes(old, longAgo, longAgo);

      await sweepOld(parent);

      expect(await stat(old).catch(() => undefined)).toBeUndefined();
      expect((await stat(fresh)).isDirectory()).toBe(true);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  test("cleanup removes the build directory", async () => {
    const { root, cleanup } = await buildCli();

    await cleanup();

    expect(await stat(root).catch(() => undefined)).toBeUndefined();
  });
});
