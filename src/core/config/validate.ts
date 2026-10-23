import { statSync } from "node:fs";
import path from "node:path";
import semver from "semver";
import validateNpmPackageName from "validate-npm-package-name";
import { isMap, isScalar, isSeq } from "yaml";
import type { Document, Node, Pair, Scalar, YAMLMap, YAMLSeq } from "yaml";
import type { Problem } from "../../errors.js";
import { didYouMean } from "../../util/suggest.js";
import { classifySource } from "./source.js";
import { TARGETS } from "./types.js";

export const TOP_LEVEL_KEYS = ["agents", "metafab-skill", "publish", "upstream"] as const;
export const PUBLISH_KEYS = [
  "name",
  "git",
  "branch",
  "version",
  "description",
  "license",
  "access",
  "readme",
  "keywords",
  "exclude",
] as const;
export const UPSTREAM_KEYS = ["source", "requested", "version", "commit"] as const;

const TOP_LEVEL = new Set<string>(TOP_LEVEL_KEYS);
const PUBLISH = new Set<string>(PUBLISH_KEYS);
const UPSTREAM = new Set<string>(UPSTREAM_KEYS);
const TARGET_SET = new Set<string>(TARGETS);

const GIT_URL =
  /^(?:git@[^\s:]+:[^\s]+|(?:git\+)?ssh:\/\/[^\s]+|(?:git\+)?https:\/\/[^\s]+|file:\/\/[^\s]+)$/i;

export interface ValidateDocumentOptions {
  file?: string;
  repositoryRoot?: string;
  lineOf?: (node: Node | null | undefined) => number | undefined;
}

type Report = (level: "error" | "warning", message: string, node: Node | null | undefined, fix?: string) => void;

function mapEntries(map: YAMLMap): Map<string, Pair> {
  const entries = new Map<string, Pair>();
  for (const pair of map.items) {
    if (!isScalar(pair.key)) continue;
    const key = pair.key.value;
    if (typeof key === "string") entries.set(key, pair);
  }
  return entries;
}

function pairNode(pair: Pair | null | undefined): Node | null | undefined {
  if (pair === null || pair === undefined) return undefined;
  if (isScalar(pair.key)) return pair.key;
  return pair.value as Node | null | undefined;
}

function isStringNode(node: unknown): node is Scalar<string> {
  return isScalar(node) && typeof node.value === "string";
}

function isStringSequence(node: unknown): node is YAMLSeq {
  return isSeq(node);
}

function stringNodeValue(node: unknown): string | undefined {
  return isStringNode(node) ? node.value : undefined;
}

function reportUnknownKey(
  report: Report,
  pair: Pair,
  scope: string | undefined,
  candidates: readonly string[],
): void {
  const key = isScalar(pair.key) ? String(pair.key.value) : "";
  const where = scope === undefined ? "" : ` in "${scope}"`;
  const suggestion = key === "" ? undefined : didYouMean(key, candidates);
  report(
    "error",
    `Unknown key "${key}"${where}.${suggestion === undefined ? "" : ` ${suggestion}`}`,
    pairNode(pair),
  );
}

function validateStringKeys(
  report: Report,
  entries: Map<string, Pair>,
  scope: string,
  keys: readonly string[],
): void {
  for (const key of keys) {
    const pair = entries.get(key);
    if (pair === undefined) continue;
    if (!isStringNode(pair.value)) {
      report("error", `"${scope}.${key}" must be a string.`, pairNode(pair));
    }
  }
}

function validateStringList(report: Report, entries: Map<string, Pair>, scope: string, key: string): void {
  const pair = entries.get(key);
  if (pair === undefined) return;

  if (!isStringSequence(pair.value)) {
    report("error", `"${scope}.${key}" must be a list of strings.`, pairNode(pair));
    return;
  }

  for (const item of pair.value.items) {
    if (!isStringNode(item)) {
      report("error", `"${scope}.${key}" must be a list of strings.`, isScalar(item) ? item : pairNode(pair));
    }
  }
}

function validateAgents(report: Report, entries: Map<string, Pair>): void {
  const pair = entries.get("agents");
  if (pair === undefined) return;

  const value = pair.value;
  if (isScalar(value) && value.value === "all") return;

  if (!isSeq(value)) {
    report("error", `"agents" must be a list of targets or "all".`, pairNode(pair));
    return;
  }

  const seen = new Set<string>();
  for (const item of value.items) {
    if (!isStringNode(item)) {
      report("error", `"agents" must contain only target names.`, isScalar(item) ? item : pairNode(pair));
      continue;
    }

    if (!TARGET_SET.has(item.value)) {
      const suggestion = didYouMean(item.value, TARGETS);
      report(
        "error",
        `Unknown target "${item.value}" in "agents".${suggestion === undefined ? "" : ` ${suggestion}`}`,
        item,
      );
      continue;
    }

    if (seen.has(item.value)) {
      report("warning", `Duplicate target "${item.value}" in "agents".`, item, "Remove the duplicate.");
      continue;
    }
    seen.add(item.value);
  }
}

function validateMetafabSkill(report: Report, entries: Map<string, Pair>): void {
  const pair = entries.get("metafab-skill");
  if (pair === undefined) return;

  const value = pair.value;
  if (!isScalar(value) || typeof value.value !== "boolean") {
    report("error", `"metafab-skill" must be a boolean.`, pairNode(pair));
  }
}

function validatePublish(
  report: Report,
  map: YAMLMap,
  anchor: Node | null | undefined,
  repositoryRoot: string | undefined,
): void {
  const entries = mapEntries(map);

  for (const pair of entries.values()) {
    const key = isScalar(pair.key) ? pair.key.value : undefined;
    if (typeof key !== "string" || !PUBLISH.has(key)) {
      reportUnknownKey(report, pair, "publish", PUBLISH_KEYS);
    }
  }

  validateStringKeys(report, entries, "publish", [
    "name",
    "git",
    "branch",
    "version",
    "description",
    "license",
    "readme",
  ]);

  const access = entries.get("access");
  if (access !== undefined) {
    const value = access.value;
    if (!isScalar(value) || (value.value !== "public" && value.value !== "restricted")) {
      report("error", `"publish.access" must be "public" or "restricted".`, pairNode(access));
    }
  }

  validateStringList(report, entries, "publish", "keywords");
  validateStringList(report, entries, "publish", "exclude");

  if (!entries.has("version")) {
    report("error", `"publish" requires "version".`, anchor, `Add "version" to "publish".`);
  }

  if (!entries.has("name") && !entries.has("git")) {
    report("error", `"publish" requires "name" or "git".`, anchor, `Add "name" or "git" to "publish".`);
  }

  const name = entries.get("name");
  const nameText = name === undefined ? undefined : stringNodeValue(name.value);
  if (nameText !== undefined) {
    const result = validateNpmPackageName(nameText);
    if (!result.validForNewPackages) {
      const reason = result.errors?.[0] ?? result.warnings?.[0] ?? "invalid name";
      report("error", `"publish.name" is not a valid npm package name: ${reason}.`, pairNode(name));
    }
  }

  const git = entries.get("git");
  const gitText = git === undefined ? undefined : stringNodeValue(git.value);
  if (gitText !== undefined && !GIT_URL.test(gitText)) {
    report(
      "error",
      `"publish.git" is not a Git URL.`,
      pairNode(git),
      `Use git@host:path, ssh://, git+ssh://, https://, git+https:// or file://.`,
    );
  }

  const branch = entries.get("branch");
  if (branch !== undefined && !entries.has("git")) {
    report(
      "error",
      `"publish.branch" requires "publish.git".`,
      pairNode(branch),
      `Add "git" to "publish" or remove "branch".`,
    );
  }

  const version = entries.get("version");
  const versionText = version === undefined ? undefined : stringNodeValue(version.value);
  if (versionText !== undefined && semver.valid(versionText) === null) {
    report(
      "error",
      `"publish.version" is not a semantic version: "${versionText}".`,
      pairNode(version),
    );
  }

  const readme = entries.get("readme");
  const readmeText = readme === undefined ? undefined : stringNodeValue(readme.value);
  if (readme !== undefined && readmeText !== undefined && repositoryRoot !== undefined) {
    const resolved = path.isAbsolute(readmeText)
      ? readmeText
      : path.join(repositoryRoot, readmeText);
    if (!isFile(resolved)) {
      report("error", `"publish.readme" file not found: ${readmeText}.`, pairNode(readme));
    }
  }
}

function isFile(target: string): boolean {
  try {
    return statSync(target).isFile();
  } catch {
    return false;
  }
}

function validateUpstream(report: Report, map: YAMLMap, anchor: Node | null | undefined): void {
  const entries = mapEntries(map);

  for (const pair of entries.values()) {
    const key = isScalar(pair.key) ? pair.key.value : undefined;
    if (typeof key !== "string" || !UPSTREAM.has(key)) {
      reportUnknownKey(report, pair, "upstream", UPSTREAM_KEYS);
    }
  }

  validateStringKeys(report, entries, "upstream", ["source", "requested", "version", "commit"]);

  const source = entries.get("source");
  if (source === undefined) {
    report("error", `"upstream" requires "source".`, anchor, `Add "source" to "upstream".`);
    return;
  }

  const sourceText = stringNodeValue(source.value);
  if (sourceText === undefined) return;

  switch (classifySource(sourceText)) {
    case "npm":
      if (!entries.has("version")) {
        report("error", `"upstream" npm source requires "version".`, anchor, `Add "version" to "upstream".`);
      }
      break;
    case "git":
      if (!entries.has("commit")) {
        report("error", `"upstream" Git source requires "commit".`, anchor, `Add "commit" to "upstream".`);
      }
      break;
    case "unversioned":
      break;
  }
}

export function validateDocument(doc: Document, options: ValidateDocumentOptions = {}): Problem[] {
  const file = options.file ?? ".factory/metafab.yaml";
  const lineOf = options.lineOf ?? (() => undefined);
  const problems: Problem[] = [];

  const report: Report = (level, message, node, fix) => {
    const line = lineOf(node);
    problems.push({
      level,
      file,
      ...(line === undefined ? {} : { line }),
      message,
      ...(fix === undefined ? {} : { fix }),
    });
  };

  const contents = doc.contents;
  if (contents === null) return problems;

  if (!isMap(contents)) {
    report("error", "metafab.yaml must be a mapping.", contents);
    return problems;
  }

  const entries = mapEntries(contents);

  for (const pair of entries.values()) {
    const key = isScalar(pair.key) ? pair.key.value : undefined;
    if (typeof key !== "string" || !TOP_LEVEL.has(key)) {
      reportUnknownKey(report, pair, undefined, TOP_LEVEL_KEYS);
    }
  }

  validateAgents(report, entries);
  validateMetafabSkill(report, entries);

  const publish = entries.get("publish");
  if (publish !== undefined) {
    if (!isMap(publish.value)) {
      report("error", `"publish" must be a map.`, pairNode(publish));
    } else {
      validatePublish(report, publish.value, pairNode(publish), options.repositoryRoot);
    }
  }

  const upstream = entries.get("upstream");
  if (upstream !== undefined) {
    if (!isMap(upstream.value)) {
      report("error", `"upstream" must be a map.`, pairNode(upstream));
    } else {
      validateUpstream(report, upstream.value, pairNode(upstream));
    }
  }

  return problems;
}
