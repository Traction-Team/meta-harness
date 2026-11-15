import { stat } from "node:fs/promises";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";

export interface NpmInvocation {
  command: string;
  args: string[];
}

export interface NpmInvocationOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  execPath?: string;
}

async function isFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

function isNpmCliScript(value: string | undefined): value is string {
  return value !== undefined && /npm-cli\.js$/i.test(value);
}

/**
 * How to run npm without a shell.
 *
 * On POSIX the `npm` wrapper is an executable, so it is used directly. On
 * Windows npm is `npm.cmd`, and Node refuses to spawn `.cmd`/`.bat` files
 * through `execFile` without `shell: true` (and going through a shell is not an
 * option). Running npm's JavaScript entry point with the current Node binary
 * avoids the wrapper entirely.
 */
export async function npmInvocation(
  options: NpmInvocationOptions = {},
): Promise<NpmInvocation> {
  const platform = options.platform ?? process.platform;
  const execPath = options.execPath ?? process.execPath;
  if (platform !== "win32") return { command: "npm", args: [] };

  const env = options.env ?? process.env;
  const candidates: string[] = [];
  if (isNpmCliScript(env.npm_execpath)) candidates.push(env.npm_execpath);
  candidates.push(path.join(path.dirname(execPath), "node_modules", "npm", "bin", "npm-cli.js"));

  for (const candidate of candidates) {
    if (await isFile(candidate)) return { command: execPath, args: [candidate] };
  }

  throw new MetafabError("Cannot run npm: npm could not be found", {
    exitCode: ExitCode.FetchFailed,
    code: "fetch-failed",
    problems: [
      {
        level: "error",
        file: "npm",
        message: "Cannot run npm: npm could not be found",
        fix: "Install Node.js with npm, or put npm on PATH, then run the command again",
      },
    ],
  });
}
