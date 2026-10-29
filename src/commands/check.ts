import { createRequire } from "node:module";
import { runCheck } from "../core/check/index.js";
import { findFactory } from "../core/discovery.js";
import { ExitCode } from "../errors.js";
import type { Problem } from "../errors.js";
import type { CommandResult } from "../output.js";
import type { CommandDefinition } from "./types.js";

function cliVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require("../../package.json") as { version?: unknown };
  return typeof pkg.version === "string" ? pkg.version : "0.0.0";
}

function countProblems(problems: readonly Problem[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const problem of problems) {
    if (problem.level === "error") errors += 1;
    else warnings += 1;
  }
  return { errors, warnings };
}

function problemsSummary(problems: readonly Problem[]): string {
  const { errors, warnings } = countProblems(problems);
  const errorText = `${errors} error${errors === 1 ? "" : "s"}`;
  const warningText = `${warnings} warning${warnings === 1 ? "" : "s"}`;
  return `${errorText}, ${warningText}`;
}

export const checkCommand: CommandDefinition = {
  name: "check",
  description: "Validate the factory and its installed output",
  async run(context) {
    const location = await findFactory(context.cwd);
    const problems = await runCheck(location.root, cliVersion());
    const { errors } = countProblems(problems);

    const result: CommandResult = {
      ok: errors === 0,
      command: "check",
      exitCode: errors === 0 ? ExitCode.Ok : ExitCode.Failed,
      problems: [...problems],
    };

    if (context.options.json !== true) result.summary = problemsSummary(problems);
    return result;
  },
};
