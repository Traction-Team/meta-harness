import type { Problem } from "../../errors.js";
import { planBuild } from "../build/plan.js";
import { loadConfig } from "../config/load.js";
import { loadFactory } from "../factory/load.js";
import { compareBuildOutput } from "./drift.js";
import { scanConflictMarkers, scanUpstreamFiles } from "./markers.js";

export { compareBuildOutput } from "./drift.js";
export { scanConflictMarkers, scanUpstreamFiles } from "./markers.js";

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

  const problems: Problem[] = [];
  const seen = new Set<string>();
  const add = (problem: Problem): void => {
    const key = problemKey(problem);
    if (seen.has(key)) return;
    seen.add(key);
    problems.push(problem);
  };

  for (const problem of factory.problems) add(problem);
  for (const problem of config.problems) add(problem);

  const plan = await planBuild(factory, config, cliVersion);
  for (const problem of plan.errors) add(problem);

  const plannerHasErrors = problems.some((problem) => problem.level === "error");

  for (const problem of await scanConflictMarkers(root)) problems.push(problem);
  for (const problem of await scanUpstreamFiles(root)) problems.push(problem);

  if (plannerHasErrors) {
    problems.push({
      level: "warning",
      file: ".factory",
      message: "Build output not checked: fix the errors above first",
    });
    return problems;
  }

  problems.push(...(await compareBuildOutput(factory, config, plan, cliVersion)));
  problems.push(...plan.warnings);
  return problems;
}
