import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Problem } from "../../errors.js";
import { didYouMean } from "../../util/suggest.js";
import { toLF } from "../../util/text.js";
import { collectSkillFiles, textContent } from "../build/skill.js";
import type { Factory } from "../factory/types.js";
import { conditionVariables } from "./condition.js";
import { directiveLines, parseMarkdown } from "./directives.js";
import type { MarkdownDocument, Node } from "./directives.js";
import { createImportCache } from "./imports.js";
import { markdownParts } from "./markdown.js";
import { rendersContent } from "./render.js";
import { MAX_COMBINATIONS, allValues, combinations } from "./scenarios.js";
import type { EnvVariable } from "./types.js";

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
  // One cache per run, so a partial imported by several files is read once and
  // an edited partial is always reread by the next run.
  const imports = createImportCache(factory.dir);

  const checkFile = async (
    file: string,
    route: string,
    text: string,
    frontmatter: boolean,
  ): Promise<MarkdownDocument | undefined> => {
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

    const document = await parseMarkdown(parts?.body ?? text, {
      file,
      firstLine: parts?.firstLine ?? 1,
      variables,
      imports,
      route,
      chain: [],
    });
    problems.push(...document.problems);
    problems.push(...importCombinationProblems(document, variables));
    return document;
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
      await checkFile(displayPath, `${skill.relDir}/${file.relative}`, text, true);
    }
  }

  // `.factory/AGENTS.md` is rendered whole, so it has no frontmatter to protect.
  if (factory.agentsMd !== undefined) {
    await checkFile(AGENTS_FILE, "AGENTS.md", factory.agentsMd, false);
  }

  // `run.md` is a partial, and an `automation.md` body is checked like a skill's
  // Markdown: both are rendered for every selection.
  const automations = factory.automations;
  if (automations !== undefined) {
    if (automations.runFile !== undefined) {
      const text = await readMarkdown(
        path.join(factory.dir, "automations", "run.md"),
        automations.runFile,
        problems,
      );
      if (text !== undefined) {
        await checkFile(automations.runFile, "automations/run.md", text, true);
      }
    }

    // Every parsed body is checked, including one whose frontmatter has no
    // valid owner and so yields no runnable automation.
    for (const body of automations.bodies) {
      const text = await readMarkdown(
        path.join(factory.dir, "automations", body.name, "automation.md"),
        body.file,
        problems,
      );
      if (text === undefined) continue;

      const document = await checkFile(
        body.file,
        `automations/${body.name}/automation.md`,
        text,
        true,
      );
      if (document === undefined) continue;

      // Rendering alone is not enough: a block that applies to only some values
      // still renders its label line, even when it holds only blank lines. A
      // body that is only the heading `prompt` prints has nothing else to say.
      if (
        !rendersContent(
          document,
          { variables, selection: allValues(variables) },
          `# ${body.name}`,
        )
      ) {
        problems.push({
          level: "error",
          file: body.file,
          line: body.bodyLine,
          message: `The body of ${body.name} is empty`,
          fix: "Write what the run does in the body, below the frontmatter",
        });
      }
    }
  }

  if (format === 2) problems.push(...conditionalSkillProblems(factory));

  return dedupeProblems(problems);
}

/** One import node's children, with the file they come from and its conditions. */
interface ImportWalk {
  /** Repository-relative name of the file holding these nodes. */
  file: string;
  /** The nearest enclosing import directive: where a cross-file problem is reported. */
  origin?: { file: string; line: number };
  /** Variables named by the conditions above the nearest import. */
  foreign: ReadonlySet<string>;
  /** Variables named by the conditions in this file, below the nearest import. */
  local: ReadonlySet<string>;
}

/**
 * The combination limit across an import: a block inside an imported file is
 * classified together with the conditions around the import line, so the two
 * files' variables can span more scenarios than either file alone. Each file's
 * own parse checks its blocks against its own enclosing conditions, so this
 * reports only the blocks an import pushes over the limit, on the import
 * directive's line in the importing file.
 *
 * Rendering classifies each block over its enclosing conditions, so a renderer
 * must treat these as errors too: without them it would enumerate every
 * scenario of a block this reports.
 */
export function importCombinationProblems(
  document: MarkdownDocument,
  variables: readonly EnvVariable[],
): Problem[] {
  const problems: Problem[] = [];

  const walk = (nodes: readonly Node[], state: ImportWalk): void => {
    for (const node of nodes) {
      if (node.kind === "text") continue;

      if (node.kind === "import") {
        walk(node.children, {
          file: node.file ?? state.file,
          origin: { file: state.file, line: node.line },
          foreign: new Set([...state.foreign, ...state.local]),
          local: new Set<string>(),
        });
        continue;
      }

      const own =
        node.kind === "when" ? conditionVariables(node.condition) : new Set([node.variable]);
      const local = new Set([...state.local, ...own]);
      const all = new Set([...state.foreign, ...local]);

      if (state.origin !== undefined) {
        const count = combinations(all, variables);
        if (count > MAX_COMBINATIONS && combinations(local, variables) <= MAX_COMBINATIONS) {
          problems.push({
            level: "error",
            file: state.origin.file,
            line: state.origin.line,
            message: `Condition on line ${node.line} of ${state.file} spans too many combinations here: ${count} over ${[...all].join(", ")}; the limit is ${MAX_COMBINATIONS}`,
            fix: "Import it outside the enclosing blocks, or split the condition",
          });
        }
      }

      const children =
        node.kind === "when" ? node.children : node.branches.flatMap((branch) => branch.children);
      walk(children, { ...state, local });
    }
  };

  walk(document.nodes, { file: document.file, foreign: new Set(), local: new Set() });
  return problems;
}

/**
 * Keeps one problem per file, line and message, so a partial imported by several
 * files reports each of its own problems once.
 */
function dedupeProblems(problems: readonly Problem[]): Problem[] {
  const seen = new Set<string>();

  return problems.filter((problem) => {
    const key = `${problem.file}\u0000${problem.line ?? 0}\u0000${problem.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
