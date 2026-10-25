import { statSync } from "node:fs";
import path from "node:path";
import semver from "semver";
import validateNpmPackageName from "validate-npm-package-name";
import { isAlias, isMap, isScalar, isSeq } from "yaml";
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

function resolvedNode(node: unknown, doc: Document): Node | null | undefined {
  let current = node as Node | null | undefined;
  const seen = new Set<Node>();

  while (isAlias(current)) {
    if (seen.has(current)) return undefined;
    seen.add(current);
    current = current.resolve(doc);
  }

  return current;
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
  doc: Document,
): void {
  for (const key of keys) {
    const pair = entries.get(key);
    if (pair === undefined) continue;
    if (!isStringNode(resolvedNode(pair.value, doc))) {
      report("error", `"${scope}.${key}" must be a string.`, pairNode(pair));
    }
  }
}

function validateStringList(
  report: Report,
  entries: Map<string, Pair>,
  scope: string,
  key: string,
  doc: Document,
): void {
  const pair = entries.get(key);
  if (pair === undefined) return;

  const value = resolvedNode(pair.value, doc);
  if (!isStringSequence(value)) {
    report("error", `"${scope}.${key}" must be a list of strings.`, pairNode(pair));
    return;
  }

  for (const item of value.items) {
    if (!isStringNode(resolvedNode(item, doc))) {
      report(
        "error",
        `"${scope}.${key}" must be a list of strings.`,
        isScalar(item) ? item : pairNode(pair),
      );
    }
  }
}

function validateAgents(report: Report, entries: Map<string, Pair>, doc: Document): void {
  const pair = entries.get("agents");
  if (pair === undefined) return;

  const value = resolvedNode(pair.value, doc);
  if (isScalar(value) && value.value === "all") return;

  if (!isSeq(value)) {
    report("error", `"agents" must be a list of targets or "all".`, pairNode(pair));
    return;
  }

  const seen = new Set<string>();
  for (const item of value.items) {
    const node = resolvedNode(item, doc);
    if (!isStringNode(node)) {
      report(
        "error",
        `"agents" must contain only target names.`,
        isScalar(node) ? node : pairNode(pair),
      );
      continue;
    }

    if (!TARGET_SET.has(node.value)) {
      const suggestion = didYouMean(node.value, TARGETS);
      report(
        "error",
        `Unknown target "${node.value}" in "agents".${suggestion === undefined ? "" : ` ${suggestion}`}`,
        node,
      );
      continue;
    }

    if (seen.has(node.value)) {
      report("warning", `Duplicate target "${node.value}" in "agents".`, node, "Remove the duplicate.");
      continue;
    }
    seen.add(node.value);
  }
}

function validateMetafabSkill(report: Report, entries: Map<string, Pair>, doc: Document): void {
  const pair = entries.get("metafab-skill");
  if (pair === undefined) return;

  const value = resolvedNode(pair.value, doc);
  if (!isScalar(value) || typeof value.value !== "boolean") {
    report("error", `"metafab-skill" must be a boolean.`, pairNode(pair));
  }
}

function validatePublish(
  report: Report,
  map: YAMLMap,
  anchor: Node | null | undefined,
  repositoryRoot: string | undefined,
  doc: Document,
): void {
  const entries = mapEntries(map);

  for (const pair of map.items) {
    const key = isScalar(pair.key) ? pair.key.value : undefined;
    if (typeof key !== "string" || !PUBLISH.has(key)) {
      reportUnknownKey(report, pair, "publish", PUBLISH_KEYS);
    }
  }

  validateStringKeys(
    report,
    entries,
    "publish",
    ["name", "git", "branch", "version", "description", "license", "readme"],
    doc,
  );

  const access = entries.get("access");
  if (access !== undefined) {
    const value = resolvedNode(access.value, doc);
    if (!isScalar(value) || (value.value !== "public" && value.value !== "restricted")) {
      report("error", `"publish.access" must be "public" or "restricted".`, pairNode(access));
    }
  }

  validateStringList(report, entries, "publish", "keywords", doc);
  validateStringList(report, entries, "publish", "exclude", doc);

  if (!entries.has("version")) {
    report("error", `"publish" requires "version".`, anchor, `Add "version" to "publish".`);
  }

  if (!entries.has("name") && !entries.has("git")) {
    report("error", `"publish" requires "name" or "git".`, anchor, `Add "name" or "git" to "publish".`);
  }

  const name = entries.get("name");
  const nameText = name === undefined ? undefined : stringNodeValue(resolvedNode(name.value, doc));
  if (nameText !== undefined) {
    const result = validateNpmPackageName(nameText);
    if (!result.validForNewPackages) {
      const reason = result.errors?.[0] ?? result.warnings?.[0] ?? "invalid name";
      report("error", `"publish.name" is not a valid npm package name: ${reason}.`, pairNode(name));
    }
  }

  const git = entries.get("git");
  const gitText = git === undefined ? undefined : stringNodeValue(resolvedNode(git.value, doc));
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
  const versionText = version === undefined ? undefined : stringNodeValue(resolvedNode(version.value, doc));
  if (versionText !== undefined && semver.valid(versionText) === null) {
    report(
      "error",
      `"publish.version" is not a semantic version: "${versionText}".`,
      pairNode(version),
    );
  }

  const readme = entries.get("readme");
  const readmeText = readme === undefined ? undefined : stringNodeValue(resolvedNode(readme.value, doc));
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

function hasNonEmptyString(entries: Map<string, Pair>, key: string, doc: Document): boolean {
  const pair = entries.get(key);
  if (pair === undefined) return false;

  const value = resolvedNode(pair.value, doc);
  if (!isStringNode(value)) return true;
  return value.value.trim() !== "";
}

function validateUpstream(
  report: Report,
  map: YAMLMap,
  anchor: Node | null | undefined,
  doc: Document,
): void {
  const entries = mapEntries(map);

  for (const pair of map.items) {
    const key = isScalar(pair.key) ? pair.key.value : undefined;
    if (typeof key !== "string" || !UPSTREAM.has(key)) {
      reportUnknownKey(report, pair, "upstream", UPSTREAM_KEYS);
    }
  }

  validateStringKeys(report, entries, "upstream", ["source", "requested", "version", "commit"], doc);

  const source = entries.get("source");
  if (source === undefined) {
    report("error", `"upstream" requires "source".`, anchor, `Add "source" to "upstream".`);
    return;
  }

  const sourceText = stringNodeValue(resolvedNode(source.value, doc));
  if (sourceText === undefined) return;

  if (sourceText.trim() === "") {
    report("error", `"upstream" requires "source".`, anchor, `Add "source" to "upstream".`);
    return;
  }

  switch (classifySource(sourceText)) {
    case "npm":
      if (!hasNonEmptyString(entries, "version", doc)) {
        report("error", `"upstream" npm source requires "version".`, anchor, `Add "version" to "upstream".`);
      }
      break;
    case "git":
      if (!hasNonEmptyString(entries, "commit", doc)) {
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

  for (const pair of contents.items) {
    const key = isScalar(pair.key) ? pair.key.value : undefined;
    if (typeof key !== "string" || !TOP_LEVEL.has(key)) {
      reportUnknownKey(report, pair, undefined, TOP_LEVEL_KEYS);
    }
  }

  validateAgents(report, entries, doc);
  validateMetafabSkill(report, entries, doc);

  const publish = entries.get("publish");
  if (publish !== undefined) {
    const publishValue = resolvedNode(publish.value, doc);
    if (!isMap(publishValue)) {
      report("error", `"publish" must be a map.`, pairNode(publish));
    } else {
      validatePublish(report, publishValue, pairNode(publish), options.repositoryRoot, doc);
    }
  }

  const upstream = entries.get("upstream");
  if (upstream !== undefined) {
    const upstreamValue = resolvedNode(upstream.value, doc);
    if (!isMap(upstreamValue)) {
      report("error", `"upstream" must be a map.`, pairNode(upstream));
    } else {
      validateUpstream(report, upstreamValue, pairNode(upstream), doc);
    }
  }

  return problems;
}
