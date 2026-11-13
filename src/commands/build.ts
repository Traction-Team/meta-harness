import { applyBuild, planBuild } from "../core/build/index.js";
import type { BuildChange } from "../core/build/index.js";
import { dedupeReadErrors } from "../core/build/skill.js";
import { loadConfig } from "../core/config/load.js";
import { findFactory } from "../core/discovery.js";
import { loadFactory } from "../core/factory/index.js";
import type { HookChange } from "../core/hooks/index.js";
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

function changesSummary(
  changed: readonly BuildChange[],
  hooks: readonly HookChange[] = [],
): string {
  const lines = [
    ...changed.map((change) => `${ACTION_MARK[change.action]} ${change.path}`),
    ...hooks.map((change) => `${ACTION_MARK[change.action]} git hook ${change.hook}`),
  ];
  if (lines.length === 0) return "Up to date.";

  const total = lines.length === 1 ? "1 file changed." : `${lines.length} files changed.`;
  return [...lines, total].join("\n");
}

function failed(exitCode: ExitCode, problems: readonly Problem[]): CommandResult {
  return {
    ok: false,
    command: "build",
    exitCode,
    changed: [],
    problems: [...problems],
  };
}

export const buildCommand: CommandDefinition = {
  name: "build",
  description: "Compile the factory for the configured agent tools",
  usage: "metafab build",
  async run(context) {
    const location = await findFactory(context.cwd, { command: "build" });
    const factory = await loadFactory(location.root);
    const config = await loadConfig(factory.dir);

    const loadedProblems = dedupeReadErrors([...factory.problems, ...config.problems]);
    if (loadedProblems.some((problem) => problem.level === "error")) {
      return failed(ExitCode.Failed, loadedProblems);
    }
    const loadedWarnings = loadedProblems.filter((problem) => problem.level === "warning");

    const plan = await planBuild(factory, config, cliVersion());
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
    const result: CommandResult = {
      ok: true,
      command: "build",
      exitCode: ExitCode.Ok,
      changed: report.changed,
      hooks: report.hooks,
      problems,
    };

    if (context.options.json !== true) {
      result.summary = changesSummary(report.changed, report.hooks);
    }
    return result;
  },
};
