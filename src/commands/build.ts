import path from "node:path";
import { applyBuild, planBuild, planPreview, writePreview } from "../core/build/index.js";
import type { BuildChange } from "../core/build/index.js";
import { dedupeReadErrors } from "../core/build/skill.js";
import { loadConfig } from "../core/config/load.js";
import { findFactory } from "../core/discovery.js";
import { describeSelection, envOptions, resolveSelection } from "../core/env/index.js";
import type { EnvVariableReport, ResolvedSelection } from "../core/env/index.js";
import { loadFactory } from "../core/factory/index.js";
import type { HookChange } from "../core/hooks/index.js";
import { hookChangeLines } from "../core/hooks/index.js";
import { ExitCode } from "../errors.js";
import type { Problem } from "../errors.js";
import type { CommandResult } from "../output.js";
import { toPosixPath } from "../util/fs.js";
import { cliVersion } from "../util/version.js";
import type { CommandDefinition } from "./types.js";

const ACTION_MARK = {
  created: "+",
  updated: "~",
  removed: "-",
} as const;

export function changesSummary(
  changed: readonly BuildChange[] = [],
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
  /** Present for a build; a preview changes nothing in the repository. */
  changed?: BuildChange[];
  hooks?: HookChange[];
  /** The directory a preview wrote into, absolute and with `/` separators. */
  out?: string;
  /** The files a preview wrote, relative to `out`. */
  written?: string[];
  /** The `variables` list `env` reports, when the factory declares variables. */
  env?: EnvVariableReport[];
}

export interface RunBuildOptions {
  /** Raw `--env` arguments; absent reads the process environment and Git config. */
  env?: readonly string[];
  /** Write a preview into this directory instead of building the repository. */
  out?: string;
  /** True when the caller renders JSON, so the result needs no summary. */
  json?: boolean;
}

/** A failed build: it reports the problems and the output it did not change. */
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

/** A failed preview: it changed nothing, so it reports no change. */
function previewFailed(exitCode: ExitCode, problems: readonly Problem[]): BuildResult {
  return { ok: false, command: "build", exitCode, problems: [...problems] };
}

/**
 * The preview's summary: one `+ <out>/<path>` line per file, then what was
 * previewed and for which selection. It names the directory as resolved, because
 * that is where the files are.
 */
function previewSummary(
  written: readonly string[],
  out: string,
  selection: ResolvedSelection,
): string {
  if (written.length === 0) return "Nothing to preview: agents is empty.";

  const files = written.length === 1 ? "1 file" : `${written.length} files`;
  const selected = selection.variables.map(
    (variable) => `${variable.variable}=${variable.values.join(",")}`,
  );
  // A format 1 factory declares no variables, so there is nothing to name.
  const clause = selected.length === 0 ? "" : ` for ${selected.join(", ")}`;
  return [
    ...written.map((file) => `+ ${out}/${file}`),
    `Previewed ${files} in ${out}${clause}.`,
  ].join("\n");
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

  if (options.out !== undefined) {
    // An empty --out is planPreview's error; resolving it would name the cwd.
    const out = options.out === "" ? "" : path.resolve(cwd, options.out);
    const plan = await planPreview(factory, config, cliVersion(), out, { selection });
    const warnings = [...loadedWarnings, ...plan.warnings];

    if (plan.conflicts.length > 0) {
      return previewFailed(
        ExitCode.NotOwned,
        dedupeReadErrors([...plan.conflicts, ...plan.errors, ...warnings]),
      );
    }
    if (plan.errors.length > 0) {
      return previewFailed(ExitCode.Failed, dedupeReadErrors([...plan.errors, ...warnings]));
    }

    // Writes are exclusive, and a failure rolls them back and throws with its
    // exit code; neither the repository scan nor the build itself runs.
    const written = (await writePreview(plan)).map((change) => change.path);
    const directory = toPosixPath(plan.out);
    const result: BuildResult = {
      ok: true,
      command: "build",
      exitCode: ExitCode.Ok,
      out: directory,
      written,
      problems: [...warnings],
    };
    if (variables.length > 0) result.env = describeSelection(variables, selection);
    if (options.json !== true) {
      result.summary = previewSummary(written, directory, selection);
    }
    return result;
  }

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
  usage: "metafab build [--env <variable>=<values>]... [--out <dir>]",
  options: {
    env: {
      type: "string",
      multiple: true,
      value: "<variable>=<values>",
      description: "Select an environment for this build",
    },
    out: {
      type: "string",
      value: "<dir>",
      description: "Write a preview of the output to a directory instead of the repository",
    },
  },
  run(context) {
    return runBuild(context.cwd, {
      env: envOptions(context.options.env),
      ...(typeof context.options.out === "string" ? { out: context.options.out } : {}),
      json: context.options.json === true,
    });
  },
};
