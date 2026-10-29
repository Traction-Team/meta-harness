import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import { npmInvocation } from "../../../src/core/sources/index.js";

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "metafab-npm-cli-"));
}

async function writeNpmCli(file: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "");
}

describe("npmInvocation", () => {
  test("runs npm directly on platforms with an executable wrapper", async () => {
    for (const platform of ["linux", "darwin"] as const) {
      expect(await npmInvocation({ platform, env: {}, execPath: "/usr/bin/node" })).toEqual({
        command: "npm",
        args: [],
      });
    }
  });

  test("uses npm_execpath on Windows without a shell", async () => {
    const root = await tempDir();
    try {
      const execPath = path.join(root, "node.exe");
      const npmCli = path.join(root, "global", "npm", "bin", "npm-cli.js");
      await writeNpmCli(npmCli);

      const invocation = await npmInvocation({
        platform: "win32",
        env: { npm_execpath: npmCli },
        execPath,
      });

      expect(invocation).toEqual({ command: execPath, args: [npmCli] });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("falls back to the npm bundled with the running Node binary", async () => {
    const root = await tempDir();
    try {
      const execPath = path.join(root, "node.exe");
      const bundled = path.join(root, "node_modules", "npm", "bin", "npm-cli.js");
      await writeNpmCli(bundled);

      for (const env of [
        {},
        { npm_execpath: path.join(root, "removed", "npm-cli.js") },
        { npm_execpath: path.join(root, "npm-cli.js.bak") },
      ]) {
        const invocation = await npmInvocation({ platform: "win32", env, execPath });
        expect(invocation).toEqual({ command: execPath, args: [bundled] });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fails with exit 3 when npm cannot be found", async () => {
    const root = await tempDir();
    try {
      let failure: unknown;
      try {
        await npmInvocation({ platform: "win32", env: {}, execPath: path.join(root, "node.exe") });
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(MetafabError);
      const metafab = failure as MetafabError;
      expect(metafab.exitCode).toBe(ExitCode.FetchFailed);
      expect(metafab.code).toBe("fetch-failed");
      expect(metafab.message).toContain("npm could not be found");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
