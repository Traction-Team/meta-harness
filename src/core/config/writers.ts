import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Document, isMap, isScalar, parseDocument } from "yaml";
import type { Pair } from "yaml";
import { MetafabError } from "../../errors.js";
import { CONFIG_FILE, CONFIG_FILENAME } from "./parse.js";
import type { Target, UpstreamEntry } from "./types.js";

export const UPSTREAM_COMMENT = " Written by metafab import. Do not edit.";

export interface CreateConfigOptions {
  agents: "all" | Target[];
}

function invalidYaml(text: string, file: string): never {
  const doc = parseDocument(text);
  const error = doc.errors[0];
  const message =
    error === undefined ? "Invalid YAML." : `Invalid YAML: ${error.message.split("\n")[0] ?? error.message}`;
  const line = error?.linePos?.[0]?.line;

  throw new MetafabError(`${file}: ${message}`, {
    code: "config-invalid-yaml",
    problems: [
      {
        level: "error",
        file,
        ...(line === undefined ? {} : { line }),
        message,
      },
    ],
  });
}

function documentForWriting(text: string, file = CONFIG_FILE): Document {
  if (text.trim() === "") return new Document();

  const doc = parseDocument(text);
  if (doc.errors.length > 0) invalidYaml(text, file);
  if (doc.contents !== null && !isMap(doc.contents)) {
    throw new MetafabError(`${file}: The configuration must be a YAML map.`, {
      code: "config-invalid-yaml",
      problems: [{ level: "error", file, message: "The configuration must be a YAML map." }],
    });
  }

  return doc;
}

function serialize(doc: Document): string {
  const text = doc.toString({ flowCollectionPadding: false });
  return text.replace(/\n*$/, "\n");
}

function upstreamNode(doc: Document, entry: UpstreamEntry): Document["contents"] {
  const value: Record<string, string> = { source: entry.source };

  if (entry.kind === "npm") {
    value.requested = entry.requested;
    value.version = entry.version;
  } else if (entry.kind === "git") {
    if (entry.requested !== undefined) value.requested = entry.requested;
    if (entry.version !== undefined) value.version = entry.version;
    value.commit = entry.commit;
  }

  return doc.createNode(value);
}

function upstreamPair(doc: Document): Pair | undefined {
  if (doc.contents === null || !isMap(doc.contents)) return undefined;
  return doc.contents.items.find((pair) => {
    const key = pair.key;
    return (isScalar(key) ? key.value : key) === "upstream";
  });
}

export function createConfigText(options: CreateConfigOptions): string {
  const doc = new Document();

  if (options.agents === "all") {
    doc.set("agents", "all");
  } else {
    const agents = doc.createNode(options.agents);
    agents.flow = true;
    doc.set("agents", agents);
  }

  return serialize(doc);
}

export function setUpstreamText(text: string, entry: UpstreamEntry): string {
  const doc = documentForWriting(text);
  const value = upstreamNode(doc, entry);
  const existing = upstreamPair(doc);

  if (existing !== undefined) {
    existing.value = value;

    const key = existing.key;
    if (isScalar(key)) {
      const wasCommented = key.commentBefore !== undefined && key.commentBefore !== null;
      key.commentBefore = UPSTREAM_COMMENT;
      if (!wasCommented && doc.contents !== null && isMap(doc.contents) && doc.contents.items[0] !== existing) {
        key.spaceBefore = true;
      }
    }

    return serialize(doc);
  }

  const key = doc.createNode("upstream");
  key.commentBefore = UPSTREAM_COMMENT;
  const first = doc.contents === null || !isMap(doc.contents) || doc.contents.items.length === 0;
  key.spaceBefore = !first;
  doc.set(key, value);

  return serialize(doc);
}

export function removeUpstreamText(text: string): string {
  const doc = documentForWriting(text);
  if (upstreamPair(doc) === undefined) return text;

  doc.delete("upstream");
  return serialize(doc);
}

async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function writeAtomically(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });

  let mode: number | undefined;
  try {
    mode = (await stat(file)).mode & 0o777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, "utf8");
    if (mode !== undefined) await chmod(temporary, mode);
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function createConfig(factoryDir: string, options: CreateConfigOptions): Promise<boolean> {
  const file = path.join(factoryDir, CONFIG_FILENAME);
  if ((await readIfExists(file)) !== undefined) return false;

  await writeAtomically(file, createConfigText(options));
  return true;
}

export async function setUpstream(factoryDir: string, entry: UpstreamEntry): Promise<void> {
  const file = path.join(factoryDir, CONFIG_FILENAME);
  const text = (await readIfExists(file)) ?? "";
  await writeAtomically(file, setUpstreamText(text, entry));
}

export async function removeUpstream(factoryDir: string): Promise<void> {
  const file = path.join(factoryDir, CONFIG_FILENAME);
  const text = await readIfExists(file);
  if (text === undefined) return;

  const updated = removeUpstreamText(text);
  if (updated !== text) await writeAtomically(file, updated);
}
