import type { Problem } from "../../errors.js";
import type { Skill } from "../factory/types.js";
import { rule5NameFormat, rule6SkillGrammar, rule10ReservedPrefix } from "../factory/validate.js";

function skillStub(name: string, relDir: string): Skill {
  const segments = relDir.split("/");
  return {
    name: segments[segments.length - 1] ?? relDir,
    relDir,
    group: segments[0] ?? relDir,
    isWorkflow: segments[0] === "workflows",
    frontmatter: { name },
    frontmatterLines: { start: 1, end: 1 },
  };
}

export function getSkillNameProblems(name: string, relDir: string): Problem[] {
  const skill = skillStub(name, relDir);
  return [...rule6SkillGrammar(skill), ...rule5NameFormat(skill), ...rule10ReservedPrefix(skill)];
}
