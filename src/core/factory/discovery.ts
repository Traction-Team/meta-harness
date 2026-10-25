import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Problem } from "../../errors.js";
import { parseFrontmatter } from "../../util/frontmatter.js";
import type { Skill } from "./types.js";
import { setSkillLines } from "./lines.js";
import { rule3NoNestedSkills, ruleTopLevelSkill } from "./validate.js";

export interface DiscoveryResult {
  skills: Skill[];
  problems: Problem[];
}

function factoryPath(relDir: string): string {
  return relDir === "" ? ".factory" : `.factory/${relDir}`;
}

function isAbsentError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function firstHeading(body: string): string | undefined {
  let fence: { marker: string; length: number } | undefined;

  for (const line of body.split("\n")) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch !== null) {
      const marker = fenceMatch[1]!;
      if (fence === undefined) {
        fence = { marker: marker[0]!, length: marker.length };
      } else if (marker[0] === fence.marker && marker.length >= fence.length) {
        fence = undefined;
      }
      continue;
    }

    if (fence !== undefined) continue;

    const match = /^# (.+)$/.exec(line);
    if (match) return match[1]?.trim();
  }

  return undefined;
}

async function loadSkill(
  dir: string,
  relDir: string,
  problems: Problem[],
): Promise<Skill | undefined> {
  const file = `${factoryPath(relDir)}/SKILL.md`;
  let source: string;
  try {
    source = await readFile(path.join(dir, "SKILL.md"), "utf8");
  } catch (error) {
    if (isAbsentError(error)) return undefined;
    problems.push({
      level: "error",
      file,
      line: 1,
      message: `Cannot read file ${file}`,
      fix: "Check its permissions or restore the file",
    });
    return undefined;
  }
  const parsed = parseFrontmatter(source);

  if (!parsed.ok) {
    for (const problem of parsed.problems) {
      problems.push({ level: "error", file, ...problem });
    }
    return undefined;
  }

  const segments = relDir.split("/");
  const group = segments[0] ?? relDir;
  const title = firstHeading(parsed.body);
  const skill: Skill = {
    name: segments[segments.length - 1] ?? relDir,
    relDir,
    group,
    isWorkflow: group === "workflows",
    frontmatter: parsed.value,
    frontmatterLines: { start: parsed.startLine, end: parsed.endLine },
    ...(title === undefined ? {} : { title }),
  };

  const nameNode = parsed.document.get("name", true);
  const descriptionNode = parsed.document.get("description", true);
  setSkillLines(skill, {
    ...(nameNode === undefined ? {} : { name: parsed.lineOf(nameNode) }),
    ...(descriptionNode === undefined ? {} : { description: parsed.lineOf(descriptionNode) }),
  });

  return skill;
}

export async function discoverSkills(root: string): Promise<DiscoveryResult> {
  const result: DiscoveryResult = { skills: [], problems: [] };
  const factoryDir = path.join(root, ".factory");

  async function walk(dir: string, relDir: string, parentSkill: string | undefined): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (isAbsentError(error)) return;
      const file = factoryPath(relDir);
      result.problems.push({
        level: "error",
        file,
        line: 1,
        message: `Cannot read directory ${file}`,
        fix: "Check its permissions or restore the directory",
      });
      return;
    }
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

    const hasSkill = entries.some((entry) => entry.name === "SKILL.md" && entry.isFile());

    if (hasSkill) {
      if (relDir === "") {
        result.problems.push(...ruleTopLevelSkill(".factory/SKILL.md"));
      } else if (parentSkill !== undefined) {
        result.problems.push(
          ...rule3NoNestedSkills(
            `${factoryPath(relDir)}/SKILL.md`,
            1,
            factoryPath(relDir),
            factoryPath(parentSkill),
          ),
        );
        return;
      } else {
        const skill = await loadSkill(dir, relDir, result.problems);
        if (skill !== undefined) result.skills.push(skill);
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const childRelDir = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
      const childParentSkill = hasSkill && relDir !== "" ? relDir : parentSkill;
      await walk(path.join(dir, entry.name), childRelDir, childParentSkill);
    }
  }

  await walk(factoryDir, "", undefined);
  result.skills.sort((left, right) => (left.relDir < right.relDir ? -1 : left.relDir > right.relDir ? 1 : 0));
  return result;
}
