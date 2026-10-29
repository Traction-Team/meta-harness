import { Document, isMap, isSeq, parseDocument } from "yaml";
import type { Pair, YAMLSeq } from "yaml";
import { MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { isSingleLine } from "../../util/text.js";
import type { PipelineEntry } from "../factory/types.js";
import { findField, scalarString, serializeYamlDocument } from "./document.js";

export const FACTORY_FILE = ".factory/factory.yaml";

const YAML_OPTIONS = {
  version: "1.2" as const,
  uniqueKeys: true,
  prettyErrors: true,
};

export type PipelineEntryInput = Pick<PipelineEntry, "workflow" | "stop">;

export interface AddPipelineEntryOptions {
  after?: string;
  stop?: string;
}

function problem(file: string, message: string, line?: number, fix?: string): Problem {
  return {
    level: "error",
    file,
    ...(line === undefined ? {} : { line }),
    message,
    ...(fix === undefined ? {} : { fix }),
  };
}

function invalidYaml(file: string, text: string): never {
  const doc = parseDocument(text, YAML_OPTIONS);
  const error = doc.errors[0];
  const message =
    error === undefined ? "Invalid YAML" : `Invalid YAML: ${error.message.split("\n")[0] ?? error.message}`;
  const line = error?.linePos?.[0]?.line;

  throw new MetafabError(`${file}: ${message}`, {
    code: "factory-yaml-invalid",
    problems: [problem(file, message, line, "Fix the YAML syntax on this line")],
  });
}

export function parseFactoryYamlDocument(text: string, file = FACTORY_FILE): Document.Parsed {
  const doc = parseDocument(text, YAML_OPTIONS);

  if (doc.errors.length > 0) invalidYaml(file, text);

  if (doc.contents !== null && !isMap(doc.contents)) {
    const message = "factory.yaml must be a YAML map";
    throw new MetafabError(`${file}: ${message}`, {
      code: "factory-yaml-invalid",
      problems: [problem(file, message, 1, "Start the file with format: 1 and name: <factory>")],
    });
  }

  return doc;
}

export function serializeFactoryYaml(doc: Document): string {
  return serializeYamlDocument(doc);
}

function pipelinePair(doc: Document, file: string): Pair<unknown, unknown> | undefined {
  const pair = findField(doc, "pipeline");
  if (pair === undefined) return undefined;

  if (!isSeq(pair.value)) {
    const message = '"pipeline" must be a list';
    throw new MetafabError(`${file}: ${message}`, {
      code: "factory-yaml-invalid",
      problems: [problem(file, message, 1, "Write each workflow on its own - entry")],
    });
  }

  return pair;
}

function ensurePipeline(doc: Document, file: string): YAMLSeq {
  const existing = pipelinePair(doc, file);
  if (existing !== undefined) return existing.value as YAMLSeq;

  const seq = doc.createNode([]) as YAMLSeq;
  const key = doc.createNode("pipeline");
  key.spaceBefore = isMap(doc.contents) && doc.contents.items.length > 0;
  doc.set(key, seq);
  return seq;
}

export function pipelineEntryName(item: unknown): string | undefined {
  const direct = scalarString(item);
  if (direct !== undefined) return direct;

  if (isMap(item) && item.items.length === 1) {
    return scalarString(item.items[0]!.key);
  }

  return undefined;
}

export function pipelineEntryNames(doc: Document): string[] {
  const contents = doc.contents;
  const pipeline = isMap(contents) ? findField(doc, "pipeline") : undefined;
  if (pipeline === undefined || !isSeq(pipeline.value)) return [];

  return pipeline.value.items
    .map((item) => pipelineEntryName(item))
    .filter((name): name is string => name !== undefined);
}

function findEntryIndex(seq: YAMLSeq, workflow: string): number {
  return seq.items.findIndex((item) => pipelineEntryName(item) === workflow);
}

function createEntry(doc: Document, workflow: string, stop: string | undefined) {
  if (stop === undefined) return doc.createNode(workflow);

  const options = doc.createNode({ stop });
  if (isMap(options)) options.flow = true;
  return doc.createNode({ [workflow]: options });
}

export function addPipelineEntry(
  doc: Document,
  workflow: string,
  options: AddPipelineEntryOptions = {},
  file = FACTORY_FILE,
): void {
  if (workflow === "") {
    throw new MetafabError("A pipeline entry must name a workflow.", {
      code: "pipeline-entry-invalid",
      problems: [problem(file, "A pipeline entry must name a workflow")],
    });
  }

  if (options.stop !== undefined && (options.stop === "" || !isSingleLine(options.stop))) {
    throw new MetafabError("The pipeline stop must be a non-empty single line.", {
      code: "pipeline-stop-invalid",
      problems: [problem(file, "The pipeline stop must be a non-empty single line", 1, "Write the stop on one line")],
    });
  }

  const seq = ensurePipeline(doc, file);
  const existing = findEntryIndex(seq, workflow);
  if (existing !== -1) {
    throw new MetafabError(`Pipeline already contains "${workflow}".`, {
      code: "pipeline-duplicate",
      problems: [problem(file, `Pipeline already contains "${workflow}"`, 1, "Remove it first to change its position or stop")],
    });
  }

  const entry = createEntry(doc, workflow, options.stop);

  if (options.after === undefined) {
    seq.items.push(entry);
    return;
  }

  const after = findEntryIndex(seq, options.after);
  if (after === -1) {
    throw new MetafabError(`Pipeline has no workflow "${options.after}".`, {
      code: "pipeline-after-missing",
      problems: [problem(file, `Pipeline has no workflow "${options.after}"`, 1, "Add it first or choose another entry")],
    });
  }

  seq.items.splice(after + 1, 0, entry);
}

export function removePipelineEntry(doc: Document, workflow: string): boolean {
  const contents = doc.contents;
  const pipeline = isMap(contents) ? findField(doc, "pipeline") : undefined;
  if (pipeline === undefined || !isSeq(pipeline.value)) return false;

  const index = findEntryIndex(pipeline.value, workflow);
  if (index === -1) return false;

  pipeline.value.items.splice(index, 1);
  return true;
}

export function createFactoryYamlText(
  name: string,
  pipeline: readonly PipelineEntryInput[] = [],
): string {
  const doc = new Document();
  doc.set("format", 1);
  doc.set("name", name);

  if (pipeline.length > 0) {
    const seq = doc.createNode([]) as YAMLSeq;
    for (const entry of pipeline) {
      seq.items.push(createEntry(doc, entry.workflow, entry.stop));
    }
    doc.set("pipeline", seq);
  }

  return serializeFactoryYaml(doc);
}

export function addPipelineEntryText(
  text: string,
  workflow: string,
  options: AddPipelineEntryOptions = {},
  file = FACTORY_FILE,
): string {
  const doc = parseFactoryYamlDocument(text, file);
  addPipelineEntry(doc, workflow, options, file);
  return serializeFactoryYaml(doc);
}

export function removePipelineEntryText(text: string, workflow: string, file = FACTORY_FILE): string {
  const doc = parseFactoryYamlDocument(text, file);
  removePipelineEntry(doc, workflow);
  return serializeFactoryYaml(doc);
}

