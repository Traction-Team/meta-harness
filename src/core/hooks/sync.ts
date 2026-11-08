import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Problem } from "../../errors.js";
import { runGit } from "../../util/git.js";
import { toLF } from "../../util/text.js";
import { HOOK_NAMES, HOOK_START_MARKER, hookCommand, hookScript } from "./script.js";
import type { HookName } from "./script.js";

export interface HookChange {
  hook: HookName;
  action: "created" | "updated" | "removed";
}

export interface HookSync {
  changed: HookChange[];
  warnings: Problem[];
}

const CONFIG_FILE = ".factory/metafab.yaml";

const CD_LINE = /^cd "\$\(git rev-parse --show-toplevel\)\/(.*)"/;

function noGitWarning(): Problem {
  return {
    level: "warning",
    file: CONFIG_FILE,
    message: "git-hooks is true, but this is not a Git repository or git is not installed",
    fix: "Install Git, or set git-hooks: false",
  };
}

function foreignWarning(file: string, factoryRelDir: string, cliVersion: string): Problem {
  return {
    level: "warning",
    file,
    message: `${file} exists and was not written by Metafab`,
    fix: `Add this line to ${file}: ${hookCommand(factoryRelDir, cliVersion)}`,
  };
}

function hooksPathWarning(hooksPath: string, factoryRelDir: string, cliVersion: string): Problem {
  return {
    level: "warning",
    file: CONFIG_FILE,
    message: "core.hooksPath is set, so Metafab did not install Git hooks",
    fix: `Add this line to post-checkout, post-merge and post-rewrite in ${hooksPath}: ${hookCommand(factoryRelDir, cliVersion)}`,
  };
}

function otherFactoryWarning(file: string, otherDir: string): Problem {
  return {
    level: "warning",
    file,
    message: `${file} runs metafab build for ${otherDir}`,
    fix: "Git hooks support one factory per repository; set git-hooks: false in one of them",
  };
}

function unreadableHooksPathWarning(): Problem {
  return {
    level: "warning",
    file: CONFIG_FILE,
    message: "core.hooksPath could not be read, so Metafab did not install Git hooks",
    fix: "Run git config --get core.hooksPath, fix the error, then run metafab build again",
  };
}

function fileWarning(file: string, error: unknown): Problem {
  const code = (error as NodeJS.ErrnoException).code ?? "error";
  return {
    level: "warning",
    file,
    message: `Cannot update ${file}: ${code}`,
    fix: "Check the file's permissions, then run metafab build again",
  };
}

async function gitOutput(args: string[], cwd: string): Promise<string | undefined> {
  try {
    const result = await runGit(args, { cwd });
    return result.exitCode === 0 ? result.stdout : undefined;
  } catch {
    return undefined;
  }
}

async function readIfExists(target: string): Promise<string | undefined> {
  try {
    return await readFile(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function isOwned(text: string): boolean {
  return toLF(text).split("\n").includes(HOOK_START_MARKER);
}

/** The factory directory an owned hook serves, or `undefined` when it cannot be parsed. */
function hookFactoryDir(text: string): string | undefined {
  for (const line of toLF(text).split("\n")) {
    const match = CD_LINE.exec(line);
    if (match !== null) return match[1];
  }
  return undefined;
}

function relativePath(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join("/");
}

async function writeHook(target: string, content: string): Promise<void> {
  await writeFile(target, content, { mode: 0o755 });
  await chmod(target, 0o755);
}

/**
 * Applies the Git hooks rules in docs/specs/building.md#git-hooks.
 *
 * Never throws for Git problems: a missing `git`, a directory outside a
 * repository, and any other Git failure become warnings or a no-op.
 */
export async function syncGitHooks(
  root: string,
  enabled: boolean,
  cliVersion: string,
): Promise<HookSync> {
  const changed: HookChange[] = [];
  const warnings: Problem[] = [];

  const topLevel = await gitOutput(["rev-parse", "--show-toplevel"], root);
  const commonDir = await gitOutput(["rev-parse", "--git-common-dir"], root);

  if (topLevel === undefined || commonDir === undefined) {
    if (enabled) warnings.push(noGitWarning());
    return { changed, warnings };
  }

  let hooksPath: string | undefined;
  try {
    const result = await runGit(["config", "--get", "core.hooksPath"], { cwd: root });
    if (result.exitCode === 0) {
      hooksPath = result.stdout.trim();
    } else if (result.exitCode !== 1) {
      warnings.push(unreadableHooksPathWarning());
      return { changed, warnings };
    }
  } catch {
    if (enabled) warnings.push(noGitWarning());
    return { changed, warnings };
  }

  const prefix = await gitOutput(["rev-parse", "--show-prefix"], root);
  const factoryRelDir =
    prefix === undefined ? "." : prefix.trim().replace(/\/+$/, "") || ".";

  const hooksDir = path.join(path.resolve(root, commonDir.trim()), "hooks");
  const canWrite = enabled && hooksPath === undefined;

  if (hooksPath !== undefined && enabled) {
    warnings.push(hooksPathWarning(hooksPath, factoryRelDir, cliVersion));
  }

  if (canWrite) {
    try {
      await mkdir(hooksDir, { recursive: true });
    } catch (error) {
      warnings.push(fileWarning(relativePath(root, hooksDir), error));
      return { changed, warnings };
    }
  }

  for (const hook of HOOK_NAMES) {
    const target = path.join(hooksDir, hook);
    const file = relativePath(root, target);

    try {
      const existing = await readIfExists(target);

      if (existing === undefined) {
        if (!canWrite) continue;
        await writeHook(target, hookScript(hook, factoryRelDir, cliVersion));
        changed.push({ hook, action: "created" });
        continue;
      }

      if (!isOwned(existing)) {
        if (enabled) warnings.push(foreignWarning(file, factoryRelDir, cliVersion));
        continue;
      }

      const otherDir = hookFactoryDir(existing);
      if (otherDir !== undefined && otherDir !== factoryRelDir) {
        if (enabled) warnings.push(otherFactoryWarning(file, otherDir));
        continue;
      }

      if (!enabled) {
        await unlink(target);
        changed.push({ hook, action: "removed" });
        continue;
      }

      if (!canWrite) continue;

      const desired = hookScript(hook, factoryRelDir, cliVersion);
      if (toLF(existing) === desired) continue;

      await writeHook(target, desired);
      changed.push({ hook, action: "updated" });
    } catch (error) {
      warnings.push(fileWarning(file, error));
    }
  }

  return { changed, warnings };
}
