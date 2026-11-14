import type { Problem } from "../../errors.js";
import type { Factory } from "../factory/types.js";
import { inspectRequirement } from "./inspect.js";

/**
 * Warnings for the repository files a factory requires. A missing file is the
 * person's to create, and an entry in the way is theirs to move, so neither is
 * an error: the factory itself is valid, and a repository may choose not to
 * create a file. A present file says nothing, with or without a template;
 * whether it holds what the fab needs is the person's call.
 */
export async function requirementWarnings(factory: Factory): Promise<Problem[]> {
  const problems: Problem[] = [];

  for (const requirement of factory.factoryYaml?.requires ?? []) {
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
    problems.push({
      level: "warning",
      file: ".factory/factory.yaml",
      line: requirement.line,
      message: `Required file ${requirement.path} cannot be created: ${reason}`,
      fix: reason.startsWith("Cannot read ")
        ? `Check the permissions of ${result.clash}, then run metafab check again`
        : `Move ${result.clash} away, then create ${requirement.path}`,
    });
  }

  return problems;
}
