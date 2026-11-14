import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
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
 * One `tsc` run per checkout and test run. The marker is written only after a
 * successful compile and is stamped against every file `tsc` reads; while it is
 * fresh no test file compiles again, so a spawned `node dist/cli.js` never reads
 * a file another file's `tsc` is rewriting. It is keyed by this checkout, because
 * each worktree has its own `dist/`.
 */
const buildMarker = path.join(
  tmpdir(),
  `metafab-cli-build-${createHash("sha256").update(repoRoot).digest("hex").slice(0, 16)}.done`,
);

/**
 * `tsc` still takes one lock while it compiles, for the first run in a fresh
 * checkout and for two test files that start at the same time: one compiles and
 * writes the marker, the other finds the marker fresh once it holds the lock.
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

/**
 * Takes over a stale lock. Two waiters can see the same stale lock, so the lock
 * is moved aside with `rename`: only the waiter that wins the rename removes it,
 * and the other finds it gone (ENOENT) and waits for the new owner instead of
 * deleting a fresh lock another waiter just took.
 */
async function takeOverStaleLock(): Promise<void> {
  const moved = `${buildLock}.${process.pid}.${Date.now()}.stale`;
  try {
    await rename(buildLock, moved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  await rm(moved, { recursive: true, force: true });
}

/** The newest modification time among the files `tsc` reads. */
async function newestInputMtime(): Promise<number> {
  let newest = 0;
  const inputs = [
    path.join(repoRoot, "tsconfig.json"),
    path.join(repoRoot, "package.json"),
    path.join(repoRoot, "src"),
  ];

  for (const input of inputs) {
    const info = await stat(input).catch(() => undefined);
    if (info === undefined) continue;
    if (info.isFile()) {
      newest = Math.max(newest, info.mtimeMs);
      continue;
    }
    for (const name of await readdir(input, { recursive: true })) {
      const file = await stat(path.join(input, name)).catch(() => undefined);
      if (file !== undefined && file.isFile()) newest = Math.max(newest, file.mtimeMs);
    }
  }

  return newest;
}

/** True when `dist/cli.js` exists and was compiled after every input changed. */
async function buildIsCurrent(): Promise<boolean> {
  const marker = await stat(buildMarker).catch(() => undefined);
  if (marker === undefined) return false;
  const built = await stat(cliPath).catch(() => undefined);
  if (built === undefined) return false;
  return marker.mtimeMs >= (await newestInputMtime());
}

/** Compiles the CLI once per test run, taking turns with every other test file that does. */
export async function buildCli(): Promise<void> {
  if (await buildIsCurrent()) return;

  const deadline = Date.now() + WAIT_LIMIT_MS;

  for (;;) {
    if (await takeLock()) break;
    if (await lockIsStale()) {
      await takeOverStaleLock();
      continue;
    }
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${buildLock}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  try {
    // Another test file may have compiled while this one waited for the lock.
    if (await buildIsCurrent()) return;
    await execFileAsync(process.execPath, [tscPath], { cwd: repoRoot, timeout: 120_000 });
    // Writing the marker last is what makes the compile count.
    await writeFile(buildMarker, new Date().toISOString(), "utf8");
  } finally {
    await rm(buildLock, { recursive: true, force: true });
  }
}
