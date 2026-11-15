import { execFile } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

/** This checkout, from any test directory in it. */
export const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

const tscPath = path.join(path.dirname(require.resolve("typescript/package.json")), "bin", "tsc");

/**
 * Where the private builds live: under the checkout's own `node_modules`, which
 * Git ignores, so `dist/cli.js` still walks up to the dependencies it imports.
 */
const buildsParent = path.join(repoRoot, "node_modules", ".cache", "metafab-cli");

/** A build directory older than this belongs to a run that was killed. */
const SWEEP_AFTER_MS = 24 * 60 * 60 * 1000;

/** A private compile of this checkout: `<root>/dist/cli.js`, with package.json and resources/ beside it. */
export interface BuiltCli {
  root: string;
  cliPath: string;
  cleanup(): Promise<void>;
}

/**
 * Removes the build directories a run that was killed left behind, and only
 * those: a directory younger than a day may belong to another run still using
 * it. Best effort, because a directory that will not go only costs disk.
 */
export async function sweepOld(parent: string, now: number = Date.now()): Promise<void> {
  const names = await readdir(parent).catch(() => [] as string[]);

  for (const name of names) {
    const dir = path.join(parent, name);
    const info = await stat(dir).catch(() => undefined);
    if (info === undefined || !info.isDirectory()) continue;
    if (now - info.mtimeMs <= SWEEP_AFTER_MS) continue;
    await rm(dir, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined);
  }
}

let compiled: Promise<BuiltCli> | undefined;

/**
 * Compiles this checkout once per test file, into a directory no other file or
 * run uses, so a spawned CLI never reads a `dist/` another file is writing.
 * `package.json` and `resources/` are copied beside `dist/`, because the CLI
 * reads both at run time. Callers run `cleanup` in `afterAll`.
 */
export function buildCli(): Promise<BuiltCli> {
  compiled ??= compile();
  return compiled;
}

async function compile(): Promise<BuiltCli> {
  await sweepOld(buildsParent);
  await mkdir(buildsParent, { recursive: true });
  const root = await mkdtemp(path.join(buildsParent, `${process.pid}-`));
  // The retries are for Windows, where a spawned process that is closing can
  // still hold a file.
  const cleanup = (): Promise<void> => rm(root, { recursive: true, force: true, maxRetries: 5 });

  try {
    await cp(path.join(repoRoot, "package.json"), path.join(root, "package.json"));
    await cp(path.join(repoRoot, "resources"), path.join(root, "resources"), { recursive: true });
    const cliPath = path.join(root, "dist", "cli.js");
    await runTsc(path.join(root, "dist"));
    await chmod(cliPath, 0o755);
    return { root, cliPath, cleanup };
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }
}

/** Compiles the repository's own dist/ with tsc, always. Only the release test calls it. */
export async function buildDist(): Promise<void> {
  await runTsc(path.join(repoRoot, "dist"));
  await chmod(path.join(repoRoot, "dist", "cli.js"), 0o755);
}

/** Runs `tsc` into `outDir`, and rethrows with its output so the test shows the type error. */
async function runTsc(outDir: string): Promise<void> {
  try {
    await execFileAsync(process.execPath, [tscPath, "--outDir", outDir], {
      cwd: repoRoot,
      timeout: 120_000,
    });
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    const output = `${failure.stdout ?? ""}${failure.stderr ?? ""}`.trim();
    throw new Error(output === "" ? failure.message : output, { cause: error });
  }
}
