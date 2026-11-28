import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Problem } from "../../errors.js";
import { isAbsentError, readdirTyped } from "../../util/fs.js";
import type { DirEntry } from "../../util/fs.js";
import { parseFrontmatter } from "../../util/frontmatter.js";
import type { Factory } from "../factory/types.js";
import {
  automationFile,
  automationFileProblem,
  automationMissingFileProblem,
  automationNameProblems,
  automationProblems,
  automationSkillFileProblem,
  parseAutomation,
} from "./validate.js";
import type { Automation, AutomationBody, Automations } from "./types.js";

const AUTOMATIONS_DIR = "automations";

function byName(left: DirEntry, right: DirEntry): number {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

function readProblem(file: string, directory: boolean): Problem {
  return directory
    ? {
        level: "error",
        file,
        line: 1,
        message: `Cannot read directory ${file}`,
        fix: "Check its permissions or restore the directory",
      }
    : {
        level: "error",
        file,
        line: 1,
        message: `Cannot read file ${file}`,
        fix: "Check its permissions or restore the file",
      };
}

interface AutomationWalk {
  /** Absolute path of `automation.md`, when it is directly in the directory. */
  file?: string;
  /** False when the directory itself could not be read. */
  readable: boolean;
}

/**
 * Finds the automation's `automation.md` directly inside its directory, and
 * reports every `SKILL.md` below it. Other files and directories are allowed.
 */
async function walkAutomation(
  dir: string,
  display: string,
  problems: Problem[],
  top: boolean,
): Promise<AutomationWalk> {
  let entries: DirEntry[];
  try {
    entries = await readdirTyped(dir);
  } catch (error) {
    if (!isAbsentError(error)) {
      problems.push(readProblem(display, true));
      return { readable: false };
    }
    return { readable: true };
  }
  entries.sort(byName);

  const found: AutomationWalk = { readable: true };
  for (const entry of entries) {
    const childDisplay = `${display}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      const nested = await walkAutomation(path.join(dir, entry.name), childDisplay, problems, false);
      if (!nested.readable) found.readable = false;
      continue;
    }
    if (entry.name === "SKILL.md") {
      problems.push(automationSkillFileProblem(childDisplay));
      continue;
    }
    if (top && entry.name === "automation.md" && found.file === undefined) {
      found.file = path.join(dir, entry.name);
    }
  }

  return found;
}

async function readAutomation(
  target: string,
  name: string,
  problems: Problem[],
  bodies: AutomationBody[],
): Promise<Automation | undefined> {
  const file = automationFile(name);

  let text: string;
  try {
    text = await readFile(target, "utf8");
  } catch {
    problems.push(readProblem(file, false));
    return undefined;
  }

  const parsed = parseFrontmatter(text);
  if (!parsed.ok) {
    for (const problem of parsed.problems) {
      problems.push({ level: "error", file, ...problem });
    }
    return undefined;
  }

  const result = parseAutomation(name, parsed);
  problems.push(...result.problems);
  bodies.push(result.body);
  return result.automation;
}

/**
 * Reads `.factory/automations/` for a format 2 factory: the layout rules, then
 * every `automation.md` and the rules that need all of them. Format 1 has no
 * automations, so it loads none; `loadFactory` warns when the directory is
 * non-empty there.
 */
export async function loadAutomations(
  factoryDir: string,
  factory: Factory,
): Promise<Automations> {
  const result: Automations = { list: [], bodies: [], problems: [] };
  if (factory.factoryYaml?.format !== 2) return result;

  const dir = path.join(factoryDir, AUTOMATIONS_DIR);
  let entries: DirEntry[];
  try {
    entries = await readdirTyped(dir);
  } catch (error) {
    if (!isAbsentError(error)) result.problems.push(readProblem(".factory/automations", true));
    return result;
  }
  entries.sort(byName);

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      result.problems.push(...automationNameProblems(entry.name));
      const display = `.factory/automations/${entry.name}`;
      const walk = await walkAutomation(path.join(dir, entry.name), display, result.problems, true);
      if (walk.file === undefined) {
        if (walk.readable) result.problems.push(automationMissingFileProblem(entry.name));
        continue;
      }
      const automation = await readAutomation(walk.file, entry.name, result.problems, result.bodies);
      if (automation !== undefined) result.list.push(automation);
      continue;
    }

    // A file directly in `automations/`: only `run.md` is allowed.
    if (entry.name === "run.md") {
      result.runFile = ".factory/automations/run.md";
      continue;
    }
    if (entry.name === "SKILL.md") {
      result.problems.push(automationSkillFileProblem(".factory/automations/SKILL.md"));
      continue;
    }
    result.problems.push(automationFileProblem(`.factory/automations/${entry.name}`));
  }

  result.list.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  result.problems.push(...automationProblems(result.list));
  return result;
}
