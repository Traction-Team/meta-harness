import type { Skill } from "./types.js";

export interface SkillLines {
  name?: number;
  description?: number;
}

const skillLines = new WeakMap<Skill, SkillLines>();

export function setSkillLines(skill: Skill, lines: SkillLines): void {
  skillLines.set(skill, lines);
}

export function nameLine(skill: Skill): number {
  return skillLines.get(skill)?.name ?? skill.frontmatterLines.start;
}

export function descriptionLine(skill: Skill): number {
  return skillLines.get(skill)?.description ?? skill.frontmatterLines.start;
}
