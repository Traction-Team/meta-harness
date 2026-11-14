import type { Problem } from "../../errors.js";
import type { Factory } from "../factory/types.js";
import { requirementTemplateProblems } from "../factory/requires.js";
import { inspectRequirement } from "./inspect.js";
import { requirementPathProblem } from "./paths.js";

/** The prefix of the required path that a case-variant clash stands in for. */
function expectedSpelling(requiredPath: string, clash: string): string {
  const segments = clash.split("/").length;
  return requiredPath.split("/").slice(0, segments).join("/");
}

/**
 * Warnings for the repository files a factory requires. A missing file is the
 * person's to create, and an entry in the way is theirs to move, so neither is
 * an error: the factory itself is valid, and a repository may choose not to
 * create a file. A present file says nothing, with or without a template;
 * whether it holds what the fab needs is the person's call.
 *
 * A path or template that rule 12 or 13 already rejected is skipped: it is an
 * error with its own fix, and a warning telling the person to create the file
 * would contradict it.
 */
export async function requirementWarnings(factory: Factory): Promise<Problem[]> {
  const problems: Problem[] = [];

  for (const requirement of factory.factoryYaml?.requires ?? []) {
    if (requirementPathProblem(requirement.path) !== undefined) continue;

    if (requirement.template !== undefined) {
      const templateProblems = await requirementTemplateProblems(
        factory,
        [requirement],
        ".factory/factory.yaml",
      );
      if (templateProblems.length > 0) continue;
    }

    const result = await inspectRequirement(factory.root, requirement);

    if (result.state === "missing") {
      problems.push({
        level: "warning",
        file: ".factory/factory.yaml",
        line: requirement.line,
        message: `Required file ${requirement.path} is missing: ${requirement.description}`,
        fix:
          requirement.template === undefined
            ? `Create ${requirement.path}`
            : `Copy ${requirement.template} to ${requirement.path}`,
      });
      continue;
    }

    if (result.state !== "blocked" || result.clash === undefined) continue;

    const reason = result.reason ?? "";
    const caseVariant = reason.endsWith("differs only in letter case");
    problems.push({
      level: "warning",
      file: ".factory/factory.yaml",
      line: requirement.line,
      message: `Required file ${requirement.path} cannot be created: ${reason}`,
      fix: reason.startsWith("Cannot read ")
        ? `Check the permissions of ${result.clash}, then run metafab check again`
        : caseVariant
          ? `Rename ${result.clash} to match ${expectedSpelling(requirement.path, result.clash)}, or move it away, then create ${requirement.path}`
          : `Move ${result.clash} away, then create ${requirement.path}`,
    });
  }

  return problems;
}
