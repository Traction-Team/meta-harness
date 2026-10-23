import { isMap, isScalar, isSeq } from "yaml";
import type { Pair } from "yaml";
import type { Problem } from "../../errors.js";
import { isSingleLine } from "../../util/text.js";
import { parseYaml } from "../../util/yaml.js";
import type { YamlDocument } from "../../util/yaml.js";
import type { FactoryYaml, PipelineEntry } from "./types.js";
import {
  KNOWN_FACTORY_FIELDS,
  rule6FactoryDescription,
  rule6FactoryName,
  rule6UnknownFactoryField,
  rule6UnknownPipelineOption,
  rule7FactoryYaml,
  rule9PipelineOptions,
} from "./validate.js";

export interface FactoryYamlParseResult {
  yaml?: FactoryYaml;
  problems: Problem[];
}

type Field = { value: unknown; line: number; node: unknown };

function scalarString(node: unknown): string | undefined {
  return isScalar(node) && typeof node.value === "string" ? node.value : undefined;
}

function isKnownField(key: string): boolean {
  return (KNOWN_FACTORY_FIELDS as readonly string[]).includes(key);
}

function parsePipelineEntry(
  item: unknown,
  parsed: Extract<ReturnType<typeof parseYaml>, { ok: true }>,
  file: string,
  problems: Problem[],
): PipelineEntry | undefined {
  const line = parsed.lineOf(item);

  if (isScalar(item)) {
    const workflow = scalarString(item);
    if (workflow === undefined || workflow === "") {
      problems.push({
        level: "error",
        file,
        line,
        message: "Pipeline entry must be a workflow name",
        fix: "Use - <workflow>",
      });
      return undefined;
    }
    return { workflow, line };
  }

  if (!isMap(item)) {
    problems.push({
      level: "error",
      file,
      line,
      message: "Pipeline entry must be a workflow name or a mapping",
      fix: "Use - <workflow> or - <workflow>: { stop: <text> }",
    });
    return undefined;
  }

  if (item.items.length === 0) {
    problems.push({
      level: "error",
      file,
      line,
      message: "Pipeline entry must name a workflow",
      fix: "Use - <workflow>",
    });
    return undefined;
  }

  if (item.items.length > 1) {
    problems.push({
      level: "error",
      file,
      line,
      message: "Pipeline entry must contain exactly one workflow",
      fix: "Use one workflow per entry",
    });
    return undefined;
  }

  const pair = item.items[0]!;
  const workflow = scalarString(pair.key);
  if (workflow === undefined || workflow === "") {
    problems.push({
      level: "error",
      file,
      line,
      message: "Pipeline entry must name a workflow",
      fix: "Use - <workflow>",
    });
    return undefined;
  }

  let stop: string | undefined;
  const options = pair.value;
  if (!isMap(options)) {
    problems.push({
      level: "error",
      file,
      line: options === null ? line : parsed.lineOf(options),
      message: `Options for "${workflow}" must be a mapping`,
      fix: "Use {} or { stop: <text> }",
    });
    return { workflow, line };
  }

  for (const option of options.items as Pair<unknown, unknown>[]) {
    const key = scalarString(option.key);
    if (key === undefined) continue;
    const optionLine = parsed.lineOf(option.key);

    if (key === "stop") {
      const value = option.value;
      if (!isScalar(value) || typeof value.value !== "string" || value.value === "") {
        problems.push({
          level: "error",
          file,
          line: optionLine,
          message: 'Pipeline option "stop" must be a non-empty string',
          fix: "Write a one-line stop instruction",
        });
      } else if (!isSingleLine(value.value)) {
        problems.push({
          level: "error",
          file,
          line: optionLine,
          message: 'Pipeline option "stop" must be a single line',
          fix: "Write the stop instruction on one line",
        });
      } else {
        stop = value.value;
      }
      continue;
    }

    const reserved = rule9PipelineOptions(file, key, optionLine);
    if (reserved.length > 0) {
      problems.push(...reserved);
    } else {
      problems.push(...rule6UnknownPipelineOption(file, key, optionLine));
    }
  }

  return stop === undefined ? { workflow, line } : { workflow, stop, line };
}

export function parseFactoryYaml(text: string, file: string): FactoryYamlParseResult {
  const parsed = parseYaml(text);
  if (!parsed.ok) {
    return {
      problems: parsed.problems.map((problem) => ({ level: "error" as const, file, ...problem })),
    };
  }

  const problems: Problem[] = [];
  const pairs = new Map<string, Pair<unknown, unknown>>();
  const contents = parsed.document.contents;
  if (isMap(contents)) {
    for (const pair of contents.items as Pair<unknown, unknown>[]) {
      const key = scalarString(pair.key);
      if (key === undefined) continue;
      if (!isKnownField(key)) {
        problems.push(...rule6UnknownFactoryField(file, key, parsed.lineOf(pair.key)));
      } else if (!pairs.has(key)) {
        pairs.set(key, pair);
      }
    }
  }

  const field = (name: string, parsedDocument: YamlDocument): Field | undefined => {
    const pair = pairs.get(name);
    if (pair === undefined) return undefined;
    return {
      value: parsedDocument.value[name],
      line: parsedDocument.lineOf(pair.key),
      node: pair.value,
    };
  };

  const formatField = field("format", parsed);
  const nameField = field("name", parsed);
  const descriptionField = field("description", parsed);
  const pipelineField = field("pipeline", parsed);

  problems.push(
    ...rule7FactoryYaml(file, {
      ...(formatField === undefined ? {} : { format: { value: formatField.value, line: formatField.line } }),
      ...(nameField === undefined ? {} : { name: { value: nameField.value, line: nameField.line } }),
    }),
  );

  let name: string | undefined;
  if (nameField !== undefined) {
    const nameProblems = rule6FactoryName(file, { value: nameField.value, line: nameField.line });
    problems.push(...nameProblems);
    if (nameProblems.length === 0) name = nameField.value as string;
  }

  let description: string | undefined;
  if (descriptionField !== undefined) {
    const descriptionProblems = rule6FactoryDescription(file, {
      value: descriptionField.value,
      line: descriptionField.line,
    });
    problems.push(...descriptionProblems);
    if (descriptionProblems.length === 0) description = descriptionField.value as string;
  }

  const pipeline: PipelineEntry[] = [];
  if (pipelineField !== undefined) {
    if (!isSeq(pipelineField.node)) {
      problems.push({
        level: "error",
        file,
        line: pipelineField.line,
        message: '"pipeline" must be a list',
        fix: "Write each workflow on its own - entry",
      });
    } else {
      for (const item of pipelineField.node.items) {
        const entry = parsePipelineEntry(item, parsed, file, problems);
        if (entry !== undefined) pipeline.push(entry);
      }
    }
  }

  const yaml: FactoryYaml | undefined =
    formatField?.value === 1 && name !== undefined
      ? {
          format: 1,
          name,
          ...(description === undefined ? {} : { description }),
          pipeline,
          doc: parsed.document,
        }
      : undefined;

  return { yaml, problems };
}
