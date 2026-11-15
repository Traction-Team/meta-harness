import type { Problem } from "../../errors.js";
import { runGit } from "../../util/git.js";
import type { GitResult } from "../../util/git.js";
import type { GitConfigScope } from "./types.js";

export interface EnvConfigEntry {
  scope: GitConfigScope;
  variable: string;
  value: string;
}

export type EnvConfigReader = (
  root: string,
) => Promise<{ entries: EnvConfigEntry[]; warnings: Problem[] }>;

/** A problem with the selection is a problem with the declaration that needs it. */
const FILE = ".factory/factory.yaml";

const SCOPES: readonly string[] = ["worktree", "local", "global", "system"];

/** One call for every variable and scope; `-z` keeps a newline inside a value. */
const ARGS = ["config", "-z", "--show-scope", "--get-regexp", "^factory\\.env\\."];

function isScope(value: string): value is GitConfigScope {
  return SCOPES.includes(value);
}

function firstLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed !== "") return trimmed;
  }
  return "";
}

function cannotRead(reason: string): Problem {
  return {
    level: "warning",
    file: FILE,
    message: `Cannot read factory.env.* from Git config: ${reason}`,
    fix: "Fix the Git config file, or select with --env or FACTORY_ENV_<VARIABLE>",
  };
}

/**
 * Stdout is a NUL-terminated pair of records per key: `<scope>\0`, then
 * `<key>\n<value>\0`. The first newline ends the key, and everything after it
 * is the value. A key with no value has no newline at all.
 */
function parseOutput(stdout: string): EnvConfigEntry[] | undefined {
  if (stdout === "") return [];
  if (!stdout.endsWith("\0")) return undefined;

  const records = stdout.slice(0, -1).split("\0");
  if (records.length % 2 !== 0) return undefined;

  const entries: EnvConfigEntry[] = [];
  for (let index = 0; index < records.length; index += 2) {
    const scope = records[index]!;
    const record = records[index + 1]!;
    // `command` comes from `git -c` or GIT_CONFIG_*; a selection never comes
    // from how one Git process was started, so it is skipped without a warning.
    if (!isScope(scope)) continue;

    const newline = record.indexOf("\n");
    const key = newline === -1 ? record : record.slice(0, newline);
    const value = newline === -1 ? "" : record.slice(newline + 1);
    if (!key.startsWith("factory.env.")) continue;

    // The variable is the whole suffix. A subsection, such as
    // `factory.env.other.harness`, names no variable, so it is skipped.
    const variable = key.slice("factory.env.".length);
    if (variable === "" || variable.includes(".")) continue;

    entries.push({ scope, variable, value });
  }

  return entries;
}

/** Reads `factory.env.*` for every scope through `run`, which tests inject. */
export function createEnvConfigReader(run: typeof runGit = runGit): EnvConfigReader {
  return async (root) => {
    let result: GitResult;
    try {
      result = await run(ARGS, { cwd: root });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // Git is not installed: the selection continues without Git config.
      if (code === "ENOENT") return { entries: [], warnings: [] };
      const reason = firstLine((error as Error).message ?? "") || code || "git could not be run";
      return { entries: [], warnings: [cannotRead(reason)] };
    }

    const stderr = firstLine(result.stderr);
    // `--show-scope` arrived in Git 2.26, so an older Git refuses the option.
    if (
      result.exitCode !== 0 &&
      stderr.includes("unknown option") &&
      stderr.includes("show-scope")
    ) {
      return {
        entries: [],
        warnings: [
          {
            level: "warning",
            file: FILE,
            message: "Git 2.26 or later is needed to read factory.env.* from Git config",
            fix: "Upgrade Git, or select with --env or FACTORY_ENV_<VARIABLE>",
          },
        ],
      };
    }

    // Git exits 1 when no key matches the pattern.
    if (result.exitCode !== 0 && result.exitCode !== 1) {
      return {
        entries: [],
        warnings: [
          cannotRead(stderr === "" ? `git config exited with status ${result.exitCode}` : stderr),
        ],
      };
    }

    const entries = parseOutput(result.stdout);
    if (entries === undefined) {
      return { entries: [], warnings: [cannotRead("unexpected output from git config")] };
    }
    return { entries, warnings: [] };
  };
}

export const readEnvConfig: EnvConfigReader = createEnvConfigReader();
