import { isAlias, isMap, isScalar, isSeq } from "yaml";
import type { Pair } from "yaml";
import type { Problem } from "../../errors.js";
import type { FrontmatterResult } from "../../util/frontmatter.js";
import { isSingleLine } from "../../util/text.js";
import { didYouMean } from "../../util/suggest.js";
import type { YamlDocument } from "../../util/yaml.js";
import { MAX_SKILL_NAME_LENGTH, SKILL_NAME_PATTERN, slugify } from "../factory/validate.js";
import { cronProblem, validTimeZone } from "./cron.js";
import type { Automation, AutomationBody, Trigger } from "./types.js";

/** The parsed `automation.md` frontmatter, body and all. */
export type AutomationFrontmatter = Extract<FrontmatterResult, { ok: true }>;

export const AUTOMATION_KEYS = [
  "owner",
  "description",
  "enabled",
  "checkout",
  "triggers",
] as const;

/** The spec's pattern for finding an email address in a frontmatter string. */
const EMAIL = /[^\s@"]+@[^\s@"]+\.[^\s@"]+/;
const EMAIL_ONLY = /^[^\s@"]+@[^\s@"]+\.[^\s@"]+$/;

export function automationFile(name: string): string {
  return `.factory/automations/${name}/automation.md`;
}

/** Rule 2's name check for an automation directory, with rule 5's fix. */
export function automationNameProblems(name: string): Problem[] {
  if (name.length <= MAX_SKILL_NAME_LENGTH && SKILL_NAME_PATTERN.test(name)) return [];

  return [
    {
      level: "error",
      file: `.factory/automations/${name}`,
      line: 1,
      message: `Automation name "${name}" is not a valid Agent Skill name`,
      fix: `Use a name like '${slugify(name)}'`,
    },
  ];
}

/** Rule 3: a file directly in `automations/` that is not `run.md`. */
export function automationFileProblem(file: string): Problem {
  return {
    level: "error",
    file,
    line: 1,
    message: `${file} is not allowed directly in .factory/automations/`,
    fix: "Only run.md may sit there; move it into an automation's directory or remove it",
  };
}

/** Rule 2: a directory directly in `automations/` with no `automation.md`. */
export function automationMissingFileProblem(name: string): Problem {
  return {
    level: "error",
    file: `.factory/automations/${name}`,
    line: 1,
    message: `Automation "${name}" has no automation.md`,
    fix: `Add .factory/automations/${name}/automation.md, or remove the directory`,
  };
}

/** Rule 1: a `SKILL.md` anywhere below `automations/`. */
export function automationSkillFileProblem(file: string): Problem {
  return {
    level: "error",
    file,
    line: 1,
    message: "SKILL.md is not allowed below .factory/automations/",
    fix: "Move the skill out of .factory/automations/: build never installs anything from it",
  };
}

function scalarString(node: unknown): string | undefined {
  return isScalar(node) && typeof node.value === "string" ? node.value : undefined;
}

function resolved(node: unknown, parsed: YamlDocument): unknown {
  return isAlias(node) ? node.resolve(parsed.document) : node;
}

/** Every string in a converted frontmatter value, however deeply nested. */
function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(stringValues);
  return [];
}

/** Two triggers are equal when their names, or their cron fields, read the same. */
function triggerKey(trigger: Trigger): string {
  return trigger.kind === "schedule"
    ? `schedule ${trigger.cron.trim().split(/\s+/).join(" ")} ${trigger.tz}`
    : `after ${[...trigger.names].sort().join(",")}`;
}

function triggerShapeProblem(file: string, line: number): Problem {
  return {
    level: "error",
    file,
    line,
    message: 'A trigger must have exactly one of "schedule" or "after"',
    fix: 'Write - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney } or - after: [<name>]',
  };
}

function parseSchedule(
  node: unknown,
  parsed: YamlDocument,
  file: string,
  line: number,
  problems: Problem[],
): Trigger | undefined {
  if (!isMap(node)) {
    problems.push({
      level: "error",
      file,
      line,
      message: 'schedule must be a mapping with "cron" and "tz"',
      fix: 'Write schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }',
    });
    return undefined;
  }

  let cron: { value: string; line: number } | undefined;
  let tz: { value: string; line: number } | undefined;

  for (const pair of node.items as Pair<unknown, unknown>[]) {
    const key = scalarString(pair.key);
    const fieldLine = parsed.lineOf(pair.key);

    if (key !== "cron" && key !== "tz") {
      problems.push({
        level: "error",
        file,
        line: fieldLine,
        message: `Unknown key "${key ?? "?"}" in schedule`,
        fix: "Use cron and tz",
      });
      continue;
    }

    const value = resolved(pair.value, parsed);
    if (!isScalar(value) || typeof value.value !== "string" || value.value.trim() === "") {
      problems.push({
        level: "error",
        file,
        line: fieldLine,
        message: `"${key}" must be a non-empty string`,
        fix: key === "cron" ? 'Write cron: "0 8 * * 1,4"' : "Write tz: Australia/Sydney",
      });
      continue;
    }

    const field = { value: value.value.trim(), line: fieldLine };
    if (key === "cron") cron = field;
    else tz = field;
  }

  if (cron === undefined) {
    problems.push({
      level: "error",
      file,
      line,
      message: 'schedule is missing "cron"',
      fix: 'Add cron: "0 8 * * 1,4"',
    });
  }
  if (tz === undefined) {
    problems.push({
      level: "error",
      file,
      line,
      message: 'schedule is missing "tz"',
      fix: "Add tz: Australia/Sydney",
    });
  }
  if (cron === undefined || tz === undefined) return undefined;

  const problem = cronProblem(cron.value);
  if (problem !== undefined) {
    problems.push({
      level: "error",
      file,
      line: cron.line,
      message: problem,
      fix: "Write five fields: minute hour day of month month day of week",
    });
  }
  if (!validTimeZone(tz.value)) {
    problems.push({
      level: "error",
      file,
      line: tz.line,
      message: `"${tz.value}" is not an IANA time zone`,
      fix: "Use an IANA zone, such as Australia/Sydney",
    });
  }

  return { kind: "schedule", cron: cron.value, tz: tz.value, line };
}

function parseAfter(
  node: unknown,
  parsed: YamlDocument,
  file: string,
  line: number,
  problems: Problem[],
): Trigger | undefined {
  if (!isSeq(node)) {
    problems.push({
      level: "error",
      file,
      line,
      message: "after must be a list of automation names",
      fix: "Write after: [<name>]",
    });
    return undefined;
  }

  const names: string[] = [];
  for (const item of node.items) {
    const value = resolved(item, parsed);
    if (!isScalar(value) || typeof value.value !== "string" || value.value.trim() === "") {
      problems.push({
        level: "error",
        file,
        line: parsed.lineOf(item),
        message: "after names must be non-empty strings",
        fix: "Write each automation's name as a plain name",
      });
      continue;
    }
    names.push(value.value.trim());
  }

  if (names.length === 0) {
    problems.push({
      level: "error",
      file,
      line,
      message: "after must name at least one automation",
      fix: "Write after: [<name>]",
    });
    return undefined;
  }

  return { kind: "after", names, line };
}

export interface AutomationParse {
  automation?: Automation;
  /** The body to check on its own, whatever the frontmatter says. */
  body: AutomationBody;
  problems: Problem[];
}

/**
 * Reads one `automation.md` frontmatter into an `Automation`, reporting every
 * frontmatter, trigger and cron problem. Rules that need the other automations
 * are in `automationProblems`. The automation is returned when its `owner` is
 * valid, so a broken cron or trigger still leaves it a named `after` target.
 * The body is returned either way, so it is checked even when there is no
 * runnable automation.
 */
export function parseAutomation(name: string, parsed: AutomationFrontmatter): AutomationParse {
  const file = automationFile(name);
  const problems: Problem[] = [];
  const contents = parsed.document.contents;
  const pairs = isMap(contents) ? (contents.items as Pair<unknown, unknown>[]) : [];

  const keyLine = (key: string): number => {
    for (const pair of pairs) {
      if (scalarString(pair.key) === key) return parsed.lineOf(pair.key);
    }
    return 1;
  };

  for (const pair of pairs) {
    const key = scalarString(pair.key);
    if (key === undefined) {
      problems.push({
        level: "error",
        file,
        line: parsed.lineOf(pair.key),
        message: "Automation key names must be strings",
        fix: "Use a string key",
      });
      continue;
    }
    if ((AUTOMATION_KEYS as readonly string[]).includes(key)) continue;

    problems.push({
      level: "error",
      file,
      line: parsed.lineOf(pair.key),
      message: `Unknown key "${key}" in automation.md`,
      fix:
        didYouMean(key, AUTOMATION_KEYS) ??
        `Remove the key or use ${AUTOMATION_KEYS.join(", ")}`,
    });
  }

  const ownerValue = parsed.value.owner;
  let owner: string | undefined;
  if (ownerValue === undefined) {
    problems.push({
      level: "error",
      file,
      line: 1,
      message: 'automation.md is missing "owner"',
      fix: 'Add owner: "*" or owner: <email>',
    });
  } else {
    const text = typeof ownerValue === "string" ? ownerValue.trim() : undefined;
    if (text === undefined || (text !== "*" && !EMAIL_ONLY.test(text))) {
      problems.push({
        level: "error",
        file,
        line: keyLine("owner"),
        message: '"owner" must be "*" or one email address',
        fix: 'Set owner: "*" or the email of the account that runs it',
      });
    } else {
      owner = text;
    }
  }

  const descriptionValue = parsed.value.description;
  let description: string | undefined;
  if (descriptionValue !== undefined) {
    if (typeof descriptionValue !== "string") {
      problems.push({
        level: "error",
        file,
        line: keyLine("description"),
        message: '"description" must be a string',
        fix: "Write the description on one line",
      });
    } else if (!isSingleLine(descriptionValue)) {
      problems.push({
        level: "error",
        file,
        line: keyLine("description"),
        message: '"description" must be a single line',
        fix: "Write the description on one line",
      });
    } else {
      description = descriptionValue;
    }
  }

  const enabledValue = parsed.value.enabled;
  let enabled = true;
  if (enabledValue !== undefined) {
    if (typeof enabledValue !== "boolean") {
      problems.push({
        level: "error",
        file,
        line: keyLine("enabled"),
        message: '"enabled" must be true or false',
        fix: "Write enabled: true or enabled: false",
      });
    } else {
      enabled = enabledValue;
    }
  }

  const checkoutValue = parsed.value.checkout;
  let checkout: "worktree" | "main" = "worktree";
  if (checkoutValue !== undefined) {
    if (checkoutValue !== "worktree" && checkoutValue !== "main") {
      problems.push({
        level: "error",
        file,
        line: keyLine("checkout"),
        message: '"checkout" must be worktree or main',
        fix: "Write checkout: worktree or checkout: main",
      });
    } else {
      checkout = checkoutValue;
    }
  }

  const triggers: Trigger[] = [];
  const triggersValue = parsed.value.triggers;
  const triggersNode = resolved(parsed.document.get("triggers", true), parsed);
  const triggerNodes = isSeq(triggersNode) ? triggersNode.items : [];

  if (triggersValue === undefined) {
    problems.push({
      level: "error",
      file,
      line: 1,
      message: 'automation.md is missing "triggers"',
      fix: "Add a triggers list with a schedule or after entry",
    });
  } else if (triggerNodes.length === 0) {
    problems.push({
      level: "error",
      file,
      line: keyLine("triggers"),
      message: '"triggers" must be a non-empty list',
      fix: 'Add a - schedule: { cron: ..., tz: ... } or - after: [<name>] entry',
    });
  }

  let schedules = 0;
  for (const itemNode of triggerNodes) {
    const item = resolved(itemNode, parsed);
    const line = parsed.lineOf(itemNode);
    if (!isMap(item) || item.items.length !== 1) {
      problems.push(triggerShapeProblem(file, line));
      continue;
    }

    const entry = item.items[0] as Pair<unknown, unknown>;
    const key = scalarString(entry.key);
    if (key === "schedule") {
      schedules += 1;
      if (schedules > 1) {
        problems.push({
          level: "error",
          file,
          line,
          message: "An automation has at most one schedule trigger",
          fix: "Write several times in one cron, such as 0 8,17 * * 1-5",
        });
        continue;
      }
      const trigger = parseSchedule(resolved(entry.value, parsed), parsed, file, line, problems);
      if (trigger !== undefined) triggers.push(trigger);
      continue;
    }
    if (key === "after") {
      const trigger = parseAfter(resolved(entry.value, parsed), parsed, file, line, problems);
      if (trigger !== undefined) triggers.push(trigger);
      continue;
    }

    problems.push({
      level: "error",
      file,
      line,
      message: `Unknown trigger "${key ?? "?"}"`,
      fix: "Use schedule or after",
    });
  }

  const seen = new Set<string>();
  for (const trigger of triggers) {
    const key = triggerKey(trigger);
    if (seen.has(key)) {
      problems.push({
        level: "error",
        file,
        line: trigger.line,
        message: "Two triggers are equal",
        fix: "Remove one of them",
      });
      continue;
    }
    seen.add(key);
  }

  for (const pair of pairs) {
    const key = scalarString(pair.key);
    if (key === undefined || key === "owner") continue;
    if (!stringValues(parsed.value[key]).some((text) => EMAIL.test(text))) continue;

    problems.push({
      level: "error",
      file,
      line: parsed.lineOf(pair.key),
      message: `"${key}" holds an email address, and only "owner" may`,
      fix: `Remove the email address from "${key}", or move it to owner`,
    });
  }

  const body: AutomationBody = { name, file, bodyLine: parsed.endLine + 1 };
  if (owner === undefined) return { body, problems };

  return {
    automation: {
      name,
      file,
      owner,
      ...(description === undefined ? {} : { description }),
      enabled,
      checkout,
      triggers,
      body: parsed.body,
      bodyLine: body.bodyLine,
      triggersLine: keyLine("triggers"),
    },
    body,
    problems,
  };
}

/**
 * Rules that need every automation: an `after` name is another automation and
 * not itself, an owner chain runs in its parent's account, and no `after`
 * chain loops.
 */
export function automationProblems(automations: readonly Automation[]): Problem[] {
  const problems: Problem[] = [];
  const byName = new Map(automations.map((automation) => [automation.name, automation]));
  const names = [...byName.keys()].sort();

  for (const automation of automations) {
    for (const trigger of automation.triggers) {
      if (trigger.kind !== "after") continue;

      for (const name of trigger.names) {
        if (name === automation.name) {
          problems.push({
            level: "error",
            file: automation.file,
            line: trigger.line,
            message: `after names the automation itself: "${name}"`,
            fix: `Remove "${name}" from after`,
          });
          continue;
        }

        const parent = byName.get(name);
        if (parent === undefined) {
          problems.push({
            level: "error",
            file: automation.file,
            line: trigger.line,
            message: `after names unknown automation "${name}"`,
            fix:
              didYouMean(name, names) ??
              "Name an automation in .factory/automations/, or add it",
          });
          continue;
        }

        if (
          automation.owner === "*" ||
          automation.owner.toLowerCase() === parent.owner.toLowerCase()
        ) {
          continue;
        }

        problems.push({
          level: "error",
          file: automation.file,
          line: trigger.line,
          message: `owner: ${automation.owner} cannot run after "${parent.name}", owned by ${parent.owner}: a chained run starts in its parent's account`,
          fix: `Set owner to "*" or to ${parent.owner}`,
        });
      }
    }
  }

  problems.push(...cycleProblems(automations));
  return problems;
}

/** A cycle's names in a stable order, so each loop is reported once. */
function canonical(cycle: readonly string[]): string {
  let first = 0;
  for (let index = 1; index < cycle.length; index += 1) {
    if (cycle[index]! < cycle[first]!) first = index;
  }
  return [...cycle.slice(first), ...cycle.slice(0, first)].join("\u0000");
}

/**
 * Each loop in the `after` graph once, as the path of an automation's children:
 * an edge runs from a named parent to the automation that starts after it.
 * Depth-first from each automation in name order, keeping the first path that
 * returns to the start.
 */
export function findCycles(automations: readonly Automation[]): string[][] {
  const names = automations.map((automation) => automation.name).sort();
  const children = new Map<string, string[]>(names.map((name) => [name, []]));

  for (const automation of automations) {
    for (const trigger of automation.triggers) {
      if (trigger.kind !== "after") continue;
      for (const name of trigger.names) {
        const list = children.get(name);
        if (list === undefined || name === automation.name || list.includes(automation.name)) {
          continue;
        }
        list.push(automation.name);
      }
    }
  }
  for (const list of children.values()) list.sort();

  const cycles: string[][] = [];
  const seen = new Set<string>();

  for (const start of names) {
    const path: string[] = [];
    const visiting = new Set<string>();

    const walk = (name: string): string[] | undefined => {
      path.push(name);
      visiting.add(name);

      for (const child of children.get(name) ?? []) {
        if (child === start) return [...path];
        if (visiting.has(child)) continue;
        const found = walk(child);
        if (found !== undefined) return found;
      }

      path.pop();
      visiting.delete(name);
      return undefined;
    };

    const found = walk(start);
    if (found === undefined) continue;

    const key = canonical(found);
    if (seen.has(key)) continue;
    seen.add(key);
    cycles.push(found);
  }

  return cycles;
}

/** One error per member of a loop, with the loop written from that member. */
function cycleProblems(automations: readonly Automation[]): Problem[] {
  const byName = new Map(automations.map((automation) => [automation.name, automation]));
  const problems: Problem[] = [];

  for (const cycle of findCycles(automations)) {
    for (const member of [...cycle].sort()) {
      const automation = byName.get(member);
      if (automation === undefined) continue;

      const index = cycle.indexOf(member);
      const path = [...cycle.slice(index), ...cycle.slice(0, index), member];
      problems.push({
        level: "error",
        file: automation.file,
        line: automation.triggersLine,
        message: `cycle: ${path.join(" → ")}`,
        fix: "Remove one of the after entries in the loop",
      });
    }
  }

  return problems;
}
