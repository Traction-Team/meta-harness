import { readdir } from "node:fs/promises";
import path from "node:path";
import { MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { isSingleLine } from "../../util/text.js";
import { loadFactory } from "../factory/load.js";
import { skillFile } from "../factory/validate.js";
import { writeTextAtomically } from "./files.js";
import { normaliseCreatePath } from "./paths.js";
import { skillFileText } from "./skill.js";

export interface CreatePlan {
  root: string;
  factoryDir: string;
  relDir: string;
  name: string;
  /** Absolute path of the SKILL.md file to write. */
  skillPath: string;
}

function problem(file: string, message: string, fix?: string): Problem {
  return {
    level: "error",
    file,
    message,
    ...(fix === undefined ? {} : { fix }),
  };
}

function createError(code: string, message: string, problems: Problem[]): MetafabError {
  return new MetafabError(message, { code, problems });
}

async function hasSkillFile(directory: string): Promise<boolean> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.some((entry) => entry.name === "SKILL.md" && entry.isFile());
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
}

async function hasChildSkill(directory: string): Promise<string | undefined> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (await hasSkillFile(path.join(directory, entry.name))) return entry.name;
  }

  return undefined;
}

/**
 * Validates a create request without touching the filesystem. The command resolves the
 * description after this, so an invalid path is reported before a prompt.
 */
export async function planCreate(root: string, input: string): Promise<CreatePlan> {
  const resolved = normaliseCreatePath(input);
  const factoryDir = path.join(root, ".factory");
  const target = path.join(factoryDir, ...resolved.segments);
  const file = `.factory/${resolved.relDir}/SKILL.md`;

  for (let index = 1; index < resolved.segments.length; index += 1) {
    const ancestorSegments = resolved.segments.slice(0, index);
    const ancestorRelDir = ancestorSegments.join("/");
    const ancestorDir = path.join(factoryDir, ...ancestorSegments);
    if (await hasSkillFile(ancestorDir)) {
      const message = `The path "${input}" is inside the skill "${ancestorRelDir}".`;
      throw createError("create-inside-skill", message, [
        problem(`.factory/${ancestorRelDir}/SKILL.md`, message, "Choose a path outside that skill directory"),
      ]);
    }
  }

  if (await hasSkillFile(target)) {
    const message = `A skill already exists at .factory/${resolved.relDir}.`;
    throw createError("create-target-exists", message, [
      problem(file, message, "Choose a different path or rename the existing skill"),
    ]);
  }

  const nested = await hasChildSkill(target);
  if (nested !== undefined) {
    const message = `The path "${input}" would contain the skill "${nested}".`;
    throw createError("create-contains-skill", message, [
      problem(
        `.factory/${resolved.relDir}/${nested}/SKILL.md`,
        message,
        "Choose a path that does not contain an existing skill directory",
      ),
    ]);
  }

  const factory = await loadFactory(root);
  const clash = factory.skills.find(
    (skill) => skill.name === resolved.name || skill.frontmatter.name === resolved.name,
  );
  if (clash !== undefined) {
    const message = `A skill named "${resolved.name}" already exists at ${skillFile(clash)}.`;
    throw createError("create-duplicate-name", message, [
      problem(file, message, "Choose another name or rename the existing skill"),
    ]);
  }

  return {
    root,
    factoryDir,
    relDir: resolved.relDir,
    name: resolved.name,
    skillPath: path.join(target, "SKILL.md"),
  };
}

/** Returns the description trimmed, or throws when it cannot be written to frontmatter. */
export function validateDescription(description: string, file = "description"): string {
  const trimmed = description.trim();

  if (trimmed === "") {
    const message = "A description is required.";
    throw createError("create-description-invalid", message, [
      problem(file, message, "Pass --description or enter one at the prompt"),
    ]);
  }

  if (!isSingleLine(description)) {
    const message = "The description must be a single line.";
    throw createError("create-description-invalid", message, [
      problem(file, message, "Write the description on one line"),
    ]);
  }

  return trimmed;
}

export async function writeCreatedSkill(plan: CreatePlan, description: string): Promise<void> {
  const text = skillFileText(plan.name, validateDescription(description));
  await writeTextAtomically(plan.skillPath, text);
}

/** Plans, validates and writes a new skill. */
export async function createSkill(root: string, input: string, description: string): Promise<CreatePlan> {
  const plan = await planCreate(root, input);
  await writeCreatedSkill(plan, description);
  return plan;
}
