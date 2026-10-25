import path from "node:path";
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

function problem(file: string, message: string, fix?: string): Problem {
  return {
    level: "error",
    file,
    message,
    ...(fix === undefined ? {} : { fix }),
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

function validateWorkflowName(workflow: string): void {
  if (workflow !== "") return;

  const message = "A pipeline entry must name a workflow.";
  throw pipelineError("pipeline-entry-invalid", message, [problem(FACTORY_FILE, message)]);
}

function validateStop(stop: string): void {
  if (stop !== "" && isSingleLine(stop)) return;

  const message = "The pipeline stop must be a non-empty single line.";
  throw pipelineError("pipeline-stop-invalid", message, [
    problem(FACTORY_FILE, message, "Write the stop on one line"),
  ]);
}

export async function addWorkflow(
  root: string,
  workflow: string,
  options: AddWorkflowOptions = {},
): Promise<AddWorkflowResult> {
  validateWorkflowName(workflow);
  if (options.stop !== undefined) validateStop(options.stop);

  const factory = await loadFactory(root);
  requireWorkflow(factory.skills, workflow);

  const existing = await readFactoryYamlText(factory.dir);
  const created = existing === undefined;
  const text = existing ?? createFactoryYamlText(deriveFactoryName(path.basename(root)));
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
  validateWorkflowName(workflow);

  const factory = await loadFactory(root);
  const text = await readFactoryYamlText(factory.dir);

  if (text === undefined) {
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
