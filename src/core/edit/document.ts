import { isMap, isScalar } from "yaml";
import type { Document, Pair } from "yaml";

export function findField(doc: Document, name: string): Pair<unknown, unknown> | undefined {
  const contents = doc.contents;
  if (!isMap(contents)) return undefined;

  return (contents.items as Pair<unknown, unknown>[]).find(
    (pair) => isScalar(pair.key) && pair.key.value === name,
  );
}

export function scalarString(node: unknown): string | undefined {
  return isScalar(node) && typeof node.value === "string" ? node.value : undefined;
}

export function serializeYamlDocument(doc: Document): string {
  if (doc.contents === null) return "";
  return doc.toString({ lineWidth: 0 }).replace(/\n*$/, "\n");
}
