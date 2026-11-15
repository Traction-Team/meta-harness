import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { didYouMean } from "../../util/suggest.js";
import { readEnvConfig } from "./git-config.js";
import type { EnvConfigEntry, EnvConfigReader } from "./git-config.js";
import type {
  EnvVariable,
  GitConfigScope,
  ResolvedSelection,
  ResolvedVariable,
} from "./types.js";

/** A problem with the selection is a problem with the declaration that needs it. */
const FILE = ".factory/factory.yaml";

/** Git config scopes, highest priority first. */
const SCOPES: readonly GitConfigScope[] = ["worktree", "local", "global", "system"];

/** `harness` → `FACTORY_ENV_HARNESS`; `target-os` → `FACTORY_ENV_TARGET_OS`. */
export function envVariableName(variable: string): string {
  return `FACTORY_ENV_${variable.toUpperCase().replaceAll("-", "_")}`;
}

/** Comma-separated value names, trimmed, without empties or repeats. */
export function splitValues(text: string): string[] {
  const values: string[] = [];
  for (const part of text.split(",")) {
    const value = part.trim();
    if (value === "" || values.includes(value)) continue;
    values.push(value);
  }
  return values;
}

/**
 * The `--env` option's arguments: `parseArgs` gives one string, a list of them,
 * or a boolean when the option is written with no value.
 */
export function envOptions(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

export interface ResolveOptions {
  root: string;
  /** Raw `--env` arguments. */
  options?: readonly string[];
  /** Default `process.env`; tests inject one so no developer's variable leaks in. */
  processEnv?: NodeJS.ProcessEnv;
  /** Default `readEnvConfig`; tests inject a fake. */
  readConfig?: EnvConfigReader;
}

/** The fix line for a variable or value a factory does not declare. */
export function declaredVariablesFix(names: readonly string[]): string {
  return names.length === 0
    ? "This factory declares no environment variables"
    : `Declared variables: ${names.join(", ")}`;
}

/** Splits `--env <variable>=<values>`, reporting every bad argument at once. */
function parseOptions(
  variables: readonly EnvVariable[],
  args: readonly string[],
): Map<string, string> {
  const byName = new Map(variables.map((variable) => [variable.name, variable]));
  const declared = variables.map((variable) => variable.name);
  const parsed = new Map<string, string>();
  const problems: Problem[] = [];

  for (const arg of args) {
    const equals = arg.indexOf("=");
    if (equals === -1) {
      problems.push({
        level: "error",
        file: FILE,
        message: `--env needs <variable>=<values>: "${arg}"`,
        fix: "Write --env <variable>=<values>, such as --env harness=opencode",
      });
      continue;
    }

    const name = arg.slice(0, equals);
    const text = arg.slice(equals + 1);
    const variable = byName.get(name);
    if (variable === undefined) {
      problems.push({
        level: "error",
        file: FILE,
        message: `--env names unknown variable "${name}"`,
        fix: didYouMean(name, declared) ?? declaredVariablesFix(declared),
      });
      continue;
    }
    if (parsed.has(name)) {
      problems.push({
        level: "error",
        file: FILE,
        line: variable.line,
        message: `--env names "${name}" twice`,
        fix: `Pass --env ${name}=<values> once`,
      });
      continue;
    }
    parsed.set(name, text);
  }

  if (problems.length > 0) {
    throw new MetafabError("Invalid --env", {
      exitCode: ExitCode.Failed,
      code: "invalid-env",
      problems,
    });
  }

  return parsed;
}

/**
 * Drops the values the variable does not declare, warning about each one, and
 * returns what is left in declaration order so the order given never matters.
 */
function keepDeclared(
  text: string,
  source: string,
  variable: EnvVariable,
  declared: readonly string[],
  warnings: Problem[],
): string[] {
  const kept = new Set<string>();
  for (const value of splitValues(text)) {
    if (!declared.includes(value)) {
      warnings.push({
        level: "warning",
        file: FILE,
        line: variable.line,
        message: `Ignored "${value}" from ${source}: ${variable.name} does not declare it`,
        fix: `Declared values: ${declared.join(", ")}`,
      });
      continue;
    }
    kept.add(value);
  }
  return declared.filter((name) => kept.has(name));
}

interface VariableSources {
  optionValues: Map<string, string>;
  processEnv: NodeJS.ProcessEnv;
  entries: readonly EnvConfigEntry[];
}

/** The first source that yields a declared value wins, in the spec's order. */
function resolveVariable(
  variable: EnvVariable,
  sources: VariableSources,
  warnings: Problem[],
): ResolvedVariable {
  const declared = variable.values.map((value) => value.name);
  const name = variable.name;

  const optionText = sources.optionValues.get(name);
  if (optionText !== undefined) {
    if (splitValues(optionText).length === 0) {
      warnings.push({
        level: "warning",
        file: FILE,
        line: variable.line,
        message: `--env ${name}=${optionText} names no value`,
        fix: `Write --env ${name}=<values>, such as --env ${name}=${declared[0] ?? "<value>"}`,
      });
    } else {
      const values = keepDeclared(
        optionText,
        `--env ${name}=${optionText}`,
        variable,
        declared,
        warnings,
      );
      if (values.length > 0) return { variable: name, values, source: "option" };
    }
  }

  const from = envVariableName(name);
  const environmentText = sources.processEnv[from];
  if (environmentText !== undefined) {
    const values = keepDeclared(environmentText, from, variable, declared, warnings);
    if (values.length > 0) return { variable: name, values, source: "environment", from };
  }

  for (const scope of SCOPES) {
    const scoped = sources.entries.filter(
      (entry) => entry.variable === name && entry.scope === scope,
    );
    if (scoped.length === 0) continue;

    const source = `factory.env.${name} in ${scope} Git config`;
    const kept = new Set<string>();
    for (const entry of scoped) {
      for (const value of keepDeclared(entry.value, source, variable, declared, warnings)) {
        kept.add(value);
      }
    }
    const values = declared.filter((value) => kept.has(value));
    // A scope that sets the key decides it, even when every value is ignored.
    if (values.length > 0) return { variable: name, values, source: "git", scope };
    break;
  }

  const defaults = (variable.default ?? []).filter((value) => declared.includes(value));
  if (defaults.length > 0) {
    const values = declared.filter((value) => defaults.includes(value));
    return { variable: name, values, source: "default" };
  }

  return { variable: name, values: [...declared], source: "all" };
}

/**
 * Resolves every declared variable's values from `--env`, the process
 * environment, Git config, the declared default and finally every value.
 *
 * A bad `--env` throws a `MetafabError` with exit 1; an undeclared value from
 * any other source is a warning and the next source applies.
 */
export async function resolveSelection(
  variables: readonly EnvVariable[],
  options: ResolveOptions,
): Promise<ResolvedSelection> {
  const optionValues = parseOptions(variables, options.options ?? []);

  const selection: Map<string, readonly string[]> = new Map();
  if (variables.length === 0) return { variables: [], selection, warnings: [] };

  const { entries, warnings: readWarnings } = await (options.readConfig ?? readEnvConfig)(
    options.root,
  );
  const sources: VariableSources = {
    optionValues,
    processEnv: options.processEnv ?? process.env,
    entries,
  };

  const warnings: Problem[] = [...readWarnings];
  const resolved: ResolvedVariable[] = [];
  for (const variable of variables) {
    const result = resolveVariable(variable, sources, warnings);
    resolved.push(result);
    selection.set(variable.name, result.values);
  }

  return { variables: resolved, selection, warnings };
}
