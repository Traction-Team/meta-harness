import { isAlias, isCollection, isMap, isNode, isPair, isScalar, LineCounter, parseDocument } from "yaml";
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

interface AnchorUse {
  /** The anchored node itself, plus one for each alias to it seen so far. */
  count: number;
  /** The largest expansion of one value of the anchored node; 0 until an alias needs it. */
  aliasCount: number;
}

/**
 * How many values `yaml` counts one value of `node` as while it converts a
 * document to JavaScript: one for a scalar, the largest count in a collection,
 * and an alias's anchor multiplied by that anchor's use count. An anchor that
 * no alias has reached yet counts as zero, as `yaml` counts it. Aliases are not
 * followed into a second walk, so shared subtrees are not expanded here and a
 * nested alias finishes in linear time.
 */
function expansionCount(
  node: unknown,
  anchors: Map<string, unknown>,
  uses: Map<unknown, AnchorUse>,
): number {
  if (isAlias(node)) {
    const target = anchors.get(node.source);
    const use = target === undefined ? undefined : uses.get(target);
    return use === undefined ? 0 : use.count * use.aliasCount;
  }

  if (isPair(node)) {
    return Math.max(
      expansionCount(node.key, anchors, uses),
      expansionCount(node.value, anchors, uses),
    );
  }

  if (isCollection(node)) {
    let count = 0;
    for (const item of node.items) {
      count = Math.max(count, expansionCount(item, anchors, uses));
    }
    return count;
  }

  return 1;
}

/**
 * Problems for alias nodes: an alias such as `*missing` that names no anchor
 * before it, an alias that refers to an anchor it sits inside, and a document
 * whose aliases expand it past the limit `yaml` applies when it converts one.
 * The counts follow `yaml`'s own, so the problem names the alias that crosses
 * the limit, and callers report it as a grammar problem instead of converting.
 */
export function aliasProblems(document: Document, lineAt: (offset: number) => number): YamlProblem[] {
  const problems: YamlProblem[] = [];
  const anchors = new Map<string, unknown>();
  const uses = new Map<unknown, AnchorUse>();
  const path = new Set<unknown>();
  let reported = false;

  const walk = (node: unknown): void => {
    if (isNode(node) && typeof node.anchor === "string") anchors.set(node.anchor, node);

    if (isAlias(node)) {
      if (reported) return;

      const line = lineAt(node.range?.[0] ?? 0);
      const target = anchors.get(node.source);
      if (target === undefined) {
        problems.push({
          message: `Alias *${node.source} has no anchor`,
          line,
          fix: "Remove the alias or define its anchor before it",
        });
        return;
      }

      if (path.has(target)) {
        problems.push({
          message: `Alias *${node.source} refers to itself`,
          line,
          fix: "Remove the alias or write the values out",
        });
        reported = true;
        return;
      }

      let use = uses.get(target);
      if (use === undefined) {
        // `yaml` counts the anchored node itself as one use before its aliases.
        use = { count: 1, aliasCount: 0 };
        uses.set(target, use);
      }
      use.count += 1;
      if (use.aliasCount === 0) use.aliasCount = expansionCount(target, anchors, uses);

      if (use.count * use.aliasCount > MAX_ALIAS_COUNT) {
        problems.push({
          message: `Alias *${node.source} is aliased too many times`,
          line,
          fix: "Use the anchor fewer times or write the values out",
        });
        reported = true;
      }
      return;
    }

    if (!isPair(node) && !isCollection(node)) return;

    path.add(node);
    if (isPair(node)) {
      walk(node.key);
      walk(node.value);
    } else {
      for (const item of node.items) walk(item);
    }
    path.delete(node);
  };

  if (document.contents !== null) walk(document.contents);
  return problems;
}

/** The `yaml` library's errors for an alias it cannot resolve or will not expand. */
function isAliasError(error: unknown): boolean {
  return (
    error instanceof ReferenceError &&
    /^(?:Excessive alias count|Unresolved alias|This should not happen: Alias anchor was not resolved)/.test(
      error.message,
    )
  );
}

function expansionProblem(lineAt: (offset: number) => number): YamlProblem {
  return {
    message: "The aliases in this document expand it too far",
    line: lineAt(0),
    fix: "Use the anchor fewer times or write the values out",
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
    if (!isAliasError(error)) throw error;

    // `yaml` counts aliases per converted node, so re-check to name the alias
    // that crosses the limit rather than guessing at its position.
    const found = aliasProblems(document, lineAt);
    return { ok: false, problems: found.length > 0 ? found : [expansionProblem(lineAt)] };
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
