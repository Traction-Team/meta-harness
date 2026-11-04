import type { Problem } from "../../errors.js";
import { planBuild } from "../build/plan.js";
import { dedupeReadErrors } from "../build/skill.js";
import { loadConfig } from "../config/load.js";
import { loadFactory } from "../factory/load.js";
import { compareBuildOutput } from "./drift.js";
import { scanFactoryFiles } from "./markers.js";

export { compareBuildOutput } from "./drift.js";
export { scanFactoryFiles } from "./markers.js";

/** The report always shows a line; a problem about a path reports line 1. */
function withLine(problem: Problem): Problem {
  return problem.line === undefined ? { ...problem, line: 1 } : problem;
}

function problemKey(problem: Problem): string {
  return [
    problem.level,
    problem.file,
    problem.line ?? "",
    problem.message,
    problem.fix ?? "",
  ].join("\u0000");
}

/**
 * Validates the factory source, its configuration and the installed output.
 *
 * Problems come back in report order: factory problems, configuration
 * problems, build errors, conflict markers, `.upstream` files, build drift and
 * finally build warnings. Drift and warnings are skipped when an error leaves
 * the build planner without a valid model.
 */
export async function runCheck(root: string, cliVersion: string): Promise<Problem[]> {
  const factory = await loadFactory(root);
  const config = await loadConfig(factory.dir);

  const collected: Problem[] = [];
  const seen = new Set<string>();
  const add = (problem: Problem): void => {
    const next = withLine(problem);
    const key = problemKey(next);
    if (seen.has(key)) return;
    seen.add(key);
    collected.push(next);
  };

  for (const problem of factory.problems) add(problem);
  for (const problem of config.problems) add(problem);

  const plan = await planBuild(factory, config, cliVersion);
  for (const problem of plan.errors) add(problem);

  // The factory loader words its read errors as "Cannot read file <path>" or
  // "Cannot read directory <path>". One read error per path is the contract,
  // and a directory that cannot be read covers the paths inside it.
  const plannerHasErrors = dedupeReadErrors(collected).some(
    (problem) => problem.level === "error",
  );

  for (const problem of await scanFactoryFiles(root)) add(problem);

  const problems = dedupeReadErrors(collected);

  if (plannerHasErrors) {
    problems.push({
      level: "warning",
      file: ".factory",
      line: 1,
      message: "Build output not checked: fix the errors above first",
      fix: "Fix the errors above, then run metafab check again",
    });
    return problems;
  }

  problems.push(...(await compareBuildOutput(factory, config, plan, cliVersion)).map(withLine));
  problems.push(...plan.warnings.map(withLine));
  return problems;
}
