import { readFile } from "node:fs/promises";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { toLF } from "../../util/text.js";
import { dedupeReadErrors, textContent } from "../build/skill.js";
import { scanFactoryFiles } from "../check/markers.js";
import { parseMarkdown } from "../env/directives.js";
import type { MarkdownDocument, Node } from "../env/directives.js";
import { createImportCache } from "../env/imports.js";
import type { ImportCache } from "../env/imports.js";
import { markdownParts } from "../env/markdown.js";
import { renderDocument, rendersContent } from "../env/render.js";
import type { EnvSelection, EnvVariable } from "../env/types.js";
import type { Factory } from "../factory/types.js";
import type { Automation } from "./types.js";
import { automationFile } from "./validate.js";

/** The prompt's fixed first line, and the last line when a run follows. */
const FIRST_LINE = "Run the factory automation";
const AFTER_LINE =
  "When this run ends, start each automation that runs after it, as the run instructions say:";

/**
 * The automations that run after `name`: enabled ones whose `after` names it,
 * sorted by name. A disabled automation is never started by a chain, so it is
 * not listed.
 */
export function afterOf(name: string, list: readonly Automation[]): string[] {
  return list
    .filter(
      (automation) =>
        automation.enabled &&
        automation.triggers.some(
          (trigger) => trigger.kind === "after" && trigger.names.includes(name),
        ),
    )
    .map((automation) => automation.name)
    .sort();
}

/**
 * The text of one run, as the spec's The prompt says: the fixed first line, the
 * rendered run instructions when the factory has them, the automation's name as
 * a heading with the rendered body directly below it, and the line naming the
 * automations that start when this run ends. It ends with one newline.
 *
 * A selection that leaves the body with no text is an error: the run has
 * nothing to do, and the caller reports it as `has nothing to do in this
 * environment`.
 */
export async function renderPrompt(
  factory: Factory,
  automation: Automation,
  selection: EnvSelection,
  after: readonly string[],
): Promise<string> {
  const variables = factory.factoryYaml?.env ?? [];
  const imports = createImportCache(factory.dir);

  const runText = await renderRunFile(factory, variables, selection, imports);
  const body = await parseBody(automation, variables, imports);
  const ownHeading = `# ${automation.name}`;

  if (!rendersContent(body, { variables, selection }, ownHeading)) {
    const message = `${automation.name} has nothing to do in this environment`;
    throw new MetafabError(message, {
      exitCode: ExitCode.Failed,
      problems: [
        {
          level: "error",
          file: automation.file,
          line: automation.bodyLine,
          message,
          fix: "Add text for this environment, or select one where the body has some",
        },
      ],
    });
  }

  const sections = [
    `${FIRST_LINE} \`${automation.name}\` unattended. Nobody is watching this session.`,
  ];
  const run = section(runText);
  if (run !== "") sections.push(run);
  // The template puts the name on its own line directly above the body, so a
  // body that starts with the same heading leaves it out rather than show it
  // twice, and the blank lines around it are trimmed rather than kept.
  const text = section(
    withoutOwnHeading(renderDocument(body, { variables, selection }), ownHeading),
  );
  sections.push(`${ownHeading}\n${text}`);

  if (after.length > 0) {
    const names = after.map((name) => `\`${name}\``).join(", ");
    sections.push(`${AFTER_LINE} ${names}.`);
  }

  return `${sections.join("\n\n")}\n`;
}

/**
 * The problems that stop a prompt: errors in a file the prompt depends on,
 * plus a loop that passes through the automation. Every other problem is
 * ignored, so one broken automation never stops another run.
 *
 * The dependency set is the automation's own file, `run.md`, the automation.md
 * of each enabled automation on its after line (the ones the prompt tells the
 * run to start), and every file reached by an import while the body or `run.md`
 * is rendered. An imported file is kept under every name it is known by: the
 * route the validator reports problems under, the name on the import node, and
 * the realpath name the import cache records, which differ when a symbolic link
 * is on the route.
 *
 * `check`'s scanners report what the loader cannot, such as an unresolved
 * conflict marker, so their problems for the same files stop the prompt too.
 */
export async function promptProblems(name: string, factory: Factory): Promise<Problem[]> {
  const automation = factory.automations?.list.find((entry) => entry.name === name);
  if (automation === undefined) return [];

  const dependencies = await promptDependencies(factory, automation);
  const scanned = await scanFactoryFiles(factory.root);
  return dedupeReadErrors([...factory.problems, ...scanned]).filter(
    (problem) =>
      problem.level === "error" &&
      (dependencies.has(problem.file) || cycleThrough(problem, name)),
  );
}

/** True for a loop problem whose loop names the automation. */
function cycleThrough(problem: Problem, name: string): boolean {
  if (!problem.message.startsWith("cycle: ")) return false;
  return problem.message.slice("cycle: ".length).split(" → ").includes(name);
}

async function promptDependencies(
  factory: Factory,
  automation: Automation,
): Promise<Set<string>> {
  const dependencies = new Set<string>([automation.file]);
  const automations = factory.automations;
  if (automations === undefined) return dependencies;
  if (automations.runFile !== undefined) dependencies.add(automations.runFile);

  // The after line names the automations that start when this run ends, so
  // those are the automation.md files the prompt depends on: not the ones this
  // automation itself runs after.
  for (const name of afterOf(automation.name, automations.list)) {
    dependencies.add(automationFile(name));
  }

  const variables = factory.factoryYaml?.env ?? [];
  const imports = createImportCache(factory.dir);

  const collect = async (
    file: string,
    route: string,
    text: string,
    firstLine: number,
  ): Promise<void> => {
    const document = await parseMarkdown(text, { file, firstLine, variables, imports, route });
    for (const node of importNodes(document.nodes)) {
      if (node.file !== undefined) dependencies.add(node.file);
    }
  };

  const run = await readRunFile(factory);
  if (run !== undefined && automations.runFile !== undefined) {
    await collect(automations.runFile, "automations/run.md", run.text, run.firstLine);
  }
  await collect(
    automation.file,
    `automations/${automation.name}/automation.md`,
    automation.body,
    automation.bodyLine,
  );

  for (const loaded of imports.files.values()) dependencies.add(loaded.file);
  return dependencies;
}

/** Every import node below these nodes, nested imports included. */
function* importNodes(nodes: readonly Node[]): Generator<Extract<Node, { kind: "import" }>> {
  for (const node of nodes) {
    if (node.kind === "text") continue;
    if (node.kind === "import") {
      yield node;
      yield* importNodes(node.children);
      continue;
    }
    const children =
      node.kind === "when" ? node.children : node.branches.flatMap((branch) => branch.children);
    yield* importNodes(children);
  }
}

async function parseBody(
  automation: Automation,
  variables: readonly EnvVariable[],
  imports: ImportCache,
): Promise<MarkdownDocument> {
  return parseMarkdown(automation.body, {
    file: automation.file,
    firstLine: automation.bodyLine,
    variables,
    imports,
    route: `automations/${automation.name}/automation.md`,
  });
}

interface RunFile {
  text: string;
  firstLine: number;
}

/** `run.md` without its frontmatter, as an import is read. */
async function readRunFile(factory: Factory): Promise<RunFile | undefined> {
  let data: Buffer;
  try {
    data = await readFile(path.join(factory.dir, "automations", "run.md"));
  } catch {
    return undefined;
  }

  const decoded = textContent(data);
  if (decoded === undefined) return undefined;

  const text = toLF(decoded.startsWith("\uFEFF") ? decoded.slice(1) : decoded);
  const parts = markdownParts(text);
  return { text: parts.body, firstLine: parts.firstLine };
}

/** `run.md` rendered like an import: directives applied, frontmatter gone. */
async function renderRunFile(
  factory: Factory,
  variables: readonly EnvVariable[],
  selection: EnvSelection,
  imports: ImportCache,
): Promise<string> {
  const run = await readRunFile(factory);
  if (run === undefined) return "";

  const document = await parseMarkdown(run.text, {
    file: factory.automations?.runFile ?? ".factory/automations/run.md",
    firstLine: run.firstLine,
    variables,
    imports,
    route: "automations/run.md",
  });
  return renderDocument(document, { variables, selection });
}

/**
 * The rendered body without its first non-blank line when that line is the
 * heading the prompt prints, so the name appears once. Any other heading, such
 * as `# Other` or `## <name>`, is the body's own and is kept.
 */
function withoutOwnHeading(text: string, ownHeading: string): string {
  const lines = text.split("\n");
  const index = lines.findIndex((line) => line.trim() !== "");
  const first = lines[index];
  if (first === undefined || first.trimEnd() !== ownHeading) return text;
  lines.splice(index, 1);
  return lines.join("\n");
}

/**
 * A section of the prompt: no leading blank lines, and no trailing whitespace,
 * so the blank line between sections is the only one there.
 */
function section(text: string): string {
  return text.replace(/^\n+/, "").trimEnd();
}
