import { isMap, isNode, isScalar, LineCounter, parseDocument } from "yaml";
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

  return {
    ok: true,
    document,
    value:
      contents === null
        ? {}
        : hasCollectionKey(document)
          ? valueFromScalarKeys(document)
          : (document.toJS() as Record<string, unknown>),
    lineAt,
    lineOf(node?: unknown): number {
      return isNode(node) && node.range != null ? lineAt(node.range[0]) : lineAt(0);
    },
  };
}
