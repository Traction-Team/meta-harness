import { readFile } from "node:fs/promises";
import path from "node:path";
import { cannotReadProblem } from "../build/skill.js";
import { CONFIG_FILE, CONFIG_FILENAME, parseConfig } from "./parse.js";
import type { Config } from "./types.js";

/**
 * A configuration file that exists but cannot be read is one problem, not a
 * crash: the caller reports it like every other read error and exits 1.
 */
function unreadableConfig(): Config {
  return { ...parseConfig(""), problems: [cannotReadProblem(CONFIG_FILE)] };
}

export async function loadConfig(factoryDir: string): Promise<Config> {
  let text: string;
  try {
    text = await readFile(path.join(factoryDir, CONFIG_FILENAME), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return parseConfig("");
    return unreadableConfig();
  }

  return parseConfig(text, { repositoryRoot: path.dirname(path.resolve(factoryDir)) });
}
