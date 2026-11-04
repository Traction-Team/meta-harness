import { readFile } from "node:fs/promises";
import path from "node:path";
import { cannotReadProblem } from "../build/skill.js";
import { CONFIG_FILE, CONFIG_FILENAME, parseConfig } from "./parse.js";
import type { Config } from "./types.js";

/**
 * The error codes of configs that came from a file that exists but could not be
 * read. A `WeakMap` keeps the code off `Config`, so `types.ts` stays unchanged.
 */
const unreadableCodes = new WeakMap<Config, string>();

/**
 * A configuration file that exists but cannot be read is one problem, not a
 * crash: the caller reports it like every other read error and exits 1.
 */
function unreadableConfig(code: string): Config {
  const config: Config = { ...parseConfig(""), problems: [cannotReadProblem(CONFIG_FILE)] };
  unreadableCodes.set(config, code);
  return config;
}

/** The error code when `config` came from a file that could not be read; undefined otherwise. */
export function unreadableConfigCode(config: Config): string | undefined {
  return unreadableCodes.get(config);
}

export async function loadConfig(factoryDir: string): Promise<Config> {
  let text: string;
  try {
    text = await readFile(path.join(factoryDir, CONFIG_FILENAME), "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return parseConfig("");
    // Every read failure with a code is a problem. Anything else may be a bug,
    // so it reaches the CLI's bug path instead of looking like a permissions
    // problem.
    if (typeof code !== "string") throw error;
    return unreadableConfig(code);
  }

  return parseConfig(text, { repositoryRoot: path.dirname(path.resolve(factoryDir)) });
}
