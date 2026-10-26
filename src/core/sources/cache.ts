import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pathExists } from "../../util/fs.js";

export interface CacheLayout {
  root: string;
  npmTarball(name: string, version: string): string;
  gitMirror(url: string): string;
  fabDir(key: string): string;
  fabFactoryDir(key: string): string;
}

export interface GetOrCreateOptions<T> {
  validate: () => Promise<T>;
  create: () => Promise<void>;
}

export function cacheRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.METAFAB_CACHE?.trim();
  if (override !== undefined && override !== "") return path.resolve(override);
  return path.join(homedir(), ".metafab", "cache");
}

function keySegment(value: string): string {
  const key = value.replace(/[^A-Za-z0-9._@-]+/g, "-").replace(/^\.+$/, "");
  if (key === "") throw new Error(`Invalid cache key "${value}"`);
  return key;
}

export function fabKey(...parts: string[]): string {
  const value = parts.filter((part) => part !== "").join("-");
  return keySegment(value);
}

export function cacheLayout(root: string = cacheRoot()): CacheLayout {
  return {
    root,
    npmTarball(name: string, version: string): string {
      return path.join(root, "npm", ...name.split("/"), `${version}.tgz`);
    },
    gitMirror(url: string): string {
      const hash = createHash("sha256").update(url).digest("hex");
      return path.join(root, "git", hash);
    },
    fabDir(key: string): string {
      return path.join(root, "fabs", keySegment(key));
    },
    fabFactoryDir(key: string): string {
      return path.join(root, "fabs", keySegment(key), ".factory");
    },
  };
}

export async function getOrCreate<T>(target: string, options: GetOrCreateOptions<T>): Promise<T> {
  if (await pathExists(target)) {
    try {
      return await options.validate();
    } catch {
      await rm(target, { recursive: true, force: true });
    }
  }

  try {
    await options.create();
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }

  try {
    return await options.validate();
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}
