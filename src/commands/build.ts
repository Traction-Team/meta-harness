import { applyBuild, planBuild } from "../core/build/index.js";
import type { BuildChange } from "../core/build/index.js";
import { dedupeReadErrors } from "../core/build/skill.js";
import { loadConfig } from "../core/config/load.js";
import { findFactory } from "../core/discovery.js";
import { describeSelection, envOptions, resolveSelection } from "../core/env/index.js";
import type { EnvVariableReport } from "../core/env/index.js";
import { loadFactory } from "../core/factory/index.js";
import type { HookChange } from "../core/hooks/index.js";
import { hookChangeLines } from "../core/hooks/index.js";
import { ExitCode } from "../errors.js";
import type { Problem } from "../errors.js";
import type { CommandResult } from "../output.js";
import { cliVersion } from "../util/version.js";
import type { CommandDefinition } from "./types.js";

const ACTION_MARK = {
  created: "+",
  updated: "~",
  removed: "-",
} as const;

export function changesSummary(
  changed: readonly BuildChange[],
  hooks: readonly HookChange[] = [],
): string {
  const lines = [
    ...changed.map((change) => `${ACTION_MARK[change.action]} ${change.path}`),
    ...hookChangeLines(hooks),
  ];
  if (lines.length === 0) return "Up to date.";

  const total = lines.length === 1 ? "1 file changed." : `${lines.length} files changed.`;
  return [...lines, total].join("\n");
}

export interface BuildResult extends CommandResult {
  changed: BuildChange[];
  hooks: HookChange[];
  /** The `variables` list `env` reports, when the factory declares variables. */
  env?: EnvVariableReport[];
}

export interface RunBuildOptions {
  /** Raw `--env` arguments; absent reads the process environment and Git config. */
  env?: readonly string[];
  /** True when the caller renders JSON, so the result needs no summary. */
  json?: boolean;
}

function failed(exitCode: ExitCode, problems: readonly Problem[]): BuildResult {
  return {
    ok: false,
    command: "build",
    exitCode,
    changed: [],
    hooks: [],
    problems: [...problems],
  };
}

/**
 * The whole of `metafab build`, so `env set` and `env unset` rebuild with it.
 * Load errors stop it before `--env` is read; a bad `--env` then throws.
 */
export async function runBuild(cwd: string, options: RunBuildOptions = {}): Promise<BuildResult> {
  const location = await findFactory(cwd, { command: "build" });
  const factory = await loadFactory(location.root);
  const config = await loadConfig(factory.dir);

  const loadedProblems = dedupeReadErrors([...factory.problems, ...config.problems]);
  if (loadedProblems.some((problem) => problem.level === "error")) {
    return failed(ExitCode.Failed, loadedProblems);
  }
  const loadedWarnings = loadedProblems.filter((problem) => problem.level === "warning");

  const variables = factory.factoryYaml?.env ?? [];
  const selection = await resolveSelection(variables, {
    root: factory.root,
    ...(options.env === undefined ? {} : { options: options.env }),
  });

  const plan = await planBuild(factory, config, cliVersion(), { selection });
  const warnings = [...loadedWarnings, ...plan.warnings];

  if (plan.conflicts.length > 0) {
    return failed(
      ExitCode.NotOwned,
      dedupeReadErrors([...plan.conflicts, ...plan.errors, ...warnings]),
    );
  }
  if (plan.errors.length > 0) {
    return failed(ExitCode.Failed, dedupeReadErrors([...plan.errors, ...warnings]));
  }

  const report = await applyBuild(plan);
  const problems = [...warnings, ...report.hookWarnings];
  const result: BuildResult = {
    ok: true,
    command: "build",
    exitCode: ExitCode.Ok,
    changed: report.changed,
    hooks: report.hooks,
    problems,
  };
  if (variables.length > 0) result.env = describeSelection(variables, selection);

  if (options.json !== true) result.summary = changesSummary(report.changed, report.hooks);
  return result;
}

export const buildCommand: CommandDefinition = {
  name: "build",
  description: "Compile the factory for the configured agent tools",
  usage: "metafab build [--env <variable>=<values>]...",
  options: {
    env: {
      type: "string",
      multiple: true,
      value: "<variable>=<values>",
      description: "Select an environment for this build",
    },
  },
  run(context) {
    return runBuild(context.cwd, {
      env: envOptions(context.options.env),
      json: context.options.json === true,
    });
  },
};
