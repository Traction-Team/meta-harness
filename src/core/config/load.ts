import { readFile } from "node:fs/promises";
import path from "node:path";
import { CONFIG_FILENAME, parseConfig } from "./parse.js";
import type { Config } from "./types.js";

export async function loadConfig(factoryDir: string): Promise<Config> {
  let text: string;
  try {
    text = await readFile(path.join(factoryDir, CONFIG_FILENAME), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return parseConfig("");
    throw error;
  }

  return parseConfig(text, { repositoryRoot: path.dirname(path.resolve(factoryDir)) });
}
