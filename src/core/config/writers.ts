import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Document, isMap, isNode, isScalar, parseDocument } from "yaml";
import type { Pair } from "yaml";
import { MetafabError } from "../../errors.js";
import { CONFIG_FILE, CONFIG_FILENAME } from "./parse.js";
import type { Target, UpstreamEntry } from "./types.js";

export const UPSTREAM_COMMENT = " Written by metafab import. Do not edit.";

export interface CreateConfigOptions {
  agents: "all" | Target[];
  gitHooks?: boolean;
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
        fix: "Fix the YAML syntax on this line",
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
      problems: [
        {
          level: "error",
          file,
          message: "The configuration must be a YAML map.",
          fix: "Start the document with key: value pairs",
        },
      ],
    });
  }

  return doc;
}

function serialize(doc: Document): string {
  if (doc.contents === null) return "";
  if (isMap(doc.contents) && doc.contents.items.length === 0) {
    if (typeof doc.comment !== "string" || doc.comment === "") return "";

    return `${doc.comment
      .split("\n")
      .map((line) => `#${line}`)
      .join("\n")}\n`;
  }

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

  if (options.gitHooks !== undefined) doc.set("git-hooks", options.gitHooks);

  return serialize(doc);
}

function carryComments(from: unknown, to: unknown): void {
  if (!isNode(from) || !isNode(to)) return;

  const commentBefore = typeof from.commentBefore === "string" ? from.commentBefore : undefined;
  const trailing = typeof from.comment === "string" ? from.comment : undefined;

  if (commentBefore !== undefined) to.commentBefore = commentBefore;

  if (trailing !== undefined) {
    if (isScalar(from)) {
      to.commentBefore =
        typeof to.commentBefore === "string" && to.commentBefore !== ""
          ? `${to.commentBefore}\n${trailing}`
          : trailing;
    } else {
      to.comment = trailing;
    }
  }
}

export function setUpstreamText(text: string, entry: UpstreamEntry): string {
  const doc = documentForWriting(text);
  const value = upstreamNode(doc, entry);
  const existing = upstreamPair(doc);

  if (existing !== undefined) {
    carryComments(existing.value, value);
    existing.value = value;
    return serialize(doc);
  }

  const key = doc.createNode("upstream");
  key.commentBefore = UPSTREAM_COMMENT;
  const first = doc.contents === null || !isMap(doc.contents) || doc.contents.items.length === 0;
  key.spaceBefore = !first;
  doc.set(key, value);

  return serialize(doc);
}

function gitHooksPair(doc: Document): Pair | undefined {
  if (doc.contents === null || !isMap(doc.contents)) return undefined;
  return doc.contents.items.find((pair) => {
    const key = pair.key;
    return (isScalar(key) ? key.value : key) === "git-hooks";
  });
}

export function setGitHooksText(text: string, value: boolean): string {
  const doc = documentForWriting(text);
  const existing = gitHooksPair(doc);

  if (existing !== undefined && isScalar(existing.value) && existing.value.value === value) {
    return text;
  }

  const node = doc.createNode(value);

  if (existing !== undefined) {
    if (isScalar(existing.value)) {
      if (typeof existing.value.commentBefore === "string") {
        node.commentBefore = existing.value.commentBefore;
      }
      if (typeof existing.value.comment === "string") {
        node.comment = existing.value.comment;
      }
    } else {
      carryComments(existing.value, node);
    }
    existing.value = node;
    return serialize(doc);
  }

  const key = doc.createNode("git-hooks");
  const first = doc.contents === null || !isMap(doc.contents) || doc.contents.items.length === 0;
  key.spaceBefore = !first;
  doc.set(key, node);

  return serialize(doc);
}

function userComment(key: unknown): string | undefined {
  if (!isScalar(key) || typeof key.commentBefore !== "string") return undefined;

  const lines = key.commentBefore
    .split("\n")
    .filter((line) => line.trim() !== UPSTREAM_COMMENT.trim());
  while (lines.length > 0 && lines[0]!.trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();

  return lines.length === 0 ? undefined : lines.join("\n");
}

export function removeUpstreamText(text: string): string {
  const doc = documentForWriting(text);
  const pair = upstreamPair(doc);
  if (pair === undefined) return text;

  const contents = doc.contents;
  const map = contents !== null && isMap(contents) ? contents : undefined;
  const next = map === undefined ? undefined : map.items[map.items.indexOf(pair) + 1];
  const kept = userComment(pair.key);
  const spaceBefore = isScalar(pair.key) ? pair.key.spaceBefore : undefined;

  doc.delete("upstream");

  if (kept !== undefined) {
    if (next !== undefined && isScalar(next.key)) {
      next.key.commentBefore =
        typeof next.key.commentBefore === "string" && next.key.commentBefore !== ""
          ? `${kept}\n${next.key.commentBefore}`
          : kept;
      if (spaceBefore) next.key.spaceBefore = true;
    } else {
      doc.comment = typeof doc.comment === "string" && doc.comment !== "" ? `${kept}\n${doc.comment}` : kept;
    }
  }

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

export async function setGitHooks(factoryDir: string, value: boolean): Promise<void> {
  const file = path.join(factoryDir, CONFIG_FILENAME);
  const text = (await readIfExists(file)) ?? "";
  const updated = setGitHooksText(text, value);
  if (updated !== text) await writeAtomically(file, updated);
}

export async function setUpstream(factoryDir: string, entry: UpstreamEntry): Promise<void> {
  const file = path.join(factoryDir, CONFIG_FILENAME);
  const text = (await readIfExists(file)) ?? "";
  const updated = setUpstreamText(text, entry);
  if (updated !== text) await writeAtomically(file, updated);
}

export async function removeUpstream(factoryDir: string): Promise<void> {
  const file = path.join(factoryDir, CONFIG_FILENAME);
  const text = await readIfExists(file);
  if (text === undefined) return;

  const updated = removeUpstreamText(text);
  if (updated !== text) await writeAtomically(file, updated);
}
