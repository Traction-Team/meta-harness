import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Problem } from "../../errors.js";
import { normalizeProblemPath, readdirTyped } from "../../util/fs.js";
import { toLF } from "../../util/text.js";
import { loadAutomations } from "../automations/load.js";
import { environmentProblems } from "../env/validate.js";
import { discoverSkills } from "./discovery.js";
import { parseFactoryYaml } from "./factory-yaml.js";
import { requirementTemplateProblems } from "./requires.js";
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

  // `factory.yaml` is read first because its format decides whether discovery
  // skips `automations/`. Its problems are reported below in the order this
  // function has always used.
  const factoryFile = normalizeProblemPath(path.join(dir, "factory.yaml"), absoluteRoot);
  const factoryYamlText = await readTextFile(path.join(dir, "factory.yaml"), factoryFile);
  const parsedYaml =
    factoryYamlText.text === undefined
      ? undefined
      : parseFactoryYaml(factoryYamlText.text, factoryFile);
  const format = parsedYaml?.yaml?.format ?? 1;

  const discovery = await discoverSkills(absoluteRoot, format);
  factory.skills = discovery.skills;
  factory.problems.push(...discovery.problems);

  const agentsFile = normalizeProblemPath(path.join(dir, "AGENTS.md"), absoluteRoot);
  const agentsMd = await readTextFile(path.join(dir, "AGENTS.md"), agentsFile);
  if (agentsMd.problem !== undefined) factory.problems.push(agentsMd.problem);
  if (agentsMd.text !== undefined) factory.agentsMd = toLF(agentsMd.text);

  if (factoryYamlText.problem !== undefined) factory.problems.push(factoryYamlText.problem);
  if (parsedYaml !== undefined) {
    if (parsedYaml.yaml !== undefined) factory.factoryYaml = parsedYaml.yaml;
    factory.problems.push(...parsedYaml.problems);
    if (parsedYaml.yaml === undefined && parsedYaml.pipeline !== undefined) {
      factory.problems.push(...rule8PipelineWorkflows(parsedYaml.pipeline, factory.skills));
    }
    if (parsedYaml.requires !== undefined) {
      factory.problems.push(
        ...(await requirementTemplateProblems(factory, parsedYaml.requires, factoryFile)),
      );
    }
  }

  factory.problems.push(...validateFactory(factory));

  if (format === 2) {
    factory.automations = await loadAutomations(dir, factory);
    factory.problems.push(...factory.automations.problems);
  } else if (await hasAutomations(dir)) {
    factory.problems.push({
      level: "warning",
      file: ".factory/automations",
      line: 1,
      message: ".factory/automations/ needs format: 2",
      fix: "Set format: 2 in .factory/factory.yaml",
    });
  }

  factory.problems.push(...(await environmentProblems(factory)));
  return factory;
}

/** True when `.factory/automations/` holds anything but dot entries. */
async function hasAutomations(factoryDir: string): Promise<boolean> {
  try {
    const entries = await readdirTyped(path.join(factoryDir, "automations"));
    return entries.some((entry) => !entry.name.startsWith("."));
  } catch {
    // An unreadable directory is discovery's error to report.
    return false;
  }
}

export function findSkill(factory: Factory, name: string): Skill | undefined {
  return factory.skills.find((skill) => skill.name === name);
}

export function workflows(factory: Factory): Skill[] {
  return factory.skills.filter((skill) => skill.isWorkflow);
}
