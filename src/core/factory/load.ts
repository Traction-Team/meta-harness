import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Problem } from "../../errors.js";
import { normalizeProblemPath } from "../../util/fs.js";
import { toLF } from "../../util/text.js";
import { discoverSkills } from "./discovery.js";
import { parseFactoryYaml } from "./factory-yaml.js";
import type { Factory, Skill } from "./types.js";
import { rule8PipelineWorkflows, validateFactory } from "./validate.js";

interface ReadTextResult {
  text?: string;
  problem?: Problem;
}

function isAbsentError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

async function readTextFile(target: string, file: string): Promise<ReadTextResult> {
  try {
    const info = await stat(target);
    if (!info.isFile()) {
      return {
        problem: {
          level: "error",
          file,
          line: 1,
          message: `${file} is not a regular file`,
          fix: "Replace it with a regular file",
        },
      };
    }
    return { text: await readFile(target, "utf8") };
  } catch (error) {
    if (isAbsentError(error)) return {};
    return {
      problem: {
        level: "error",
        file,
        line: 1,
        message: `Cannot read file ${file}`,
        fix: "Check its permissions or restore the file",
      },
    };
  }
}

export async function loadFactory(root: string): Promise<Factory> {
  const absoluteRoot = path.resolve(root);
  const dir = path.join(absoluteRoot, ".factory");
  const factory: Factory = { root: absoluteRoot, dir, skills: [], problems: [] };

  const discovery = await discoverSkills(absoluteRoot);
  factory.skills = discovery.skills;
  factory.problems.push(...discovery.problems);

  const agentsFile = normalizeProblemPath(path.join(dir, "AGENTS.md"), absoluteRoot);
  const agentsMd = await readTextFile(path.join(dir, "AGENTS.md"), agentsFile);
  if (agentsMd.problem !== undefined) factory.problems.push(agentsMd.problem);
  if (agentsMd.text !== undefined) factory.agentsMd = toLF(agentsMd.text);

  const factoryFile = normalizeProblemPath(path.join(dir, "factory.yaml"), absoluteRoot);
  const factoryYamlText = await readTextFile(path.join(dir, "factory.yaml"), factoryFile);
  if (factoryYamlText.problem !== undefined) factory.problems.push(factoryYamlText.problem);
  if (factoryYamlText.text !== undefined) {
    const parsed = parseFactoryYaml(factoryYamlText.text, factoryFile);
    if (parsed.yaml !== undefined) factory.factoryYaml = parsed.yaml;
    factory.problems.push(...parsed.problems);
    if (parsed.yaml === undefined && parsed.pipeline !== undefined) {
      factory.problems.push(...rule8PipelineWorkflows(parsed.pipeline, factory.skills));
    }
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
