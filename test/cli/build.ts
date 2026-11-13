import { execFile } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

/** This checkout, from any test directory in it. */
export const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const cliPath = path.join(repoRoot, "dist", "cli.js");

const tscPath = path.join(path.dirname(require.resolve("typescript/package.json")), "bin", "tsc");

/**
 * Both end-to-end test files compile the same `dist/`, so one lock keeps two
 * `tsc` runs from writing it at once: a spawned `node dist/cli.js` must never
 * read a half-written file.
 */
const buildLock = path.join(tmpdir(), "metafab-cli-build.lock");
const ownerFile = path.join(buildLock, "pid");
/** Longer than any `tsc` run this checkout needs; the spawn timeout is 120 s. */
const STALE_AFTER_MS = 5 * 60_000;
const WAIT_LIMIT_MS = 2 * 60_000;
const POLL_MS = 100;

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * True when no build can hold the lock any more: the process that took it is
 * gone, or the lock is older than a build can be. A run killed mid-build
 * leaves its lock behind, and that must not make the next run time out.
 */
async function lockIsStale(): Promise<boolean> {
  const info = await stat(buildLock).catch(() => undefined);
  if (info === undefined) return false;
  if (Date.now() - info.mtimeMs > STALE_AFTER_MS) return true;

  const owner = await readFile(ownerFile, "utf8").catch(() => "");
  const pid = Number.parseInt(owner, 10);
  return Number.isInteger(pid) && pid > 0 && !isProcessAlive(pid);
}

async function takeLock(): Promise<boolean> {
  try {
    await mkdir(buildLock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return false;
  }
  await writeFile(ownerFile, String(process.pid), "utf8");
  return true;
}

/** Compiles the CLI once, taking turns with every other test file that does. */
export async function buildCli(): Promise<void> {
  const deadline = Date.now() + WAIT_LIMIT_MS;

  for (;;) {
    if (await takeLock()) break;
    if (await lockIsStale()) {
      await rm(buildLock, { recursive: true, force: true });
      continue;
    }
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${buildLock}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  try {
    await execFileAsync(process.execPath, [tscPath], { cwd: repoRoot, timeout: 120_000 });
  } finally {
    await rm(buildLock, { recursive: true, force: true });
  }
}
