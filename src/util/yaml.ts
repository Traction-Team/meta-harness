import { isAlias, isCollection, isMap, isNode, isPair, isScalar, LineCounter, parseDocument, visit } from "yaml";
import type { Document, Pair } from "yaml";

export interface YamlProblem {
  message: string;
  line: number;
  fix?: string;
}

export interface YamlParseOptions {
  lineOffset?: number;
}

export interface YamlDocument {
  document: Document.Parsed;
  value: Record<string, unknown>;
  lineAt(offset: number): number;
  lineOf(node?: unknown): number;
}

export type YamlParseResult = ({ ok: true } & YamlDocument) | { ok: false; problems: YamlProblem[] };

const YAML_OPTIONS = {
  version: "1.2" as const,
  uniqueKeys: true,
  prettyErrors: true,
};

/** The expansion limit `yaml` applies when it converts a document to JavaScript. */
const MAX_ALIAS_COUNT = 100;

function cleanMessage(message: string): string {
  return message.replace(/\s+at line \d+, column \d+:[\s\S]*$/, "").trim();
}

function hasCollectionKey(document: Document.Parsed): boolean {
  const contents = document.contents;
  if (!isMap(contents)) return false;
  return contents.items.some((pair) => !isScalar((pair as Pair<unknown, unknown>).key));
}

function valueFromScalarKeys(document: Document.Parsed): Record<string, unknown> {
  const contents = document.contents;
  if (!isMap(contents)) return {};

  const value: Record<string, unknown> = {};
  for (const pair of contents.items as Pair<unknown, unknown>[]) {
    if (!isScalar(pair.key) || typeof pair.key.value !== "string") continue;
    value[pair.key.value] = isNode(pair.value) ? pair.value.toJS(document) : null;
  }
  return value;
}

/** How many values `yaml` counts a node as when it checks the alias limit. */
function expansionSize(node: unknown, document: Document, seen: Set<unknown>): number {
  if (isAlias(node)) {
    const target = node.resolve(document);
    return target === undefined ? 0 : expansionSize(target, document, seen);
  }

  if (isPair(node)) {
    return Math.max(
      expansionSize(node.key, document, seen),
      expansionSize(node.value, document, seen),
    );
  }

  if (isCollection(node)) {
    if (seen.has(node)) return MAX_ALIAS_COUNT + 1;
    seen.add(node);
    let count = 0;
    for (const item of node.items) {
      count = Math.max(count, expansionSize(item, document, seen));
    }
    seen.delete(node);
    return count;
  }

  return 1;
}

function lastAlias(document: Document, lineAt: (offset: number) => number): { source?: string; line: number } {
  let alias: { source?: string; line: number } = { line: lineAt(0) };
  visit(document, (_key, node) => {
    if (!isAlias(node)) return;
    alias = { source: node.source, line: lineAt(node.range?.[0] ?? 0) };
  });
  return alias;
}

function expansionProblem(alias: { source?: string; line: number }, fix: string): YamlProblem {
  return {
    message:
      alias.source === undefined
        ? "The aliases in this document expand it too far"
        : `Alias *${alias.source} is aliased too many times`,
    line: alias.line,
    fix,
  };
}

/**
 * Problems for alias nodes: an alias such as `*missing` that names no anchor
 * before it, and a document whose aliases expand it past the library's limit.
 * `yaml` throws `ReferenceError` for both when the document is converted to
 * JavaScript, so callers check this first and report a grammar problem.
 */
export function aliasProblems(document: Document, lineAt: (offset: number) => number): YamlProblem[] {
  const problems: YamlProblem[] = [];
  const uses = new Map<unknown, { count: number; size: number }>();

  visit(document, (_key, node) => {
    if (!isAlias(node)) return;

    const target = node.resolve(document);
    if (target === undefined) {
      problems.push({
        message: `Alias *${node.source} has no anchor`,
        line: lineAt(node.range?.[0] ?? 0),
        fix: "Remove the alias or define its anchor before it",
      });
      return;
    }

    if (problems.length > 0) return;

    let record = uses.get(target);
    if (record === undefined) {
      // `yaml` counts the anchored node itself as one use before its aliases.
      record = { count: 1, size: expansionSize(target, document, new Set()) };
      uses.set(target, record);
    }
    record.count += 1;

    if (record.count * record.size > MAX_ALIAS_COUNT) {
      problems.push(
        expansionProblem(
          { source: node.source, line: lineAt(node.range?.[0] ?? 0) },
          "Use the anchor fewer times or write the values out",
        ),
      );
    }
  });

  return problems;
}

function toJsProblem(
  error: unknown,
  document: Document,
  lineAt: (offset: number) => number,
): YamlProblem {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Excessive alias count")) {
    return expansionProblem(lastAlias(document, lineAt), "Use the anchor fewer times or write the values out");
  }

  return {
    message: cleanMessage(message),
    line: lineAt(0),
    fix: "Fix the YAML syntax on this line",
  };
}

export function parseYaml(text: string, options: YamlParseOptions = {}): YamlParseResult {
  const lineOffset = options.lineOffset ?? 0;
  const lineCounter = new LineCounter();
  const document = parseDocument(text, { ...YAML_OPTIONS, lineCounter });
  const lineAt = (offset: number): number => lineCounter.linePos(offset).line + lineOffset;

  if (document.errors.length > 0) {
    return {
      ok: false,
      problems: document.errors.map((error) => ({
        message: cleanMessage(error.message),
        line: lineAt(error.pos[0]),
        fix: "Fix the YAML syntax on this line",
      })),
    };
  }

  const contents = document.contents;
  if (contents !== null && !isMap(contents)) {
    return {
      ok: false,
      problems: [
        {
          message: "Top-level value must be a mapping",
          line: lineAt(contents.range?.[0] ?? 0),
          fix: "Start the document with key: value pairs",
        },
      ],
    };
  }

  const aliases = aliasProblems(document, lineAt);
  if (aliases.length > 0) {
    return { ok: false, problems: aliases };
  }

  let value: Record<string, unknown>;
  try {
    value =
      contents === null
        ? {}
        : hasCollectionKey(document)
          ? valueFromScalarKeys(document)
          : (document.toJS() as Record<string, unknown>);
  } catch (error) {
    return { ok: false, problems: [toJsProblem(error, document, lineAt)] };
  }

  return {
    ok: true,
    document,
    value,
    lineAt,
    lineOf(node?: unknown): number {
      return isNode(node) && node.range != null ? lineAt(node.range[0]) : lineAt(0);
    },
  };
}
