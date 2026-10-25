import { loadFactory } from "../factory/load.js";
import type { Problem } from "../../errors.js";
import type { Skill } from "../factory/types.js";

export interface MapFactoryInfo {
  name?: string;
  description?: string;
}

export interface MapPipelineEntry {
  workflow: string;
  stop?: string;
}

export interface MapSkill {
  name: string;
  group: string;
  path: string;
  frontmatter: Record<string, unknown>;
}

export interface MapData {
  factory: MapFactoryInfo;
  pipeline: MapPipelineEntry[];
  standaloneWorkflows: string[];
  skills: MapSkill[];
  problems: Problem[];
}

export async function mapFactory(root: string): Promise<MapData> {
  const factory = await loadFactory(root);
  const yaml = factory.factoryYaml;

  const factoryInfo: MapFactoryInfo = {
    ...(yaml === undefined ? {} : { name: yaml.name }),
    ...(yaml?.description === undefined ? {} : { description: yaml.description }),
  };

  const pipeline: MapPipelineEntry[] =
    yaml?.pipeline.map((entry) => ({
      workflow: entry.workflow,
      ...(entry.stop === undefined ? {} : { stop: entry.stop }),
    })) ?? [];

  const inPipeline = new Set(pipeline.map((entry) => entry.workflow));
  const standaloneWorkflows = factory.skills
    .filter((skill) => skill.isWorkflow && !inPipeline.has(skill.name))
    .map((skill) => skill.name);

  const skills = factory.skills.map((skill: Skill): MapSkill => ({
    name: skill.name,
    group: skill.group,
    path: `.factory/${skill.relDir}`,
    frontmatter: skill.frontmatter,
  }));

  return {
    factory: factoryInfo,
    pipeline,
    standaloneWorkflows,
    skills,
    problems: factory.problems,
  };
}

function pipelineLines(data: MapData): string[] {
  const width = Math.max(...data.pipeline.map((entry) => entry.workflow.length), 0);
  return data.pipeline.map((entry, index) => {
    const prefix = `  ${index + 1}. ${entry.workflow}`;
    if (entry.stop === undefined) return prefix;
    return `${prefix}${" ".repeat(width - entry.workflow.length + 2)}stop: ${entry.stop}`;
  });
}

function skillLines(data: MapData): string[] {
  const groups = new Map<string, string[]>();
  for (const skill of data.skills) {
    if (skill.group === "workflows") continue;
    const names = groups.get(skill.group) ?? [];
    names.push(skill.name);
    groups.set(skill.group, names);
  }

  const width = Math.max(...[...groups.keys()].map((group) => `${group}/`.length), 0);
  const lines: string[] = [];
  for (const [group, names] of groups) {
    lines.push(`  ${`${group}/`.padEnd(width + 3)}${names.join(", ")}`);
  }
  return lines;
}

export function mapSummary(data: MapData): string {
  const info = data.factory;
  const name = info.name ?? "Factory";
  const lines: string[] = [
    info.description === undefined ? name : `${name} — ${info.description}`,
  ];

  if (data.pipeline.length > 0) {
    lines.push("", "Pipeline", ...pipelineLines(data));
  }

  if (data.standaloneWorkflows.length > 0) {
    lines.push("", "Standalone workflows", ...data.standaloneWorkflows.map((name) => `  ${name}`));
  }

  const skills = skillLines(data);
  if (skills.length > 0) lines.push("", "Skills", ...skills);

  return lines.join("\n");
}
