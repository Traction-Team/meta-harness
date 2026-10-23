import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface GitOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
}

export function gitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const merged = { ...env };
  if (process.stdin.isTTY !== true) merged.GIT_TERMINAL_PROMPT = "0";
  return merged;
}

export async function runGit(args: string[], options: GitOptions = {}): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd: options.cwd,
      env: options.env === undefined ? gitEnv() : gitEnv(options.env),
      encoding: "utf8",
      maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
      windowsHide: true,
    });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string; message?: string };
    if (typeof failure.code === "number") {
      return {
        exitCode: failure.code,
        stdout: failure.stdout ?? "",
        stderr: failure.stderr ?? failure.message ?? "",
      };
    }
    throw error;
  }
}
