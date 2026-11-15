import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Problem } from "../../errors.js";
import { didYouMean } from "../../util/suggest.js";
import { toLF } from "../../util/text.js";
import { collectSkillFiles, textContent } from "../build/skill.js";
import type { Factory } from "../factory/types.js";
import { directiveLines, parseMarkdown } from "./directives.js";
import { markdownParts } from "./markdown.js";

const FACTORY_FILE = ".factory/factory.yaml";
const AGENTS_FILE = ".factory/AGENTS.md";
const FRONTMATTER_MESSAGE = "Directives are not allowed in frontmatter";
const FRONTMATTER_FIX =
  "Move the directive below the closing ---; name and description stay the same in every environment";
const FORMAT_ONE_FIX = "Set format: 2 in .factory/factory.yaml, or remove the directives";

/** True for a file `build` renders: its extension, lowercased, is `.md`. */
function isRenderedMarkdown(relative: string): boolean {
  return path.extname(relative).toLowerCase() === ".md";
}

async function readMarkdown(
  target: string,
  file: string,
  problems: Problem[],
): Promise<string | undefined> {
  let data: Buffer;
  try {
    data = await readFile(target);
  } catch {
    problems.push({
      level: "error",
      file,
      line: 1,
      message: `Cannot read file ${file}`,
      fix: "Check its permissions or restore the file",
    });
    return undefined;
  }

  const text = textContent(data);
  return text === undefined ? undefined : toLF(text);
}

/**
 * Rule 14 for a format 2 factory, and directives rule 5 for a format 1 one.
 * Format 2 validates every directive, condition and switch in every branch of
 * every file `build` renders, whatever the selection, and every `skills` entry.
 * Format 1 copies directives as text, so each file that has one gets a single
 * warning on its first directive line.
 */
export async function environmentProblems(factory: Factory): Promise<Problem[]> {
  const problems: Problem[] = [];
  const yaml = factory.factoryYaml;
  const format = yaml?.format ?? 1;
  const variables = yaml?.env ?? [];

  const checkFile = (file: string, text: string, frontmatter: boolean): void => {
    if (format === 1) {
      const lines = directiveLines(text);
      if (lines.length > 0) {
        problems.push({
          level: "warning",
          file,
          line: lines[0],
          message: `${file} has factory: directives, which need format: 2`,
          fix: FORMAT_ONE_FIX,
        });
      }
      return;
    }

    const parts = frontmatter ? markdownParts(text) : undefined;
    if (parts?.frontmatter !== undefined) {
      for (const line of directiveLines(parts.frontmatter, 2)) {
        problems.push({
          level: "error",
          file,
          line,
          message: FRONTMATTER_MESSAGE,
          fix: FRONTMATTER_FIX,
        });
      }
    }

    problems.push(
      ...parseMarkdown(parts?.body ?? text, {
        file,
        firstLine: parts?.firstLine ?? 1,
        variables,
      }).problems,
    );
  };

  for (const skill of factory.skills) {
    const sourcePath = `.factory/${skill.relDir}`;
    const collected = await collectSkillFiles(
      { dir: path.join(factory.dir, ...skill.relDir.split("/")), name: skill.name, sourcePath },
      { factoryDir: factory.dir },
    );

    for (const file of collected.files) {
      if (!isRenderedMarkdown(file.relative)) continue;
      const displayPath = `${sourcePath}/${file.relative}`;
      const text = await readMarkdown(file.target, displayPath, problems);
      if (text === undefined) continue;
      checkFile(displayPath, text, true);
    }
  }

  // `.factory/AGENTS.md` is rendered whole, so it has no frontmatter to protect.
  if (factory.agentsMd !== undefined) checkFile(AGENTS_FILE, factory.agentsMd, false);

  if (format === 2) problems.push(...conditionalSkillProblems(factory));

  return problems;
}

/**
 * The `skills` checks that need the loaded factory: each entry names a skill,
 * and no workflow the pipeline names carries one, because the pipeline is the
 * same for every developer and must name installed workflows.
 */
function conditionalSkillProblems(factory: Factory): Problem[] {
  const yaml = factory.factoryYaml;
  if (yaml === undefined) return [];

  const problems: Problem[] = [];
  const names = factory.skills.map((skill) => skill.name);
  const pipeline = new Set(yaml.pipeline.map((entry) => entry.workflow));

  for (const entry of yaml.skills) {
    if (!names.includes(entry.name)) {
      problems.push({
        level: "error",
        file: FACTORY_FILE,
        line: entry.line,
        message: `skills names unknown skill "${entry.name}"`,
        fix:
          didYouMean(entry.name, names) ??
          (names.length === 0
            ? "Remove the entry, or add the skill under .factory/skills/"
            : `Use one of: ${names.join(", ")}`),
      });
      continue;
    }

    if (pipeline.has(entry.name)) {
      problems.push({
        level: "error",
        file: FACTORY_FILE,
        line: entry.line,
        message: `"${entry.name}" is in the pipeline, so it cannot have a skills entry`,
        fix: "Remove the entry: the pipeline names installed workflows for everyone",
      });
    }
  }

  return problems;
}
