import path from "node:path";
import { ExitCode, MetafabError } from "../errors.js";
import { isDirectory, normalizeProblemPath } from "../util/fs.js";
import { runGit } from "../util/git.js";
import type { GitOptions, GitResult } from "../util/git.js";

export interface FactoryLocation {
  root: string;
  factoryDir: string;
}

export type GitRunner = (args: string[], options?: GitOptions) => Promise<GitResult>;

const MISSING_FACTORY_CODE = "factory-not-found";
const GIT_FAILED_CODE = "git-failed";

export async function findFactory(cwd: string): Promise<FactoryLocation> {
  let current = path.resolve(cwd);

  for (;;) {
    const factoryDir = path.join(current, ".factory");
    if (await isDirectory(factoryDir)) return { root: current, factoryDir };

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new MetafabError(`No .factory directory found in ${cwd} or any parent directory.`, {
    exitCode: ExitCode.Failed,
    code: MISSING_FACTORY_CODE,
    details: { cwd },
    problems: [
      {
        level: "error",
        file: normalizeProblemPath(".factory", cwd),
        message: `No factory found in ${cwd} or any parent directory.`,
        fix: "Run metafab init",
      },
    ],
  });
}

function isNotARepository(result: GitResult): boolean {
  return result.exitCode === 128 && /not a git repository/i.test(result.stderr);
}

export async function resolveNewFactoryRoot(cwd: string, git: GitRunner = runGit): Promise<string> {
  try {
    return (await findFactory(cwd)).root;
  } catch (error) {
    if (!(error instanceof MetafabError) || error.code !== MISSING_FACTORY_CODE) throw error;
  }

  const resolved = path.resolve(cwd);
  let result: GitResult;
  try {
    result = await git(["rev-parse", "--show-toplevel"], { cwd: resolved });
  } catch {
    return resolved;
  }

  if (result.exitCode === 0 && result.stdout.trim() !== "") {
    return path.resolve(result.stdout.trim());
  }

  if (isNotARepository(result)) return resolved;

  const message = result.stderr.trim();
  throw new MetafabError(
    message === ""
      ? `git rev-parse --show-toplevel exited with ${result.exitCode}.`
      : `Could not find the git repository root: ${message}`,
    {
      exitCode: ExitCode.Failed,
      code: GIT_FAILED_CODE,
      details: { cwd: resolved, exitCode: result.exitCode, stderr: result.stderr },
    },
  );
}
