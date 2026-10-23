import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const cliPath = path.join(repoRoot, "dist", "cli.js");
const tscPath = path.join(repoRoot, "node_modules", "typescript", "bin", "tsc");

const V1_COMMANDS = [
  "init",
  "build",
  "create",
  "rename",
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

async function runCli(...args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], { cwd: repoRoot });
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

describe("spawned cli", () => {
  beforeAll(async () => {
    await execFileAsync(process.execPath, [tscPath], { cwd: repoRoot, timeout: 120_000 });
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
});
