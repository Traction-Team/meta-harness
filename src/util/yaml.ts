import { isMap, isNode, LineCounter, parseDocument } from "yaml";
import type { Document } from "yaml";

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
    value: contents === null ? {} : (document.toJS() as Record<string, unknown>),
    lineAt,
    lineOf(node?: unknown): number {
      return isNode(node) && node.range != null ? lineAt(node.range[0]) : lineAt(0);
    },
  };
}
