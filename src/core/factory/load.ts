import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { normalizeProblemPath } from "../../util/fs.js";
import { toLF } from "../../util/text.js";
import { discoverSkills } from "./discovery.js";
import { parseFactoryYaml } from "./factory-yaml.js";
import type { Factory, Skill } from "./types.js";
import { validateFactory } from "./validate.js";

async function readTextFile(target: string): Promise<string | undefined> {
  try {
    const info = await stat(target);
    if (!info.isFile()) return undefined;
    return await readFile(target, "utf8");
  } catch {
    return undefined;
  }
}

export async function loadFactory(root: string): Promise<Factory> {
  const absoluteRoot = path.resolve(root);
  const dir = path.join(absoluteRoot, ".factory");
  const factory: Factory = { root: absoluteRoot, dir, skills: [], problems: [] };

  const discovery = await discoverSkills(absoluteRoot);
  factory.skills = discovery.skills;
  factory.problems.push(...discovery.problems);

  const agentsMd = await readTextFile(path.join(dir, "AGENTS.md"));
  if (agentsMd !== undefined) factory.agentsMd = toLF(agentsMd);

  const factoryYamlText = await readTextFile(path.join(dir, "factory.yaml"));
  if (factoryYamlText !== undefined) {
    const file = normalizeProblemPath(path.join(dir, "factory.yaml"), absoluteRoot);
    const parsed = parseFactoryYaml(factoryYamlText, file);
    if (parsed.yaml !== undefined) factory.factoryYaml = parsed.yaml;
    factory.problems.push(...parsed.problems);
  }

  factory.problems.push(...validateFactory(factory));
  return factory;
}

export function findSkill(factory: Factory, name: string): Skill | undefined {
  return factory.skills.find((skill) => skill.name === name);
}

export function workflows(factory: Factory): Skill[] {
  return factory.skills.filter((skill) => skill.isWorkflow);
}
