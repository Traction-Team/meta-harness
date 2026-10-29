import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const cliPath = path.join(repoRoot, "dist", "cli.js");
const tscPath = path.join(path.dirname(require.resolve("typescript/package.json")), "bin", "tsc");

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
  return runEntry(cliPath, ...args);
}

describe("spawned cli", () => {
  beforeAll(async () => {
    await execFileAsync(process.execPath, [tscPath], { cwd: repoRoot, timeout: 120_000 });
    await chmod(cliPath, 0o755);
  }, 120_000);

  test("package.json bin.metafab points at the built entry", async () => {
    const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")) as {
      bin?: Record<string, string>;
    };
    const bin = pkg.bin?.metafab;
    expect(typeof bin).toBe("string");
    expect(path.isAbsolute(bin ?? "")).toBe(false);
    expect((await stat(path.join(repoRoot, ...(bin ?? "").split("/")))).isFile()).toBe(true);
  });

  test("the built entry starts with a node shebang and is executable", async () => {
    const content = await readFile(cliPath, "utf8");
    expect(content.startsWith("#!/usr/bin/env node\n")).toBe(true);
    if (process.platform !== "win32") {
      expect((await stat(cliPath)).mode & 0o111).not.toBe(0);
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
      await symlink(cliPath, link);
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
