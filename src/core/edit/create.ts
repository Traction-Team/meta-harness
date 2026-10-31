import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { isSingleLine } from "../../util/text.js";
import { discoverSkills } from "../factory/discovery.js";
import { RESERVED_CONTAINERS, skillFile } from "../factory/validate.js";
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

function isReservedContainerRelDir(relDir: string): boolean {
  return !relDir.includes("/") && (RESERVED_CONTAINERS as readonly string[]).includes(relDir);
}

function factoryPath(relDir: string): string {
  return relDir === "" ? ".factory" : `.factory/${relDir}`;
}

async function hasSkillFile(directory: string): Promise<boolean> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.some((entry) => entry.name === "SKILL.md" && entry.isFile());
  } catch {
    // A directory that cannot be read holds no confirmable skill here. Discovery records it
    // as skipped, and the unreadable checks in planCreate refuse the create with a problem.
    return false;
  }
}

async function hasChildSkill(directory: string, prefix = ""): Promise<string | undefined> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    // Unreadable: discovery records the directory and the unreadable check refuses.
    return undefined;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const relDir = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    const childDir = path.join(directory, entry.name);
    if (await hasSkillFile(childDir)) return relDir;
    const nested = await hasChildSkill(childDir, relDir);
    if (nested !== undefined) return nested;
  }

  return undefined;
}

async function isExistingFile(target: string): Promise<boolean> {
  try {
    return !(await stat(target)).isDirectory();
  } catch {
    // Unreadable parents are reported by discovery, not as a file ancestor.
    return false;
  }
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

  const first = resolved.segments[0];
  if (resolved.segments.length === 1 && first !== undefined && isReservedContainerRelDir(first)) {
    const message = `The path "${input}" is a reserved directory and cannot be a skill.`;
    throw createError("create-reserved-path", message, [
      problem(`.factory/${first}`, message, `Create a skill inside it, such as ${first}/<name>`),
    ]);
  }

  for (let index = 1; index < resolved.segments.length; index += 1) {
    const ancestorSegments = resolved.segments.slice(0, index);
    const ancestorRelDir = ancestorSegments.join("/");
    const ancestorDir = path.join(factoryDir, ...ancestorSegments);
    if (await isExistingFile(ancestorDir)) {
      const message = `Cannot create .factory/${resolved.relDir}: .factory/${ancestorRelDir} is not a directory.`;
      throw createError("create-ancestor-not-directory", message, [
        problem(
          `.factory/${ancestorRelDir}`,
          message,
          "Move the file or choose a path below a directory",
        ),
      ]);
    }
    if (!isReservedContainerRelDir(ancestorRelDir) && (await hasSkillFile(ancestorDir))) {
      const message = `The path "${input}" is inside the skill "${ancestorRelDir}".`;
      throw createError("create-inside-skill", message, [
        problem(`.factory/${ancestorRelDir}/SKILL.md`, message, "Choose a path outside that skill directory"),
      ]);
    }
  }

  if (await isExistingFile(target)) {
    const message = `Cannot create .factory/${resolved.relDir}/SKILL.md: .factory/${resolved.relDir} is not a directory.`;
    throw createError("create-target-not-directory", message, [
      problem(`.factory/${resolved.relDir}`, message, "Move the file or choose another path"),
    ]);
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

  const discovery = await discoverSkills(root);
  const clash = discovery.skills.find(
    (skill) => skill.name === resolved.name || skill.frontmatter.name === resolved.name,
  );
  if (clash !== undefined) {
    const message = `A skill named "${resolved.name}" already exists at ${skillFile(clash)}.`;
    throw createError("create-duplicate-name", message, [
      problem(file, message, "Choose another name or rename the existing skill"),
    ]);
  }

  const unreadableName = discovery.skipped.find(
    (relDir) => (relDir.split("/").pop() ?? "") === resolved.name,
  );
  if (unreadableName !== undefined) {
    const message = `${factoryPath(unreadableName)} may hold a skill named "${resolved.name}", but it cannot be read`;
    throw createError("create-duplicate-name", message, [
      problem(factoryPath(unreadableName), message, "Make it readable or fix its SKILL.md, then try again"),
    ]);
  }

  // A directory below the target that cannot be read may hold the skill directory that makes
  // the new skill nested (rule 3), so refuse instead of writing a path the loader rejects.
  const unreadableChild = discovery.skipped.find((relDir) =>
    relDir.startsWith(`${resolved.relDir}/`),
  );
  if (unreadableChild !== undefined) {
    const message = `Cannot create .factory/${resolved.relDir}/SKILL.md: ${factoryPath(unreadableChild)} cannot be read.`;
    throw createError("create-path-unreadable", message, [
      problem(
        factoryPath(unreadableChild),
        message,
        "Make it readable or fix its SKILL.md, then try again",
      ),
    ]);
  }

  // `.factory`, or a directory on the way to the target, cannot be read: nothing below it is
  // confirmable, so no name or child skill check above could see what the create would join.
  const unreadablePath = discovery.skipped.find(
    (relDir) =>
      relDir === "" || resolved.relDir === relDir || resolved.relDir.startsWith(`${relDir}/`),
  );
  if (unreadablePath !== undefined) {
    const message = `${factoryPath(unreadablePath)} cannot be read`;
    throw createError("create-path-unreadable", message, [
      problem(factoryPath(unreadablePath), message, "Make it readable or fix its SKILL.md, then try again"),
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
