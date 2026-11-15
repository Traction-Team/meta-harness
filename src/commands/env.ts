import { findFactory } from "../core/discovery.js";
import {
  declaredVariablesFix,
  describeSelection,
  envOptions,
  envVariableName,
  isVariableName,
  resolveSelection,
  sourceWord,
  splitValues,
} from "../core/env/index.js";
import type {
  EnvVariable,
  EnvVariableReport,
  GitConfigScope,
  ResolvedVariable,
} from "../core/env/index.js";
import { loadFactory } from "../core/factory/index.js";
import { ExitCode, MetafabError } from "../errors.js";
import type { Problem } from "../errors.js";
import type { CommandResult } from "../output.js";
import { normalizeProblemPath } from "../util/fs.js";
import { runGit } from "../util/git.js";
import type { GitResult } from "../util/git.js";
import { didYouMean } from "../util/suggest.js";
import { changesSummary, runBuild } from "./build.js";
import type { CommandContext, CommandDefinition } from "./types.js";

const FACTORY_FILE = ".factory/factory.yaml";
const NO_VARIABLES = "This factory declares no environment variables.";

/** Git config scopes, highest priority first. */
const SCOPE_ORDER: readonly GitConfigScope[] = ["worktree", "local", "global", "system"];

/** How each scope is named in a fix line. */
const SCOPE_FLAG: Readonly<Record<GitConfigScope, string>> = {
  worktree: "--worktree",
  local: "--local",
  global: "--global",
  system: "--system",
};

type WriteMode = "set" | "unset";

function firstLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed !== "") return trimmed;
  }
  return "";
}

/** `env` reads only the factory's declaration, so only its errors block it. */
function factoryYamlErrors(problems: readonly Problem[]): Problem[] {
  return problems.filter(
    (problem) => problem.level === "error" && problem.file === FACTORY_FILE,
  );
}

function failed(command: string, problems: readonly Problem[]): CommandResult {
  return { ok: false, command, exitCode: ExitCode.Failed, problems: [...problems] };
}

function usageError(message: string, fix: string): MetafabError {
  return new MetafabError(message, {
    exitCode: ExitCode.Failed,
    problems: [{ level: "error", file: normalizeProblemPath("metafab"), message, fix }],
  });
}

/** `env set` and `env unset` write Git config, which needs Git itself. */
function gitMissing(variable: string): Problem {
  return {
    level: "error",
    file: normalizeProblemPath("metafab"),
    message: "Git is not installed",
    fix: `Set ${envVariableName(variable)}`,
  };
}

/**
 * Runs Git, reporting a missing binary rather than throwing. Every other failure
 * comes back as the result, because the exit code is the caller's business.
 */
async function git(
  args: string[],
  cwd: string,
): Promise<{ result: GitResult } | { missing: true }> {
  try {
    return { result: await runGit(args, { cwd }) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { missing: true };
    throw error;
  }
}

function selectionLines(reports: readonly EnvVariableReport[]): string {
  const nameWidth = Math.max(...reports.map((report) => report.name.length)) + 2;
  const valuesWidth =
    Math.max(...reports.map((report) => report.selected.join(", ").length)) + 2;

  return reports
    .map((report) => {
      const values = report.selected.join(", ");
      return `${report.name.padEnd(nameWidth)}${values.padEnd(valuesWidth)}${sourceWord(report)}`;
    })
    .join("\n");
}

async function runEnv(context: CommandContext): Promise<CommandResult> {
  const [first] = context.positionals;
  if (first !== undefined) {
    const message = `Unknown env subcommand "${first}"`;
    throw new MetafabError(message, {
      exitCode: ExitCode.Failed,
      problems: [
        {
          level: "error",
          file: normalizeProblemPath("metafab"),
          message,
          fix: didYouMean(first, ["set", "unset"]) ?? "Use metafab env set or metafab env unset",
        },
      ],
    });
  }

  const { root } = await findFactory(context.cwd, { command: "env" });
  const factory = await loadFactory(root);
  const errors = factoryYamlErrors(factory.problems);
  if (errors.length > 0) return failed("env", errors);

  const variables = factory.factoryYaml?.env ?? [];
  const selection = await resolveSelection(variables, {
    root: factory.root,
    options: envOptions(context.options.env),
  });
  const reports = describeSelection(variables, selection);

  const result: CommandResult = {
    ok: true,
    command: "env",
    exitCode: ExitCode.Ok,
    problems: [...selection.warnings],
    variables: reports,
  };

  if (context.options.json !== true) {
    result.summary = reports.length === 0 ? NO_VARIABLES : selectionLines(reports);
  }
  return result;
}

interface WriteTarget {
  variable: string;
  /** The values to write, for `set`. */
  values: string[];
}

function parseTarget(context: CommandContext, mode: WriteMode): WriteTarget {
  const command = `env ${mode}`;
  const shape = mode === "set" ? "<variable>=<values>" : "<variable>";

  if (context.positionals.length !== 1) {
    throw usageError(
      `metafab ${command} needs one ${shape}`,
      `Run metafab ${command} --help to see its options`,
    );
  }

  const argument = context.positionals[0]!;
  if (mode === "unset") return { variable: argument, values: [] };

  const equals = argument.indexOf("=");
  if (equals === -1) {
    throw usageError(
      `metafab env set needs <variable>=<values>: "${argument}"`,
      "Write metafab env set <variable>=<values>, such as metafab env set harness=opencode",
    );
  }

  const variable = argument.slice(0, equals);
  const values = splitValues(argument.slice(equals + 1));
  if (values.length === 0) {
    throw usageError(`metafab env set ${variable}= names no value`, `Run metafab env unset ${variable}`);
  }
  return { variable, values };
}

/** A variable and every value must be declared before `env set` writes them. */
function setProblems(
  declared: EnvVariable | undefined,
  target: WriteTarget,
  variables: readonly EnvVariable[],
): Problem[] {
  if (declared === undefined) {
    const declaredNames = variables.map((variable) => variable.name);
    return [
      {
        level: "error",
        file: FACTORY_FILE,
        message: `env set names unknown variable "${target.variable}"`,
        fix: didYouMean(target.variable, declaredNames) ?? declaredVariablesFix(declaredNames),
      },
    ];
  }

  const declaredValues = declared.values.map((value) => value.name);
  const problems: Problem[] = [];
  for (const value of target.values) {
    if (declaredValues.includes(value)) continue;
    problems.push({
      level: "error",
      file: FACTORY_FILE,
      line: declared.line,
      message: `Value "${value}" is not declared for "${declared.name}"`,
      fix: `Declared values: ${declaredValues.join(", ")}`,
    });
  }
  return problems;
}

function variableNameProblem(variable: string): Problem {
  return {
    level: "error",
    file: normalizeProblemPath("metafab"),
    message: `Variable name "${variable}" must start with a letter and use lowercase letters, digits and single hyphens`,
    fix: "Write the variable name with lowercase letters, digits and single hyphens, starting with a letter",
  };
}

/**
 * The selection the developer actually gets, after the write. When it comes
 * from a higher-priority source, the written value decides nothing, and saying
 * so is the point of these warnings.
 */
function overrideWarnings(
  resolved: ResolvedVariable,
  scope: GitConfigScope,
  declared: EnvVariable | undefined,
): Problem[] {
  const line = declared === undefined ? {} : { line: declared.line };

  if (resolved.source === "environment") {
    const from = resolved.from ?? envVariableName(resolved.variable);
    return [
      {
        level: "warning",
        file: FACTORY_FILE,
        ...line,
        message: `${from} is set and overrides Git config`,
        fix: `Unset ${from} to use the Git config value`,
      },
    ];
  }

  if (
    resolved.source === "git" &&
    resolved.scope !== undefined &&
    SCOPE_ORDER.indexOf(resolved.scope) < SCOPE_ORDER.indexOf(scope)
  ) {
    const key = `factory.env.${resolved.variable}`;
    return [
      {
        level: "warning",
        file: FACTORY_FILE,
        ...line,
        message: `${key} is also set in ${resolved.scope} config, which takes priority`,
        fix: `Remove it with git config ${SCOPE_FLAG[resolved.scope]} --unset-all ${key}`,
      },
    ];
  }

  return [];
}

function notRebuilt(variable: string, declared: EnvVariable | undefined): Problem {
  return {
    level: "warning",
    file: FACTORY_FILE,
    ...(declared === undefined ? {} : { line: declared.line }),
    message: `factory.env.${variable} changed, but the installed output was not rebuilt`,
    fix: "Fix the problems above, then run metafab build",
  };
}

async function runEnvWrite(context: CommandContext, mode: WriteMode): Promise<CommandResult> {
  const command = `env ${mode}`;
  const global = context.options.global === true;
  const scope: GitConfigScope = global ? "global" : "local";
  const target = parseTarget(context, mode);

  const { root } = await findFactory(context.cwd, { command });
  const factory = await loadFactory(root);
  const errors = factoryYamlErrors(factory.problems);
  if (errors.length > 0) return failed(command, errors);

  const variables = factory.factoryYaml?.env ?? [];
  const declared = variables.find((variable) => variable.name === target.variable);

  if (mode === "set") {
    const problems = setProblems(declared, target, variables);
    if (problems.length > 0) return failed(command, problems);
  } else if (!isVariableName(target.variable)) {
    return failed(command, [variableNameProblem(target.variable)]);
  }

  const key = `factory.env.${target.variable}`;

  if (!global) {
    const probe = await git(["rev-parse", "--git-dir"], root);
    if ("missing" in probe) return failed(command, [gitMissing(target.variable)]);
    if (probe.result.exitCode !== 0) {
      return failed(command, [
        {
          level: "error",
          file: normalizeProblemPath("metafab"),
          message: `metafab ${command} needs a Git repository for repository config`,
          fix: `Use --global, or set ${envVariableName(target.variable)}`,
        },
      ]);
    }
  }

  const prefix = ["config", ...(global ? ["--global"] : [])];
  let notSet = false;

  if (mode === "set") {
    const written = await git([...prefix, "--replace-all", key, target.values.join(",")], root);
    if ("missing" in written) return failed(command, [gitMissing(target.variable)]);
    if (written.result.exitCode !== 0) {
      return failed(command, [writeProblem(key, written.result)]);
    }
  } else {
    const written = await git([...prefix, "--unset-all", key], root);
    if ("missing" in written) return failed(command, [gitMissing(target.variable)]);
    // Git exits 5 when the key is not set, which `env unset` reports and moves on.
    if (written.result.exitCode === 5) notSet = true;
    else if (written.result.exitCode !== 0) {
      return failed(command, [writeProblem(key, written.result)]);
    }
  }

  const selection = await resolveSelection(variables, { root: factory.root });
  const resolved = selection.variables.find((variable) => variable.variable === target.variable);
  const warnings = resolved === undefined ? [] : overrideWarnings(resolved, scope, declared);

  const build = await runBuild(root, { json: true });
  const where = scope === "global" ? "global" : "repository";
  const summary =
    mode === "set"
      ? `factory.env.${target.variable} set to ${target.values.join(",")} in ${where} config`
      : notSet
        ? `factory.env.${target.variable} was not set in ${where} config`
        : `factory.env.${target.variable} removed from ${where} config`;

  const result: CommandResult = {
    ok: true,
    command,
    exitCode: ExitCode.Ok,
    variable: target.variable,
    scope,
    ...(mode === "set" ? { values: target.values } : { removed: !notSet }),
    changed: build.changed,
    hooks: build.hooks,
    problems: [...warnings],
  };

  if (build.exitCode !== ExitCode.Ok) {
    result.ok = false;
    result.exitCode = build.exitCode;
    result.problems = [...(build.problems ?? []), notRebuilt(target.variable, declared)];
    if (context.options.json !== true) result.summary = summary;
    return result;
  }

  if (context.options.json !== true) {
    result.summary = `${summary}\n${changesSummary(build.changed, build.hooks)}`;
  }
  return result;
}

function writeProblem(key: string, result: GitResult): Problem {
  const reason = firstLine(result.stderr) || `git config exited with status ${result.exitCode}`;
  return {
    level: "error",
    file: normalizeProblemPath("metafab"),
    message: `Cannot change ${key} in Git config: ${reason}`,
    fix: "Fix the Git config file, then run the command again",
  };
}

export const envCommand: CommandDefinition = {
  name: "env",
  description: "Show each environment variable, its selected values and where they came from",
  usage: "metafab env",
  options: {
    env: {
      type: "string",
      multiple: true,
      value: "<variable>=<values>",
      description: "Preview a selection instead of the configured one",
    },
  },
  run: runEnv,
};

export const envSetCommand: CommandDefinition = {
  name: "env set",
  description: "Set a variable's values in Git config, then build",
  usage: "metafab env set <variable>=<values> [--global]",
  arguments: [
    {
      name: "variable=values",
      description: "The variable and its values, such as harness=opencode,claude",
    },
  ],
  options: {
    global: {
      type: "boolean",
      description: "Write global Git config instead of this repository's",
    },
  },
  run: (context) => runEnvWrite(context, "set"),
};

export const envUnsetCommand: CommandDefinition = {
  name: "env unset",
  description: "Remove a variable's values from Git config, then build",
  usage: "metafab env unset <variable> [--global]",
  arguments: [{ name: "variable", description: "The variable to remove, declared or not" }],
  options: {
    global: {
      type: "boolean",
      description: "Write global Git config instead of this repository's",
    },
  },
  run: (context) => runEnvWrite(context, "unset"),
};
