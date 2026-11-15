import path from "node:path";
import { isMap } from "yaml";
import type { Document } from "yaml";
import { MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { didYouMean } from "../../util/suggest.js";
import { loadFactory } from "../factory/load.js";
import type { Skill } from "../factory/types.js";
import { isSingleLine } from "../../util/text.js";
import {
  FACTORY_FILE,
  addPipelineEntry,
  createFactoryYamlText,
  parseFactoryYamlDocument,
  pipelineEntryNames,
  removePipelineEntry,
  serializeFactoryYaml,
} from "./factory-yaml.js";
import { readFactoryYamlText, writeFactoryYamlText } from "./files.js";
import { deriveFactoryName } from "./paths.js";

export interface AddWorkflowOptions {
  after?: string;
  stop?: string;
}

export interface AddWorkflowResult {
  root: string;
  workflow: string;
  after?: string;
  stop?: string;
  created: boolean;
  pipeline: string[];
}

export interface RemoveWorkflowResult {
  root: string;
  workflow: string;
  pipeline: string[];
}

function problem(file: string, message: string, fix: string): Problem {
  return {
    level: "error",
    file,
    message,
    fix,
  };
}

function pipelineError(code: string, message: string, problems: Problem[]): MetafabError {
  return new MetafabError(message, { code, problems });
}

function workflowNames(skills: readonly Skill[]): string[] {
  return skills.filter((skill) => skill.isWorkflow).map((skill) => skill.name);
}

function requireWorkflow(skills: readonly Skill[], workflow: string): void {
  const workflowSkills = skills.filter((skill) => skill.isWorkflow);
  if (workflowSkills.some((skill) => skill.name === workflow)) return;

  const names = workflowNames(skills);
  const suggestion = didYouMean(workflow, names);
  const skill = skills.find((candidate) => candidate.name === workflow);

  if (skill !== undefined) {
    const message = `"${workflow}" is a skill, not a workflow.`;
    throw pipelineError("pipeline-not-workflow", message, [
      problem(
        `.factory/${skill.relDir}/SKILL.md`,
        message,
        "Move it under .factory/workflows/ before adding it to the pipeline",
      ),
    ]);
  }

  const message = `No workflow named "${workflow}".`;
  throw pipelineError("pipeline-missing-workflow", message, [
    problem(
      `.factory/workflows/${workflow}/SKILL.md`,
      message,
      suggestion ?? `Create it with metafab create workflows/${workflow}`,
    ),
  ]);
}

function requireAfter(names: readonly string[], after: string): void {
  if (names.includes(after)) return;

  const suggestion = didYouMean(after, names);
  const message = `Pipeline has no workflow "${after}".`;
  throw pipelineError("pipeline-after-missing", message, [
    problem(
      FACTORY_FILE,
      message,
      suggestion ?? "Add it first or choose another pipeline entry",
    ),
  ]);
}

function validateWorkflowName(workflow: string, command: "add" | "remove"): void {
  if (workflow !== "") return;

  const message = "A pipeline entry must name a workflow.";
  throw pipelineError("pipeline-entry-invalid", message, [
    problem(FACTORY_FILE, message, `Name the workflow: metafab pipeline ${command} <workflow>`),
  ]);
}

function validateStop(stop: string): void {
  if (stop !== "" && isSingleLine(stop)) return;

  const message = "The pipeline stop must be a non-empty single line.";
  throw pipelineError("pipeline-stop-invalid", message, [
    problem(FACTORY_FILE, message, "Write the stop on one line"),
  ]);
}

function isEmptyDocument(doc: Document): boolean {
  if (doc.contents === null) return true;
  return isMap(doc.contents) && doc.contents.items.length === 0;
}

function isMarkerOrCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "" || trimmed === "---" || trimmed === "..." || trimmed.startsWith("#");
}

/** False when the file holds only comments and empty-document markers such as `---`. */
function hasDocumentContent(text: string): boolean {
  return text.split(/\r?\n/).some((line) => !isMarkerOrCommentLine(line));
}

/** Keeps the comment lines of an otherwise empty factory.yaml, dropping document markers and `{}`. */
function preservedComments(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    return trimmed === "" || trimmed.startsWith("#");
  });

  while (lines.length > 0 && lines[0]!.trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();

  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

export async function addWorkflow(
  root: string,
  workflow: string,
  options: AddWorkflowOptions = {},
): Promise<AddWorkflowResult> {
  validateWorkflowName(workflow, "add");
  if (options.stop !== undefined) validateStop(options.stop);

  const factory = await loadFactory(root);
  requireWorkflow(factory.skills, workflow);

  const existing = await readFactoryYamlText(factory.dir);
  let created = existing === undefined;
  let text = existing ?? createFactoryYamlText(deriveFactoryName(path.basename(root)));

  if (existing !== undefined) {
    const current = hasDocumentContent(existing) ? parseFactoryYamlDocument(existing) : undefined;
    if (current === undefined || isEmptyDocument(current)) {
      const header = createFactoryYamlText(deriveFactoryName(path.basename(root)));
      const comments = preservedComments(existing);
      text = comments === "" ? header : `${header}${comments}`;
      created = true;
    }
  }

  const doc = parseFactoryYamlDocument(text);

  if (options.after !== undefined) requireAfter(pipelineEntryNames(doc), options.after);

  addPipelineEntry(doc, workflow, options);
  const nextText = serializeFactoryYaml(doc);
  await writeFactoryYamlText(factory.dir, nextText);

  return {
    root,
    workflow,
    ...(options.after === undefined ? {} : { after: options.after }),
    ...(options.stop === undefined ? {} : { stop: options.stop }),
    created,
    pipeline: pipelineEntryNames(doc),
  };
}

export async function removeWorkflow(root: string, workflow: string): Promise<RemoveWorkflowResult> {
  validateWorkflowName(workflow, "remove");

  const factory = await loadFactory(root);
  const text = await readFactoryYamlText(factory.dir);

  if (text === undefined || !hasDocumentContent(text)) {
    const message = `The pipeline does not contain "${workflow}".`;
    throw pipelineError("pipeline-entry-missing", message, [
      problem(FACTORY_FILE, message, `Add it with metafab pipeline add ${workflow}`),
    ]);
  }

  const doc = parseFactoryYamlDocument(text);
  const names = pipelineEntryNames(doc);
  if (!names.includes(workflow)) {
    const suggestion = didYouMean(workflow, names);
    const message = `The pipeline does not contain "${workflow}".`;
    throw pipelineError("pipeline-entry-missing", message, [
      problem(FACTORY_FILE, message, suggestion ?? "Choose a workflow that is in the pipeline"),
    ]);
  }

  removePipelineEntry(doc, workflow);
  await writeFactoryYamlText(factory.dir, serializeFactoryYaml(doc));

  return { root, workflow, pipeline: pipelineEntryNames(doc) };
}
