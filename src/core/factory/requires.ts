import { lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { Problem } from "../../errors.js";
import { readdirTyped } from "../../util/fs.js";
import { FACTORY_TEMPLATES_PREFIX, factoryRelative, requirementPathProblem } from "../requires/paths.js";
import { isInsideAbsolute } from "../sources/containment.js";
import type { Factory, Requirement } from "./types.js";

function isAbsentError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function templateProblem(requirement: Requirement, file: string, message: string, fix: string): Problem {
  return { level: "error", file, line: requirement.line, message, fix };
}

function skillProblem(requirement: Requirement, file: string, template: string): Problem {
  return templateProblem(
    requirement,
    file,
    `Template "${template}" is part of a skill, so it would be installed`,
    "Move it out of the skill directory",
  );
}

/**
 * Rule 13's skill half: no directory from `.factory/templates/` down to the
 * template's own directory may hold an entry named `SKILL.md`, in any case, so
 * the template is never installed as part of a skill. The check reads each
 * directory itself with `readdirTyped` rather than using `factory.skills`,
 * because discovery skips dot directories and matches `SKILL.md` exactly.
 */
async function skillTemplateProblem(
  factory: Factory,
  requirement: Requirement,
  template: string,
  file: string,
): Promise<Problem | undefined> {
  const relative = factoryRelative(template);
  const segments = relative.split("/");
  const base = segments[segments.length - 1] ?? "";
  if (base.toLowerCase() === "skill.md") return skillProblem(requirement, file, template);

  for (let depth = 1; depth < segments.length; depth += 1) {
    const parts = segments.slice(0, depth);
    const relativeDir = parts.join("/");
    const directory = path.join(factory.dir, ...parts);

    let entries;
    try {
      entries = await readdirTyped(directory);
    } catch (error) {
      // An absent directory is reported by the template's own existence check.
      if (isAbsentError(error)) return undefined;
      return {
        level: "error",
        file: `.factory/${relativeDir}`,
        line: 1,
        message: `Cannot read directory .factory/${relativeDir}`,
        fix: "Check its permissions or restore the directory",
      };
    }

    if (entries.some((entry) => entry.name.toLowerCase() === "skill.md")) {
      return skillProblem(requirement, file, template);
    }
  }

  return undefined;
}

/**
 * Rule 13: each `requires` template is a file under `.factory/templates/` that
 * `import` and `update` may copy, and that `build` never installs as a skill.
 * A caller has already parsed `factory.yaml`, so a template with no prefix or
 * an unsafe path is reported here rather than by rule 12.
 */
export async function requirementTemplateProblems(
  factory: Factory,
  requires: Requirement[],
  file: string,
): Promise<Problem[]> {
  const problems: Problem[] = [];
  const factoryReal = await realpath(factory.dir).catch(() => undefined);

  for (const requirement of requires) {
    const template = requirement.template;
    if (template === undefined) continue;

    if (
      !template.startsWith(FACTORY_TEMPLATES_PREFIX) ||
      requirementPathProblem(factoryRelative(template)) !== undefined
    ) {
      problems.push(
        templateProblem(
          requirement,
          file,
          `Template "${template}" must be a file in .factory/templates/`,
          "Move the template into .factory/templates/ and update the path",
        ),
      );
      continue;
    }

    const skill = await skillTemplateProblem(factory, requirement, template, file);
    if (skill !== undefined) {
      problems.push(skill);
      continue;
    }

    const absolute = path.join(factory.root, ...template.split("/"));
    let info;
    try {
      info = await lstat(absolute);
    } catch (error) {
      if (isAbsentError(error)) {
        problems.push(
          templateProblem(
            requirement,
            file,
            `Template "${template}" does not exist`,
            "Add the file or correct the path",
          ),
        );
      } else {
        problems.push(
          templateProblem(
            requirement,
            file,
            `Cannot read file ${template}`,
            "Check its permissions or restore the file",
          ),
        );
      }
      continue;
    }

    const notRegular = (): void => {
      problems.push(
        templateProblem(
          requirement,
          file,
          `Template "${template}" is not a regular file inside .factory/`,
          "Replace it with a file",
        ),
      );
    };

    if (info.isSymbolicLink()) {
      let resolved: string;
      try {
        resolved = await realpath(absolute);
      } catch {
        notRegular();
        continue;
      }
      if (factoryReal === undefined || !isInsideAbsolute(factoryReal, resolved)) {
        notRegular();
        continue;
      }
      const target = await stat(resolved).catch(() => undefined);
      if (target === undefined || !target.isFile()) notRegular();
      continue;
    }

    if (!info.isFile()) notRegular();
  }

  return problems;
}
