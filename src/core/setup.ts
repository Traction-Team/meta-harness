import { lstat } from "node:fs/promises";
import { ExitCode, MetafabError } from "../errors.js";
import { isDirectory } from "../util/fs.js";
import { cliVersion } from "../util/version.js";
import type { AdoptionMove } from "./adopt.js";
import { planBuild } from "./build/index.js";
import { loadConfig, unreadableConfigCode } from "./config/load.js";
import { CONFIG_FILE, parseConfig } from "./config/parse.js";
import { TARGETS } from "./config/types.js";
import type { Config, Target } from "./config/types.js";
import { createConfigText } from "./config/writers.js";
import { loadFactory } from "./factory/load.js";

/** The command whose name fills the `then run metafab <command> again` fix lines. */
export type SetupCommand = "init" | "import";

export function selectedTargets(selection: "all" | Target[]): Target[] {
  return selection === "all" ? [...TARGETS] : [...selection];
}

export function unreadableFactory(file: string, message: string, fix: string): MetafabError {
  return new MetafabError(message, {
    exitCode: ExitCode.Failed,
    code: "factory-unreadable",
    problems: [{ level: "error", file, message, fix }],
  });
}

/** Refuses a `.factory` entry that cannot hold a factory before anything reads it. */
export async function assertFactoryDirectoryUsable(
  factoryDir: string,
  command: SetupCommand,
): Promise<void> {
  let info;
  try {
    info = await lstat(factoryDir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    throw unreadableFactory(
      ".factory",
      "Cannot read the .factory entry",
      "Check its permissions or restore the directory",
    );
  }

  if (info.isDirectory()) return;
  if (info.isSymbolicLink() && (await isDirectory(factoryDir))) return;

  throw unreadableFactory(
    ".factory",
    info.isSymbolicLink()
      ? ".factory is a symbolic link that does not point to a directory"
      : ".factory is a file, not a directory",
    `Move it or replace it with a directory, then run metafab ${command} again`,
  );
}

/**
 * The fix line for an unreadable configuration file. Only a permissions error
 * is worth telling the reader to check permissions; every other code means the
 * file is broken, a directory, a loop, or otherwise unreadable.
 */
export function unreadableConfigFix(code: string, command: SetupCommand): string {
  return code === "EACCES" || code === "EPERM"
    ? "Check its permissions or restore the file"
    : `Restore the file, then run metafab ${command} again`;
}

/** Loads `metafab.yaml`, refusing a file that exists but cannot be read. */
export async function readConfig(factoryDir: string, command: SetupCommand): Promise<Config> {
  const config = await loadConfig(factoryDir);
  const code = unreadableConfigCode(config);
  if (code !== undefined) {
    throw unreadableFactory(
      CONFIG_FILE,
      `Cannot read file ${CONFIG_FILE}`,
      unreadableConfigFix(code, command),
    );
  }

  return config;
}

/** True when `file` lies at or beneath one of the paths an adoption moves. */
export function isAdoptionSource(file: string, moves: readonly AdoptionMove[]): boolean {
  return moves.some((move) =>
    move.from.some((from) => file === from || file.startsWith(`${from}/`)),
  );
}

/**
 * The output conflicts `build` would refuse, checked before `init` or `import`
 * writes anything. Validation errors that are already in the factory are left
 * for the closing build to report, so the setup command still adds the missing
 * entries the specification promises. Conflict problems inside a planned move
 * are ignored: the move removes them.
 */
export async function preflightBuild(
  root: string,
  config: Config,
  selection: "all" | Target[],
  configExists: boolean,
  moves: readonly AdoptionMove[],
): Promise<void> {
  const factory = await loadFactory(root);
  const effective = configExists ? config : parseConfig(createConfigText({ agents: selection }));
  const planned = await planBuild(factory, effective, cliVersion());
  const conflicts = planned.conflicts.filter((problem) => !isAdoptionSource(problem.file, moves));

  if (conflicts.length === 0) return;

  throw new MetafabError(
    "Build stopped because the repository contains output that Metafab does not own.",
    {
      exitCode: ExitCode.NotOwned,
      code: "build-conflict",
      problems: [...conflicts, ...planned.errors, ...planned.warnings],
    },
  );
}
