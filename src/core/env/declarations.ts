import { isAlias, isMap, isScalar, isSeq } from "yaml";
import type { Pair } from "yaml";
import type { Problem } from "../../errors.js";
import { didYouMean } from "../../util/suggest.js";
import { isSingleLine } from "../../util/text.js";
import type { YamlDocument } from "../../util/yaml.js";
import { isNameFormatted, slugify } from "../factory/validate.js";
import type { EnvValue, EnvVariable } from "./types.js";

/** The `env` key of a `factory.yaml`: its value node and the line of the key. */
export interface EnvField {
  node: unknown;
  line: number;
}

const VARIABLE_KEYS = ["values", "description", "default"] as const;
const VALUE_KEYS = ["label"] as const;

function resolveNode(node: unknown, parsed: YamlDocument): unknown {
  return isAlias(node) ? node.resolve(parsed.document) : node;
}

function scalarString(node: unknown): string | undefined {
  return isScalar(node) && typeof node.value === "string" ? node.value : undefined;
}

function isNull(node: unknown): boolean {
  return isScalar(node) && node.value === null;
}

/** How a problem names a node that should have been a name. */
function nodeText(node: unknown): string {
  return isScalar(node) ? String(node.value) : "?";
}

/** A variable name starts with a letter, because Git config names must. */
export function isVariableName(name: string): boolean {
  return /^[a-z]/.test(name) && isNameFormatted(name);
}

function suggestedVariableName(name: string): string {
  const slug = slugify(name);
  return /^[0-9]/.test(slug) ? `v${slug}` : slug;
}

function labelFor(variable: string, value: string): string {
  return `When ${variable} is ${value}`;
}

function valueNameProblem(
  value: string,
  variable: string,
  line: number,
  file: string,
  problems: Problem[],
  fix: string,
): void {
  problems.push({
    level: "error",
    file,
    line,
    message: `Value "${value}" of "${variable}" must use lowercase letters, digits and single hyphens`,
    fix,
  });
}

function emptyValuesProblem(variable: string, line: number, file: string): Problem {
  return {
    level: "error",
    file,
    line,
    message: `"values" of "${variable}" must be a non-empty list or mapping of value names`,
    fix: "Write values: [<name>, ...] or values: { <name>: { label: <text> } }",
  };
}

function defaultShapeProblem(variable: string, line: number, file: string): Problem {
  return {
    level: "error",
    file,
    line,
    message: `"default" of "${variable}" must be a value name or a non-empty list of value names`,
    fix: "Write default: <name> or default: [<name>, ...]",
  };
}

function parseDescription(
  variable: string,
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
      message: `"description" of "${variable}" must be a non-empty, single-line string`,
      fix: "Write the description on one line",
    });
    return undefined;
  }
  return node.value;
}

/** The declared label of a mapping entry, or undefined when it has none. */
function parseValueEntry(
  variable: string,
  value: string,
  node: unknown,
  parsed: YamlDocument,
  file: string,
  problems: Problem[],
): string | undefined {
  if (isNull(node)) return undefined;

  if (!isMap(node)) {
    problems.push({
      level: "error",
      file,
      line: parsed.lineOf(node),
      message: `Value "${value}" of "${variable}" must be null or { label: <text> }`,
      fix: "Use null, or { label: <text> }",
    });
    return undefined;
  }

  let label: string | undefined;
  for (const pair of node.items as Pair<unknown, unknown>[]) {
    const key = scalarString(pair.key);
    const keyLine = parsed.lineOf(pair.key);

    if (key !== "label") {
      const shown = key ?? nodeText(pair.key);
      problems.push({
        level: "error",
        file,
        line: keyLine,
        message: `Unknown key "${shown}" in value "${value}"`,
        fix: didYouMean(shown, VALUE_KEYS) ?? "Remove the key or use label",
      });
      continue;
    }

    const labelNode = resolveNode(pair.value, parsed);
    if (
      !isScalar(labelNode) ||
      typeof labelNode.value !== "string" ||
      labelNode.value === "" ||
      !isSingleLine(labelNode.value)
    ) {
      problems.push({
        level: "error",
        file,
        line: keyLine,
        message: `"label" of value "${value}" must be a non-empty, single-line string`,
        fix: "Write the label on one line",
      });
      continue;
    }
    label = labelNode.value;
  }

  return label;
}

function parseValues(
  variable: string,
  node: unknown,
  line: number,
  parsed: YamlDocument,
  file: string,
  problems: Problem[],
): EnvValue[] {
  if (isSeq(node)) {
    if (node.items.length === 0) {
      problems.push(emptyValuesProblem(variable, line, file));
      return [];
    }

    const values: EnvValue[] = [];
    const seen = new Set<string>();

    for (const item of node.items) {
      const itemLine = parsed.lineOf(item);
      const itemNode = resolveNode(item, parsed);
      const name = scalarString(itemNode);

      if (name === undefined) {
        valueNameProblem(
          nodeText(itemNode),
          variable,
          itemLine,
          file,
          problems,
          "Write the value name as a string",
        );
        continue;
      }
      if (!isNameFormatted(name)) {
        valueNameProblem(
          name,
          variable,
          itemLine,
          file,
          problems,
          `Use a name like "${slugify(name)}"`,
        );
        continue;
      }
      if (seen.has(name)) {
        problems.push({
          level: "error",
          file,
          line: itemLine,
          message: `Value "${name}" of "${variable}" repeats`,
          fix: "Remove one of the values",
        });
        continue;
      }

      seen.add(name);
      values.push({ name, label: labelFor(variable, name), line: itemLine });
    }

    return values;
  }

  if (isMap(node)) {
    if (node.items.length === 0) {
      problems.push(emptyValuesProblem(variable, line, file));
      return [];
    }

    const values: EnvValue[] = [];
    for (const pair of node.items as Pair<unknown, unknown>[]) {
      const itemLine = parsed.lineOf(pair.key);
      const name = scalarString(pair.key);

      if (name === undefined) {
        valueNameProblem(
          nodeText(pair.key),
          variable,
          itemLine,
          file,
          problems,
          "Write the value name as a string",
        );
        continue;
      }
      if (!isNameFormatted(name)) {
        valueNameProblem(
          name,
          variable,
          itemLine,
          file,
          problems,
          `Use a name like "${slugify(name)}"`,
        );
        continue;
      }

      const label = parseValueEntry(
        variable,
        name,
        resolveNode(pair.value, parsed),
        parsed,
        file,
        problems,
      );
      values.push({ name, label: label ?? labelFor(variable, name), line: itemLine });
    }

    return values;
  }

  problems.push(emptyValuesProblem(variable, line, file));
  return [];
}

function parseDefault(
  variable: string,
  node: unknown,
  line: number,
  values: EnvValue[],
  parsed: YamlDocument,
  file: string,
  problems: Problem[],
): string[] | undefined {
  const declared = values.map((value) => value.name);

  let given: string[];
  if (isScalar(node) && typeof node.value === "string" && node.value !== "") {
    given = [node.value];
  } else if (isSeq(node) && node.items.length > 0) {
    given = [];
    for (const item of node.items) {
      const name = scalarString(resolveNode(item, parsed));
      if (name === undefined) {
        problems.push(defaultShapeProblem(variable, line, file));
        return undefined;
      }
      given.push(name);
    }
  } else {
    problems.push(defaultShapeProblem(variable, line, file));
    return undefined;
  }

  const defaults: string[] = [];
  for (const name of given) {
    if (!declared.includes(name)) {
      problems.push({
        level: "error",
        file,
        line,
        message: `Default "${name}" of "${variable}" is not one of its values`,
        fix: didYouMean(name, declared) ?? `Use one of: ${declared.join(", ")}`,
      });
      continue;
    }
    if (!defaults.includes(name)) defaults.push(name);
  }

  return defaults.length === 0 ? undefined : defaults;
}

function parseVariable(
  name: string,
  node: unknown,
  line: number,
  parsed: YamlDocument,
  file: string,
  problems: Problem[],
): EnvVariable | undefined {
  if (!isMap(node)) {
    problems.push({
      level: "error",
      file,
      line: parsed.lineOf(node),
      message: `Variable "${name}" must be a mapping with values`,
      fix: `Write ${name}: { values: [...] }`,
    });
    return undefined;
  }

  const fields = new Map<"values" | "description" | "default", { node: unknown; line: number }>();

  for (const pair of node.items as Pair<unknown, unknown>[]) {
    const key = scalarString(pair.key);
    const keyLine = parsed.lineOf(pair.key);
    const value = resolveNode(pair.value, parsed);

    if (key === "values" || key === "description" || key === "default") {
      fields.set(key, { node: value, line: keyLine });
      continue;
    }

    const shown = key ?? nodeText(pair.key);
    problems.push({
      level: "error",
      file,
      line: keyLine,
      message: `Unknown key "${shown}" in variable "${name}"`,
      fix:
        didYouMean(shown, VARIABLE_KEYS) ??
        "Remove the key or use values, description or default",
    });
  }

  const valuesField = fields.get("values");
  if (valuesField === undefined) {
    problems.push({
      level: "error",
      file,
      line,
      message: `Variable "${name}" is missing "values"`,
      fix: "Add a values: [<name>, ...] list",
    });
    return undefined;
  }

  const values = parseValues(name, valuesField.node, valuesField.line, parsed, file, problems);
  if (values.length === 0) return undefined;

  const descriptionField = fields.get("description");
  const description =
    descriptionField === undefined
      ? undefined
      : parseDescription(name, descriptionField.node, descriptionField.line, file, problems);

  const defaultField = fields.get("default");
  const defaultNames =
    defaultField === undefined
      ? undefined
      : parseDefault(name, defaultField.node, defaultField.line, values, parsed, file, problems);

  return {
    name,
    ...(description === undefined ? {} : { description }),
    values,
    ...(defaultNames === undefined ? {} : { default: defaultNames }),
    line,
  };
}

/**
 * Rule 14: `env` declares the variables a developer selects values for. Every
 * problem is an error on the key's or value's line, and the variables that
 * parse are still returned, as pipeline entries are.
 */
export function parseEnvField(
  field: EnvField,
  parsed: YamlDocument,
  file: string,
  format: 1 | 2 | undefined,
  problems: Problem[],
): EnvVariable[] {
  const node = resolveNode(field.node, parsed);

  if (format === 1) {
    problems.push({
      level: "error",
      file,
      line: field.line,
      message: '"env" needs format: 2',
      fix: "Set format: 2",
    });
  }

  // `env:` with nothing after it declares nothing.
  if (isNull(node)) return [];

  if (!isMap(node)) {
    problems.push({
      level: "error",
      file,
      line: parsed.lineOf(node),
      message: '"env" must be a mapping of variable names',
      fix: "Write each variable as <name>: { values: [...] }",
    });
    return [];
  }

  const variables: EnvVariable[] = [];
  for (const pair of node.items as Pair<unknown, unknown>[]) {
    const name = scalarString(pair.key);
    if (name === undefined || !isVariableName(name)) {
      const shown = name ?? nodeText(pair.key);
      problems.push({
        level: "error",
        file,
        line: parsed.lineOf(pair.key),
        message: `Variable name "${shown}" must start with a letter and use lowercase letters, digits and single hyphens`,
        fix: `Use a name like "${suggestedVariableName(shown)}"`,
      });
      continue;
    }

    const variable = parseVariable(
      name,
      resolveNode(pair.value, parsed),
      parsed.lineOf(pair.key),
      parsed,
      file,
      problems,
    );
    if (variable !== undefined) variables.push(variable);
  }

  return variables;
}
