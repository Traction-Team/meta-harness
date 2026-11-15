import { isAlias, isMap, isScalar, isSeq } from "yaml";
import type { Document, Pair } from "yaml";
import type { Problem } from "../../errors.js";
import { didYouMean } from "../../util/suggest.js";
import { isSingleLine } from "../../util/text.js";
import { aliasProblems, parseYaml } from "../../util/yaml.js";
import type { YamlDocument } from "../../util/yaml.js";
import { parseEnvField } from "../env/declarations.js";
import type { EnvVariable } from "../env/types.js";
import type { FactoryYaml, PipelineEntry, Requirement } from "./types.js";
import {
  knownFormat,
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
  pipeline?: PipelineEntry[];
  requires?: Requirement[];
  problems: Problem[];
}

type Field = { value: unknown; line: number; node: unknown };

function resolveNode(node: unknown, doc: Document): unknown {
  return isAlias(node) ? node.resolve(doc) : node;
}

function lineAtOffset(text: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset && index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

/**
 * Problems for aliases in a `factory.yaml`: an alias such as `*missing` that
 * names no anchor before it, and a document that aliases one anchor too often
 * to convert safely.
 */
export function factoryAliasProblems(document: Document, text: string, file: string): Problem[] {
  return aliasProblems(document, (offset) => lineAtOffset(text, offset)).map((problem) => ({
    level: "error" as const,
    file,
    ...problem,
  }));
}

function scalarString(node: unknown): string | undefined {
  return isScalar(node) && typeof node.value === "string" ? node.value : undefined;
}

function isKnownField(key: string): boolean {
  return (KNOWN_FACTORY_FIELDS as readonly string[]).includes(key);
}

function parsePipelineEntry(
  itemNode: unknown,
  parsed: Extract<ReturnType<typeof parseYaml>, { ok: true }>,
  file: string,
  problems: Problem[],
): PipelineEntry | undefined {
  const line = parsed.lineOf(itemNode);
  const item = resolveNode(itemNode, parsed.document);

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
  const options = resolveNode(pair.value, parsed.document);
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
    const optionLine = parsed.lineOf(option.key);
    if (key === undefined) {
      problems.push({
        level: "error",
        file,
        line: optionLine,
        message: "Pipeline option names must be strings",
        fix: 'Remove the option or use the "stop" option',
      });
      continue;
    }

    if (key === "stop") {
      const value = resolveNode(option.value, parsed.document);
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

const REQUIREMENT_KEYS = ["path", "description", "template"] as const;

type RequirementKey = (typeof REQUIREMENT_KEYS)[number];

function requirementString(
  key: RequirementKey,
  node: unknown,
  line: number,
  file: string,
  problems: Problem[],
): string | undefined {
  if (
    !isScalar(node) ||
    typeof node.value !== "string" ||
    node.value === "" ||
    !isSingleLine(node.value)
  ) {
    problems.push({
      level: "error",
      file,
      line,
      message: `"${key}" in a requires entry must be a non-empty, single-line string`,
      fix: `Write the ${key} on one line`,
    });
    return undefined;
  }

  return node.value;
}

function parseRequirement(
  itemNode: unknown,
  parsed: Extract<ReturnType<typeof parseYaml>, { ok: true }>,
  file: string,
  problems: Problem[],
): Requirement | undefined {
  const line = parsed.lineOf(itemNode);
  const item = resolveNode(itemNode, parsed.document);

  if (!isMap(item)) {
    problems.push({
      level: "error",
      file,
      line,
      message: "requires entry must be a mapping",
      fix: "Use - path: <file>\n  description: <text>",
    });
    return undefined;
  }

  const fields = new Map<RequirementKey, { node: unknown; line: number }>();

  for (const pair of item.items as Pair<unknown, unknown>[]) {
    const key = scalarString(pair.key);
    const keyLine = parsed.lineOf(pair.key);

    if (key === undefined) {
      problems.push({
        level: "error",
        file,
        line: keyLine,
        message: "requires entry keys must be strings",
        fix: "Use path, description or template",
      });
      continue;
    }

    if (!(REQUIREMENT_KEYS as readonly string[]).includes(key)) {
      problems.push({
        level: "error",
        file,
        line: keyLine,
        message: `Unknown key "${key}" in a requires entry`,
        fix:
          didYouMean(key, REQUIREMENT_KEYS) ??
          "Remove the key or use path, description or template",
      });
      continue;
    }

    fields.set(key as RequirementKey, {
      node: resolveNode(pair.value, parsed.document),
      line: keyLine,
    });
  }

  let complete = true;
  for (const key of REQUIREMENT_KEYS) {
    if (key === "template") continue;
    if (fields.has(key)) continue;
    const fix = key === "path" ? "Add a path: <file> key" : "Add a one-line description";
    problems.push({
      level: "error",
      file,
      line,
      message: `requires entry is missing "${key}"`,
      fix,
    });
    complete = false;
  }

  const pathField = fields.get("path");
  const descriptionField = fields.get("description");
  const templateField = fields.get("template");

  const path = pathField === undefined
    ? undefined
    : requirementString("path", pathField.node, pathField.line, file, problems);
  const description = descriptionField === undefined
    ? undefined
    : requirementString("description", descriptionField.node, descriptionField.line, file, problems);
  const template = templateField === undefined
    ? undefined
    : requirementString("template", templateField.node, templateField.line, file, problems);

  if (!complete || path === undefined || description === undefined) return undefined;
  if (templateField !== undefined && template === undefined) return undefined;

  return template === undefined
    ? { path, description, line }
    : { path, description, template, line };
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
      if (key === undefined) {
        problems.push({
          level: "error",
          file,
          line: parsed.lineOf(pair.key),
          message: "factory.yaml field names must be strings",
          fix: "Use a string field name",
        });
        continue;
      }
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
      node: resolveNode(pair.value, parsedDocument.document),
    };
  };

  const formatField = field("format", parsed);
  const nameField = field("name", parsed);
  const descriptionField = field("description", parsed);
  const pipelineField = field("pipeline", parsed);
  const requiresField = field("requires", parsed);
  const envField = field("env", parsed);
  const format = formatField === undefined ? undefined : knownFormat(formatField);

  problems.push(
    ...rule7FactoryYaml(file, {
      ...(formatField === undefined
        ? {}
        : { format: { value: formatField.value, line: formatField.line, node: formatField.node } }),
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
    const pipelineNode = resolveNode(pipelineField.node, parsed.document);
    if (!isSeq(pipelineNode)) {
      problems.push({
        level: "error",
        file,
        line: pipelineField.line,
        message: '"pipeline" must be a list',
        fix: "Write each workflow on its own - entry",
      });
    } else {
      for (const item of pipelineNode.items) {
        const entry = parsePipelineEntry(item, parsed, file, problems);
        if (entry !== undefined) pipeline.push(entry);
      }
    }
  }

  const requires: Requirement[] = [];
  if (requiresField !== undefined) {
    const requiresNode = requiresField.node;
    // `requires:` with nothing after it means the factory requires no files.
    const isNullValue = isScalar(requiresNode) && requiresNode.value === null;
    if (!isNullValue) {
      if (!isSeq(requiresNode)) {
        problems.push({
          level: "error",
          file,
          line: requiresField.line,
          message: '"requires" must be a list',
          fix: "Write each required file as a - path: entry",
        });
      } else {
        for (const item of requiresNode.items) {
          const requirement = parseRequirement(item, parsed, file, problems);
          if (requirement !== undefined) requires.push(requirement);
        }
      }
    }
  }

  const env: EnvVariable[] = [];
  if (envField !== undefined) {
    const node = envField.node;
    env.push(...parseEnvField({ node, line: envField.line }, parsed, file, format, problems));
  }

  const yaml: FactoryYaml | undefined =
    format !== undefined && name !== undefined
      ? {
          format,
          name,
          ...(description === undefined ? {} : { description }),
          pipeline,
          requires,
          env,
          doc: parsed.document,
        }
      : undefined;

  return { yaml, pipeline, requires, problems };
}
