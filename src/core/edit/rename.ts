import { readFile, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { isBinary } from "../../util/text.js";
import { pathExists } from "../../util/fs.js";
import { didYouMean } from "../../util/suggest.js";
import { loadFactory } from "../factory/load.js";
import type { Skill } from "../factory/types.js";
import { renamePipelineEntry, parseFactoryYamlDocument, pipelineEntryNames, serializeFactoryYaml } from "./factory-yaml.js";
import { readFactoryYamlText, writeFactoryYamlText, writeTextAtomically } from "./files.js";
import { setFrontmatterName } from "./frontmatter.js";
import { getSkillNameProblems } from "./names.js";

export interface RenameSkillResult {
  root: string;
  from: string;
  to: string;
  /** New path relative to the factory root, such as `.factory/workflows/review-plan`. */
  path: string;
  /** True when the renamed workflow's pipeline entry was updated. */
  pipeline: boolean;
  warnings: Problem[];
}

/** Seam for tests to force a write failure at a known point in the rename. */
export interface RenameSkillOptions {
  writeSkillText?: (file: string, text: string) => Promise<void>;
  writeFactoryText?: (file: string, text: string) => Promise<void>;
}

function problem(file: string, message: string, fix?: string): Problem {
  return {
    level: "error",
    file,
    message,
    ...(fix === undefined ? {} : { fix }),
  };
}

function renameError(code: string, message: string, problems: Problem[]): MetafabError {
  return new MetafabError(message, { code, problems });
}

function targetRelDir(skill: Skill, name: string): string {
  const segments = skill.relDir.split("/");
  segments[segments.length - 1] = name;
  return segments.join("/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionsName(text: string, name: string): boolean {
  const pattern = new RegExp(`(?<![a-z0-9-])${escapeRegExp(name)}(?![a-z0-9-])`);
  return pattern.test(text);
}

/** Lists files under a directory, skipping entries it cannot read instead of failing the rename. */
async function readableFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(directory: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const relPath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(path.join(directory, entry.name), relPath);
      } else if (entry.isFile()) {
        files.push(relPath);
      }
    }
  }

  await walk(root, "");
  files.sort();
  return files;
}

async function mentionWarnings(
  root: string,
  oldName: string,
  newName: string,
  skipRelDir: string,
): Promise<Problem[]> {
  const factoryDir = path.join(root, ".factory");
  const warnings: Problem[] = [];
  const files = await readableFiles(factoryDir);

  for (const relPath of files) {
    if (relPath === "factory.yaml") continue;
    if (relPath === skipRelDir || relPath.startsWith(`${skipRelDir}/`)) continue;

    let data: Buffer;
    try {
      data = await readFile(path.join(factoryDir, relPath));
    } catch {
      continue;
    }
    if (isBinary(data)) continue;

    const lines = data.toString("utf8").split("\n");
    lines.forEach((line, index) => {
      if (!mentionsName(line, oldName)) return;
      warnings.push({
        level: "warning",
        file: `.factory/${relPath}`,
        line: index + 1,
        message: `Mentions the old skill name "${oldName}"`,
        fix: `Update it to "${newName}" if it refers to this skill`,
      });
    });
  }

  return warnings;
}

export async function renameSkill(
  root: string,
  from: string,
  to: string,
  options: RenameSkillOptions = {},
): Promise<RenameSkillResult> {
  const writeSkill = options.writeSkillText ?? writeTextAtomically;
  const writeFactory =
    options.writeFactoryText ??
    ((file: string, text: string) => writeFactoryYamlText(path.dirname(file), text));

  const factory = await loadFactory(root);
  const skill = factory.skills.find((candidate) => candidate.name === from);

  if (skill === undefined) {
    const names = factory.skills.map((candidate) => candidate.name);
    const suggestion = didYouMean(from, names);
    const message = `No skill named "${from}".`;
    throw renameError("rename-missing-skill", message, [
      problem(`.factory/${from}`, message, suggestion ?? "Choose an existing skill name"),
    ]);
  }

  const newRelDir = targetRelDir(skill, to);
  const nameProblems = getSkillNameProblems(to, newRelDir);
  if (nameProblems.length > 0) {
    throw renameError("rename-name-invalid", nameProblems[0]!.message, nameProblems);
  }

  const clash = factory.skills.find(
    (candidate) =>
      candidate !== skill && (candidate.name === to || candidate.frontmatter.name === to),
  );
  if (clash !== undefined) {
    const message = `A skill named "${to}" already exists at .factory/${clash.relDir}.`;
    throw renameError("rename-duplicate-name", message, [
      problem(`.factory/${clash.relDir}/SKILL.md`, message, "Choose another name"),
    ]);
  }

  const destination = path.join(root, ".factory", ...newRelDir.split("/"));
  const destinationFile = `.factory/${newRelDir}/SKILL.md`;
  if (to === from) {
    const message = `The skill is already named "${from}".`;
    throw renameError("rename-same-name", message, [
      problem(destinationFile, message, "Choose a different name"),
    ]);
  }

  if (await pathExists(destination)) {
    const message = `The destination .factory/${newRelDir} already exists.`;
    throw renameError("rename-target-exists", message, [
      problem(destinationFile, message, "Choose another name or remove the existing path"),
    ]);
  }

  const oldDir = path.join(root, ".factory", ...skill.relDir.split("/"));
  const oldSkillFile = path.join(oldDir, "SKILL.md");
  let skillText: string;
  try {
    skillText = await readFile(oldSkillFile, "utf8");
  } catch {
    const message = `Cannot read .factory/${skill.relDir}/SKILL.md`;
    throw renameError("rename-skill-unreadable", message, [
      problem(`.factory/${skill.relDir}/SKILL.md`, message, "Check its permissions or restore the file"),
    ]);
  }

  const movedSkillText = setFrontmatterName(skillText, to, `.factory/${skill.relDir}/SKILL.md`);

  let factoryText: string | undefined;
  let nextFactoryText: string | undefined;
  let pipeline = false;
  if (skill.isWorkflow) {
    factoryText = await readFactoryYamlText(path.join(root, ".factory"));
    if (factoryText !== undefined) {
      const doc = parseFactoryYamlDocument(factoryText);
      if (pipelineEntryNames(doc).includes(from)) {
        renamePipelineEntry(doc, from, to);
        nextFactoryText = serializeFactoryYaml(doc);
        pipeline = true;
      }
    }
  }

  const factoryFile = ".factory/factory.yaml";
  let moved = false;
  let skillUpdated = false;
  let failedAction = "move";
  let failedFile = `.factory/${skill.relDir}`;
  try {
    await rename(oldDir, destination);
    moved = true;
    failedAction = "write";
    failedFile = destinationFile;
    await writeSkill(path.join(destination, "SKILL.md"), movedSkillText);
    skillUpdated = true;
    if (nextFactoryText !== undefined) {
      failedFile = factoryFile;
      await writeFactory(path.join(root, ".factory", "factory.yaml"), nextFactoryText);
    }
  } catch (error) {
    if (moved) {
      try {
        if (skillUpdated) {
          await writeTextAtomically(path.join(destination, "SKILL.md"), skillText);
        }
        await rename(destination, oldDir);
      } catch {
        // Best effort: report the original failure even if the rollback also fails.
      }
    }

    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    const reason = typeof code === "string" && code !== "" ? ` (${code})` : "";
    const message = `Could not rename "${from}" to "${to}": could not ${failedAction} ${failedFile}${reason}.`;
    throw renameError("rename-failed", message, [
      problem(failedFile, message, "Check file permissions and try again"),
    ]);
  }

  const warnings = await mentionWarnings(root, from, to, newRelDir);

  return {
    root,
    from,
    to,
    path: `.factory/${newRelDir}`,
    pipeline,
    warnings,
  };
}
