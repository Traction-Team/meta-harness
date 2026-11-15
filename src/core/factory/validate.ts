import { isScalar } from "yaml";
import type { Problem } from "../../errors.js";
import { isSingleLine } from "../../util/text.js";
import { didYouMean } from "../../util/suggest.js";
import { requirementPathProblem } from "../requires/paths.js";
import { descriptionLine, nameLine } from "./lines.js";
import type { Factory, PipelineEntry, Requirement, Skill } from "./types.js";

export const KNOWN_FACTORY_FIELDS = [
  "format",
  "name",
  "description",
  "pipeline",
  "requires",
  "env",
] as const;
export const RESERVED_PIPELINE_OPTIONS = ["stage", "find", "where"] as const;
export const RESERVED_CONTAINERS = [
  "workflows",
  "skills",
  "templates",
  "scripts",
  "scorers",
  "rules",
  "runtimes",
] as const;

const MAX_SKILL_NAME_LENGTH = 64;
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FACTORY_NAME_PATTERN = /^[a-z0-9-]+$/;
const YAML_INTEGER_PATTERN = /^(?:[-+]?[0-9]+|0o[0-7]+|0x[0-9a-fA-F]+)$/;
const RESERVED_PREFIX = "metafab";

export function skillFile(skill: Skill): string {
  return `.factory/${skill.relDir}/SKILL.md`;
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SKILL_NAME_LENGTH)
    .replace(/-+$/g, "");
  return slug === "" ? "skill" : slug;
}

/** Rule 5's name rules, which env variable and value names follow too. */
export function isNameFormatted(name: string): boolean {
  return name.length <= MAX_SKILL_NAME_LENGTH && SKILL_NAME_PATTERN.test(name);
}

export function rule1RequiredFields(skill: Skill): Problem[] {
  const problems: Problem[] = [];
  const file = skillFile(skill);

  if (skill.frontmatter.name === undefined) {
    problems.push({
      level: "error",
      file,
      line: skill.frontmatterLines.start,
      message: 'SKILL.md is missing a "name" field',
      fix: `Add a name: ${skill.name} field`,
    });
  }

  if (skill.frontmatter.description === undefined) {
    problems.push({
      level: "error",
      file,
      line: skill.frontmatterLines.start,
      message: 'SKILL.md is missing a "description" field',
      fix: "Add a description field",
    });
  }

  return problems;
}

export function rule2NameMatchesDirectory(skill: Skill): Problem[] {
  const name = skill.frontmatter.name;
  if (typeof name !== "string" || name === "" || name === skill.name) return [];

  return [
    {
      level: "error",
      file: skillFile(skill),
      line: nameLine(skill),
      message: `Skill name "${name}" does not match its directory "${skill.name}"`,
      fix: `Change name to '${skill.name}' or rename the directory`,
    },
  ];
}

export function ruleTopLevelSkill(file: string): Problem[] {
  return [
    {
      level: "error",
      file,
      line: 1,
      message: "SKILL.md must live inside a skill directory",
      fix: "Move it into a directory such as .factory/skills/<name>/SKILL.md",
    },
  ];
}

export function rule3NoNestedSkills(file: string, line: number, nestedDir: string, parentDir: string): Problem[] {
  return [
    {
      level: "error",
      file,
      line,
      message: `Nested skill directory: "${nestedDir}"`,
      fix: `Move ${nestedDir} out of ${parentDir}`,
    },
  ];
}

export function rule4UniqueNames(skills: Skill[]): Problem[] {
  const problems: Problem[] = [];
  const firstByName = new Map<string, Skill>();

  for (const skill of skills) {
    const name = skill.frontmatter.name;
    if (typeof name !== "string" || name === "") continue;

    const first = firstByName.get(name);
    if (first === undefined) {
      firstByName.set(name, skill);
      continue;
    }

    problems.push({
      level: "error",
      file: skillFile(skill),
      line: nameLine(skill),
      message: `Duplicate skill name "${name}"`,
      fix: `Rename one of: ${skillFile(first)}, ${skillFile(skill)}`,
    });
  }

  return problems;
}

export function rule5NameFormat(skill: Skill): Problem[] {
  const name = skill.frontmatter.name;
  if (typeof name !== "string" || name === "") return [];
  if (isNameFormatted(name)) return [];

  return [
    {
      level: "error",
      file: skillFile(skill),
      line: nameLine(skill),
      message: `Skill name "${name}" is not a valid Agent Skill name`,
      fix: `Use a name like '${slugify(name)}'`,
    },
  ];
}

export function rule6SkillGrammar(skill: Skill): Problem[] {
  const problems: Problem[] = [];
  const file = skillFile(skill);
  const name = skill.frontmatter.name;

  if (name !== undefined && (typeof name !== "string" || name === "")) {
    problems.push({
      level: "error",
      file,
      line: nameLine(skill),
      message: '"name" must be a non-empty string',
      fix: `Add a name: ${skill.name} field`,
    });
  }

  const description = skill.frontmatter.description;
  if (description !== undefined) {
    if (typeof description !== "string" || description === "") {
      problems.push({
        level: "error",
        file,
        line: descriptionLine(skill),
        message: '"description" must be a non-empty string',
        fix: "Write a one-line description",
      });
    } else if (!isSingleLine(description)) {
      problems.push({
        level: "error",
        file,
        line: descriptionLine(skill),
        message: '"description" must be a single line',
        fix: "Write the description on one line",
      });
    }
  }

  return problems;
}

export interface FactoryField {
  value: unknown;
  line: number;
  node?: unknown;
}

/** The format a `format` field declares, when it is the plain YAML integer 1 or 2. */
export function knownFormat(field: FactoryField): 1 | 2 | undefined {
  const node = field.node;
  const value = node === undefined ? field.value : isScalar(node) ? node.value : undefined;
  if (value !== 1 && value !== 2) return undefined;
  if (node === undefined) return value;
  if (!isScalar(node) || node.type !== "PLAIN") return undefined;
  if (typeof node.source !== "string" || !YAML_INTEGER_PATTERN.test(node.source)) return undefined;
  return value;
}

export function rule7FactoryYaml(
  file: string,
  fields: { format?: FactoryField; name?: FactoryField },
): Problem[] {
  const problems: Problem[] = [];

  if (fields.format === undefined) {
    problems.push({
      level: "error",
      file,
      line: 1,
      message: 'factory.yaml is missing "format"',
      fix: "Add format: 1",
    });
  } else if (knownFormat(fields.format) === undefined) {
    problems.push({
      level: "error",
      file,
      line: fields.format.line,
      message: '"format" must be 1 or 2',
      fix: "Set format: 2 to use env, or format: 1",
    });
  }

  if (fields.name === undefined) {
    problems.push({
      level: "error",
      file,
      line: 1,
      message: 'factory.yaml is missing "name"',
      fix: "Add a name field",
    });
  }

  return problems;
}

export function rule8PipelineWorkflows(pipeline: PipelineEntry[], skills: Skill[]): Problem[] {
  const problems: Problem[] = [];
  const file = ".factory/factory.yaml";
  const workflowNames = skills.filter((skill) => skill.isWorkflow).map((skill) => skill.name);
  const workflowSet = new Set(workflowNames);
  const otherSkillNames = new Set(
    skills.filter((skill) => !skill.isWorkflow).map((skill) => skill.name),
  );
  const seen = new Set<string>();

  for (const entry of pipeline) {
    if (!workflowSet.has(entry.workflow)) {
      const suggestion = didYouMean(entry.workflow, workflowNames);
      const isNonWorkflowSkill = otherSkillNames.has(entry.workflow);
      problems.push({
        level: "error",
        file,
        line: entry.line,
        message: isNonWorkflowSkill
          ? `Pipeline entry "${entry.workflow}" is a skill, not a workflow`
          : `Pipeline names unknown workflow "${entry.workflow}"`,
        fix:
          suggestion ??
          (isNonWorkflowSkill
            ? "Move the skill under .factory/workflows/ or remove the entry"
            : "Add it under .factory/workflows/ or remove the entry"),
      });
      continue;
    }

    if (seen.has(entry.workflow)) {
      problems.push({
        level: "error",
        file,
        line: entry.line,
        message: `Duplicate pipeline entry "${entry.workflow}"`,
        fix: `Remove one of the "${entry.workflow}" entries`,
      });
    } else {
      seen.add(entry.workflow);
    }
  }

  return problems;
}

export function rule9PipelineOptions(file: string, key: string, line: number): Problem[] {
  if (!(RESERVED_PIPELINE_OPTIONS as readonly string[]).includes(key)) return [];

  return [
    {
      level: "error",
      file,
      line,
      message: `Pipeline option "${key}" is reserved for a future version`,
      fix: `Remove the "${key}" option`,
    },
  ];
}

/** Rule 12: a required path is safe to create in any repository. */
export function rule12RequirementPath(file: string, requirement: Requirement): Problem[] {
  const phrase = requirementPathProblem(requirement.path);
  if (phrase === undefined) return [];

  return [
    {
      level: "error",
      file,
      line: requirement.line,
      message: `Required path "${requirement.path}" ${phrase}`,
      fix: "Use a repository-relative file path outside .factory/, such as docs/factory.md",
    },
  ];
}

/**
 * Rule 12, uniqueness: no two required paths are equal when letter case is
 * ignored, and none is below another. The entry listed later is the one
 * reported, because it is the one that repeats or nests.
 */
export function rule12UniqueRequirements(file: string, requirements: Requirement[]): Problem[] {
  const problems: Problem[] = [];

  for (let index = 0; index < requirements.length; index += 1) {
    const later = requirements[index]!;
    const folded = later.path.toLowerCase();

    for (let earlierIndex = 0; earlierIndex < index; earlierIndex += 1) {
      const earlier = requirements[earlierIndex]!;
      const earlierFolded = earlier.path.toLowerCase();

      if (folded === earlierFolded) {
        problems.push({
          level: "error",
          file,
          line: later.line,
          message: `Required path "${later.path}" repeats "${earlier.path}"`,
          fix: "Remove one of the entries",
        });
        break;
      }

      const [container, contained]: [Requirement | undefined, Requirement | undefined] =
        folded.startsWith(`${earlierFolded}/`)
          ? [earlier, later]
          : earlierFolded.startsWith(`${folded}/`)
            ? [later, earlier]
            : [undefined, undefined];

      if (container === undefined || contained === undefined) continue;

      problems.push({
        level: "error",
        file,
        line: later.line,
        message: `Required path "${contained.path}" is inside required path "${container.path}"`,
        fix: "Remove one of the entries",
      });
      break;
    }
  }

  return problems;
}

export function rule10ReservedPrefix(skill: Skill): Problem[] {
  const name = skill.frontmatter.name;
  if (typeof name !== "string" || !name.startsWith(RESERVED_PREFIX)) return [];

  return [
    {
      level: "error",
      file: skillFile(skill),
      line: nameLine(skill),
      message: `Skill name "${name}" uses the reserved "metafab" prefix`,
      fix: 'Rename the skill so the name does not start with "metafab"',
    },
  ];
}

const RESERVED_SKILL_PATH = /^\.factory\/([^/]+)\/SKILL\.md$/;

export function rule11ReservedContainer(file: string): Problem[] {
  const dir = RESERVED_SKILL_PATH.exec(file)?.[1] ?? file;

  return [
    {
      level: "error",
      file,
      line: 1,
      message: `${dir} is a reserved directory and cannot be a skill`,
      fix: `Move the SKILL.md into .factory/${dir}/<name>/`,
    },
  ];
}

export function rule6UnknownFactoryField(file: string, key: string, line: number): Problem[] {
  const suggestion = didYouMean(key, KNOWN_FACTORY_FIELDS);
  return [
    {
      level: "error",
      file,
      line,
      message: `Unknown field "${key}" in factory.yaml`,
      fix:
        suggestion ??
        `Remove the field or use a known name: ${KNOWN_FACTORY_FIELDS.join(", ")}`,
    },
  ];
}

export function rule6UnknownPipelineOption(file: string, key: string, line: number): Problem[] {
  const suggestion = didYouMean(key, ["stop"]);
  return [
    {
      level: "error",
      file,
      line,
      message: `Unknown pipeline option "${key}"`,
      fix: suggestion ?? 'Remove the option or use the "stop" option',
    },
  ];
}

export function rule6FactoryName(file: string, field: FactoryField): Problem[] {
  const value = field.value;
  if (typeof value !== "string" || value === "") {
    return [
      {
        level: "error",
        file,
        line: field.line,
        message: '"name" must be a non-empty string',
        fix: "Add a name field",
      },
    ];
  }
  if (!FACTORY_NAME_PATTERN.test(value)) {
    return [
      {
        level: "error",
        file,
        line: field.line,
        message: '"name" must use lowercase ASCII letters, digits, and hyphens',
        fix: `Use a name like "${slugify(value)}"`,
      },
    ];
  }
  return [];
}

export function rule6FactoryDescription(file: string, field: FactoryField): Problem[] {
  if (typeof field.value !== "string" || field.value === "") {
    return [
      {
        level: "error",
        file,
        line: field.line,
        message: '"description" must be a non-empty string',
        fix: "Write a one-line description",
      },
    ];
  }
  if (!isSingleLine(field.value)) {
    return [
      {
        level: "error",
        file,
        line: field.line,
        message: '"description" must be a single line',
        fix: "Write the description on one line",
      },
    ];
  }
  return [];
}

export function validateFactory(factory: Factory): Problem[] {
  const problems: Problem[] = [];

  for (const skill of factory.skills) {
    problems.push(...rule1RequiredFields(skill));
    problems.push(...rule6SkillGrammar(skill));

    const name = skill.frontmatter.name;
    if (typeof name === "string" && name !== "") {
      problems.push(...rule2NameMatchesDirectory(skill));
      problems.push(...rule5NameFormat(skill));
      problems.push(...rule10ReservedPrefix(skill));
    }
  }

  problems.push(...rule4UniqueNames(factory.skills));

  if (factory.factoryYaml !== undefined) {
    problems.push(...rule8PipelineWorkflows(factory.factoryYaml.pipeline, factory.skills));
    for (const requirement of factory.factoryYaml.requires) {
      problems.push(...rule12RequirementPath(".factory/factory.yaml", requirement));
    }
    problems.push(
      ...rule12UniqueRequirements(".factory/factory.yaml", factory.factoryYaml.requires),
    );
  }

  return problems;
}
