import { Document, LineCounter, parseDocument } from "yaml";
import type { Problem } from "../../errors.js";
import { classifySource } from "./source.js";
import { validateDocument } from "./validate.js";
import { TARGETS } from "./types.js";
import type { Config, PublishConfig, Target, UpstreamEntry } from "./types.js";

export const CONFIG_FILENAME = "metafab.yaml";
export const CONFIG_FILE = `.factory/${CONFIG_FILENAME}`;

const KNOWN_TARGETS = new Set<string>(TARGETS);

export interface ParseConfigOptions {
  file?: string;
  repositoryRoot?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function parseAgents(value: unknown): "all" | Target[] | undefined {
  if (value === "all") return "all";
  if (!Array.isArray(value)) return undefined;

  const targets: Target[] = [];
  for (const item of value) {
    if (typeof item === "string" && KNOWN_TARGETS.has(item)) {
      targets.push(item as Target);
    }
  }
  return targets;
}

function parsePublish(value: unknown): PublishConfig | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;

  const publish: PublishConfig = {};
  const name = readString(record, "name");
  const git = readString(record, "git");
  const branch = readString(record, "branch");
  const version = readString(record, "version");
  const description = readString(record, "description");
  const license = readString(record, "license");
  const readme = readString(record, "readme");
  const keywords = readStringArray(record, "keywords");
  const exclude = readStringArray(record, "exclude");

  if (name !== undefined) publish.name = name;
  if (git !== undefined) publish.git = git;
  if (branch !== undefined) publish.branch = branch;
  if (version !== undefined) publish.version = version;
  if (description !== undefined) publish.description = description;
  if (license !== undefined) publish.license = license;
  if (record.access === "public" || record.access === "restricted") publish.access = record.access;
  if (readme !== undefined) publish.readme = readme;
  if (keywords !== undefined) publish.keywords = keywords;
  if (exclude !== undefined) publish.exclude = exclude;

  return publish;
}

function parseUpstream(value: unknown): UpstreamEntry | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;

  const source = readString(record, "source");
  if (source === undefined) return undefined;

  const requested = readString(record, "requested");
  const version = readString(record, "version");

  switch (classifySource(source)) {
    case "npm":
      return { kind: "npm", source, requested: requested ?? "", version: version ?? "" };
    case "git":
      return {
        kind: "git",
        source,
        ...(requested === undefined ? {} : { requested }),
        ...(version === undefined ? {} : { version }),
        commit: readString(record, "commit") ?? "",
      };
    case "unversioned":
      return { kind: "unversioned", source };
  }
}

function defaults(doc: Document, problems: Problem[]): Config {
  return {
    agents: [...TARGETS],
    agentsRaw: undefined,
    metafabSkill: true,
    doc,
    problems,
  };
}

function invalidYaml(doc: Document, file: string): Config {
  const error = doc.errors[0];
  const message = error === undefined ? "Invalid YAML." : `Invalid YAML: ${error.message.split("\n")[0] ?? error.message}`;
  const line = error?.linePos?.[0]?.line;

  return defaults(doc, [
    {
      level: "error",
      file,
      ...(line === undefined ? {} : { line }),
      message,
    },
  ]);
}

export function parseConfig(text: string, options: ParseConfigOptions = {}): Config {
  const file = options.file ?? CONFIG_FILE;
  if (text.trim() === "") return defaults(new Document(), []);

  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });

  if (doc.errors.length > 0) return invalidYaml(doc, file);

  const problems = validateDocument(doc, {
    file,
    ...(options.repositoryRoot === undefined ? {} : { repositoryRoot: options.repositoryRoot }),
    lineOf: (node) => {
      const offset = node?.range?.[0];
      return typeof offset === "number" ? lineCounter.linePos(offset).line : undefined;
    },
  });

  const root = asRecord(doc.toJS());
  if (root === undefined) return defaults(doc, problems);

  const agentsRaw = parseAgents(root.agents);
  const config: Config = {
    agents: agentsRaw === undefined || agentsRaw === "all" ? [...TARGETS] : [...agentsRaw],
    agentsRaw,
    metafabSkill: typeof root["metafab-skill"] === "boolean" ? root["metafab-skill"] : true,
    doc,
    problems,
  };

  const publish = parsePublish(root.publish);
  if (publish !== undefined) config.publish = publish;

  const upstream = parseUpstream(root.upstream);
  if (upstream !== undefined) config.upstream = upstream;

  return config;
}
