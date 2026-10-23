import path from "node:path";
import { ExitCode, MetafabError } from "../errors.js";
import { isDirectory } from "../util/fs.js";
import { runGit } from "../util/git.js";

export interface FactoryLocation {
  root: string;
  factoryDir: string;
}

const MISSING_FACTORY_CODE = "factory-not-found";

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
        file: ".factory",
        message: `No factory found in ${cwd} or any parent directory.`,
        fix: "Run metafab init",
      },
    ],
  });
}

export async function resolveNewFactoryRoot(cwd: string): Promise<string> {
  try {
    return (await findFactory(cwd)).root;
  } catch (error) {
    if (!(error instanceof MetafabError) || error.code !== MISSING_FACTORY_CODE) throw error;
  }

  const resolved = path.resolve(cwd);
  try {
    const result = await runGit(["rev-parse", "--show-toplevel"], { cwd: resolved });
    if (result.exitCode === 0) {
      const topLevel = result.stdout.trim();
      if (topLevel !== "") return path.resolve(topLevel);
    }
  } catch {
    return resolved;
  }

  return resolved;
}
