import type { Problem } from "../../errors.js";
import { didYouMean } from "../../util/suggest.js";
import { isNameFormatted } from "../factory/validate.js";
import {
  conditionFix,
  conditionProblems,
  conditionVariables,
  parseCondition,
} from "./condition.js";
import type { Condition } from "./condition.js";
import { isVariableName } from "./declarations.js";
import { MAX_COMBINATIONS, combinations } from "./scenarios.js";
import type { EnvVariable } from "./types.js";

export type Node =
  | { kind: "text"; line: number; text: string }
  | {
      kind: "when";
      line: number;
      indent: string;
      condition: Condition;
      children: Node[];
      endLine: number;
    }
  | {
      kind: "switch";
      line: number;
      indent: string;
      variable: string;
      branches: Branch[];
      endLine: number;
    };

export interface Branch {
  kind: "case" | "default";
  line: number;
  indent: string;
  values: string[];
  children: Node[];
}

export interface MarkdownDocument {
  /** Repository-relative, for problems. */
  file: string;
  nodes: Node[];
  problems: Problem[];
  /** Variables any condition or switch in the document names. */
  variables: ReadonlySet<string>;
}

export interface ParseOptions {
  file: string;
  /** Line number of the first line of `text` in the source file (the body of SKILL.md starts after its frontmatter). */
  firstLine: number;
  variables: readonly EnvVariable[];
}

type WhenNode = Extract<Node, { kind: "when" }>;
type SwitchNode = Extract<Node, { kind: "switch" }>;

type Frame =
  | { kind: "when"; node: WhenNode; variables: ReadonlySet<string> }
  | { kind: "switch"; node: SwitchNode; variables: ReadonlySet<string> };

/** A directive line, with its name and trimmed arguments. */
interface Directive {
  name: string;
  args: string | undefined;
}

const DIRECTIVE_PATTERN =
  /^[ \t]*<!--[ \t]*factory:([A-Za-z0-9_-]*)(?:[ \t]+(.*?))?[ \t]*-->[ \t]*$/;
const FENCE_OPEN_PATTERN = /^[ \t]*(`{3,}|~{3,})/;
const DIRECTIVE_NAMES = [
  "when",
  "endwhen",
  "switch",
  "case",
  "default",
  "endswitch",
  "import",
] as const;

const CONDITION_FIX =
  "Write env.<variable> == <value>, != <value> or in [<values>], joined with and, or, not and parentheses";
const WHOLE_LINE_MESSAGE =
  "A factory: directive must be one whole line: <!-- factory:<name> <arguments> -->";
const WHOLE_LINE_FIX = "Write it on one line: <!-- factory:<name> <arguments> -->";
const ONLY_BLANK_MESSAGE = "Only blank lines may come between factory:switch and its first case";
const ONLY_BLANK_FIX = "Move the text into a case";
const LAST_BRANCH_MESSAGE = "factory:default must be the last branch of its switch";
const LAST_BRANCH_FIX = "Move the factory:default to the end of the switch";
const BRANCH_MESSAGE = "factory:<name> must be directly inside a factory:switch";
const CASE_VALUES_MESSAGE = "factory:case needs one or more value names separated by spaces";
const CASE_VALUES_FIX = "Write <!-- factory:case <value> [<value> ...] -->";

interface Fence {
  char: string;
  length: number;
  line: number;
  index: number;
}

function stripBom(line: string): string {
  return line.startsWith("\uFEFF") ? line.slice(1) : line;
}

function indentOf(line: string): string {
  return /^[ \t]*/.exec(line)?.[0] ?? "";
}

function matchDirective(line: string): Directive | undefined {
  const match = DIRECTIVE_PATTERN.exec(stripBom(line));
  if (match === null) return undefined;
  const args = match[2]?.trim();
  return { name: match[1] ?? "", args: args === "" ? undefined : args };
}

/**
 * True for a line that means to be a directive but is not one: a broken
 * `<!-- factory:` comment, or a `factory:` line inside a comment that spans
 * several lines.
 */
function looksLikeDirective(line: string): boolean {
  return /^[ \t]*(?:<!--[ \t]*)?factory:/.test(stripBom(line));
}

function opensFence(line: string): { char: string; length: number } | undefined {
  const match = FENCE_OPEN_PATTERN.exec(line);
  if (match === null) return undefined;
  const run = match[1]!;
  return { char: run[0]!, length: run.length };
}

function closesFence(line: string, fence: { char: string; length: number }): boolean {
  const text = line.trim();
  return text.length >= fence.length && Array.from(text).every((char) => char === fence.char);
}

/**
 * Parses a Markdown file into text and directive nodes. Problems carry the file
 * and line, and parsing continues after each one, so a run reports every
 * problem in a file.
 */
export function parseMarkdown(text: string, options: ParseOptions): MarkdownDocument {
  const { file, firstLine, variables: declared } = options;
  const lines = text.split("\n");
  const nodes: Node[] = [];
  const problems: Problem[] = [];
  const names = new Set<string>();
  const stack: Frame[] = [];
  let fence: Fence | undefined;

  const error = (line: number, message: string, fix: string): void => {
    problems.push({ level: "error", file, line, message, fix });
  };

  const enclosing = (): ReadonlySet<string> => stack.at(-1)?.variables ?? new Set<string>();

  const checkCombinations = (line: number, named: ReadonlySet<string>): void => {
    const count = combinations(named, declared);
    if (count <= MAX_COMBINATIONS) return;
    error(
      line,
      `Condition spans too many combinations: ${count} over ${[...named].join(", ")}; the limit is ${MAX_COMBINATIONS}`,
      "Split the condition, or nest fewer conditions",
    );
  };

  const append = (node: Node): void => {
    const frame = stack.at(-1);
    if (frame === undefined) {
      nodes.push(node);
      return;
    }
    if (frame.kind === "when") {
      frame.node.children.push(node);
      return;
    }
    const branch = frame.node.branches.at(-1);
    if (branch === undefined) {
      error(node.line, ONLY_BLANK_MESSAGE, ONLY_BLANK_FIX);
      return;
    }
    branch.children.push(node);
  };

  const appendText = (line: number, content: string, blankCheck = true): void => {
    const frame = stack.at(-1);
    if (blankCheck && frame?.kind === "switch" && frame.node.branches.length === 0) {
      if (content.trim() !== "") error(line, ONLY_BLANK_MESSAGE, ONLY_BLANK_FIX);
      return;
    }
    append({ kind: "text", line, text: content });
  };

  const openWhen = (directive: Directive, line: number, raw: string): void => {
    const text = directive.args ?? "";
    if (text === "") {
      error(
        line,
        "factory:when needs a condition",
        "Write <!-- factory:when env.<variable> == <value> -->",
      );
      appendText(line, raw, false);
      return;
    }

    const parsed = parseCondition(text);
    if ("error" in parsed) {
      error(line, `Cannot read condition "${text}": ${parsed.error}`, CONDITION_FIX);
      appendText(line, raw, false);
      return;
    }

    for (const message of conditionProblems(parsed.condition, declared)) {
      error(line, message, conditionFix(parsed.condition, declared));
    }

    const own = conditionVariables(parsed.condition);
    const named = new Set([...enclosing(), ...own]);
    checkCombinations(line, named);

    const node: WhenNode = {
      kind: "when",
      line,
      indent: indentOf(raw),
      condition: parsed.condition,
      children: [],
      endLine: line,
    };
    append(node);
    stack.push({ kind: "when", node, variables: named });
    for (const name of own) names.add(name);
  };

  const openSwitch = (directive: Directive, line: number, raw: string): void => {
    const text = directive.args ?? "";
    const match = /^env\.(.*)$/.exec(text);
    if (match === null || !isVariableName(match[1]!)) {
      error(
        line,
        "factory:switch needs env.<variable>",
        "Write <!-- factory:switch env.<variable> -->",
      );
      appendText(line, raw, false);
      return;
    }

    const variable = match[1]!;
    if (!declared.some((entry) => entry.name === variable)) {
      error(
        line,
        `factory:switch names unknown variable "${variable}"`,
        didYouMean(variable, declared.map((entry) => entry.name)) ??
          `Use one of: ${declared.map((entry) => entry.name).join(", ")}`,
      );
    }

    const named = new Set([...enclosing(), variable]);
    checkCombinations(line, named);

    const node: SwitchNode = {
      kind: "switch",
      line,
      indent: indentOf(raw),
      variable,
      branches: [],
      endLine: line,
    };
    append(node);
    stack.push({ kind: "switch", node, variables: named });
    names.add(variable);
  };

  const openBranch = (directive: Directive, line: number, raw: string): void => {
    const frame = stack.at(-1);
    if (frame === undefined || frame.kind !== "switch") {
      error(
        line,
        BRANCH_MESSAGE.replace("<name>", directive.name),
        "Move the line inside a factory:switch, or remove it",
      );
      appendText(line, raw, false);
      return;
    }

    const node = frame.node;
    const declaredVariable = declared.find((entry) => entry.name === node.variable);

    if (directive.name === "default") {
      if (directive.args !== undefined) {
        error(line, "factory:default takes no arguments", `Remove "${directive.args}"`);
      }
      if (node.branches.some((branch) => branch.kind === "default")) {
        error(line, LAST_BRANCH_MESSAGE, LAST_BRANCH_FIX);
      }
      node.branches.push({
        kind: "default",
        line,
        indent: indentOf(raw),
        values: [],
        children: [],
      });
      return;
    }

    const given = (directive.args ?? "").split(/\s+/).filter((value) => value !== "");
    const values: string[] = [];
    let malformed = given.length === 0;
    for (const value of given) {
      if (isNameFormatted(value)) values.push(value);
      else malformed = true;
    }
    if (malformed) error(line, CASE_VALUES_MESSAGE, CASE_VALUES_FIX);

    if (node.branches.some((branch) => branch.kind === "default")) {
      error(line, LAST_BRANCH_MESSAGE, LAST_BRANCH_FIX);
    }

    const previous = new Map<string, number>();
    for (const branch of node.branches) {
      for (const value of branch.values) previous.set(value, branch.line);
    }

    const declaredValues = declaredVariable?.values.map((value) => value.name);
    const kept: string[] = [];
    for (const value of values) {
      const earlier = previous.get(value);
      if (earlier !== undefined) {
        error(line, `Value "${value}" already has a case on line ${earlier}`, "Remove it from one case");
        continue;
      }
      previous.set(value, line);
      kept.push(value);
      if (declaredValues !== undefined && !declaredValues.includes(value)) {
        error(
          line,
          `factory:case names unknown value "${value}" of ${node.variable}`,
          didYouMean(value, declaredValues) ?? `Use one of: ${declaredValues.join(", ")}`,
        );
      }
    }

    node.branches.push({
      kind: "case",
      line,
      indent: indentOf(raw),
      values: kept,
      children: [],
    });
  };

  const closeBlock = (directive: Directive, line: number): void => {
    const frame = stack.at(-1);
    const expected = directive.name === "endwhen" ? "when" : "switch";

    if (frame === undefined) {
      error(line, `factory:${directive.name} has no matching factory:${expected}`, "Remove the line");
      return;
    }
    if (frame.kind !== expected) {
      error(
        line,
        `factory:${directive.name} cannot close the factory:${frame.kind} on line ${frame.node.line}`,
        "Close the inner block first",
      );
      return;
    }
    if (directive.args !== undefined) {
      error(line, `factory:${directive.name} takes no arguments`, `Remove "${directive.args}"`);
    }

    frame.node.endLine = line;
    stack.pop();

    if (frame.kind !== "switch") return;
    if (frame.node.branches.some((branch) => branch.kind === "default")) return;

    const declaredVariable = declared.find((entry) => entry.name === frame.node.variable);
    if (declaredVariable === undefined) return;

    const named = new Set(frame.node.branches.flatMap((branch) => branch.values));
    const missing = declaredVariable.values
      .map((value) => value.name)
      .filter((value) => !named.has(value));
    if (missing.length === 0) return;

    error(
      frame.node.line,
      `factory:switch over env.${frame.node.variable} has no case for ${missing.join(", ")}`,
      "Add a case for each, or a factory:default",
    );
  };

  for (const [index, raw] of lines.entries()) {
    const line = firstLine + index;
    const content = stripBom(raw);

    if (fence !== undefined) {
      if (closesFence(content, fence)) fence = undefined;
      append({ kind: "text", line, text: raw });
      continue;
    }

    const opened = opensFence(content);
    if (opened !== undefined) {
      fence = { ...opened, line, index };
      append({ kind: "text", line, text: raw });
      continue;
    }

    const directive = matchDirective(content);
    if (directive === undefined) {
      if (looksLikeDirective(content)) error(line, WHOLE_LINE_MESSAGE, WHOLE_LINE_FIX);
      appendText(line, raw);
      continue;
    }

    switch (directive.name) {
      case "when":
        openWhen(directive, line, raw);
        break;
      case "switch":
        openSwitch(directive, line, raw);
        break;
      case "case":
      case "default":
        openBranch(directive, line, raw);
        break;
      case "endwhen":
      case "endswitch":
        closeBlock(directive, line);
        break;
      case "import":
        error(line, "factory:import is not supported yet", "Copy the text in for now");
        appendText(line, raw, false);
        break;
      case "start":
      case "end":
        error(
          line,
          `factory:${directive.name} marks the generated block in the root AGENTS.md and cannot appear in source`,
          "Remove the line",
        );
        appendText(line, raw, false);
        break;
      default:
        error(
          line,
          `Unknown directive "factory:${directive.name}"`,
          didYouMean(directive.name, DIRECTIVE_NAMES) ??
            "Use when, endwhen, switch, case, default, endswitch or import",
        );
        appendText(line, raw, false);
        break;
    }
  }

  if (fence !== undefined) {
    const followed = lines
      .slice(fence.index + 1)
      .some((raw) => matchDirective(stripBom(raw)) !== undefined);
    if (followed) {
      problems.push({
        level: "warning",
        file,
        line: fence.line,
        message: `The code fence on line ${fence.line} is never closed, so the directive lines after it are text`,
        fix: "Close the fence",
      });
    }
  }

  while (stack.length > 0) {
    const frame = stack.pop()!;
    error(
      frame.node.line,
      `factory:${frame.kind} on line ${frame.node.line} is never closed in this file`,
      `Add <!-- factory:end${frame.kind} --> in the same file`,
    );
  }

  return { file, nodes, problems, variables: names };
}

/**
 * Lines that are directives, outside fences: for format 1's warning and the
 * frontmatter rule.
 */
export function directiveLines(text: string, firstLine = 1): number[] {
  const result: number[] = [];
  let fence: { char: string; length: number } | undefined;

  for (const [index, raw] of text.split("\n").entries()) {
    const content = stripBom(raw);
    if (fence !== undefined) {
      if (closesFence(content, fence)) fence = undefined;
      continue;
    }
    const opened = opensFence(content);
    if (opened !== undefined) {
      fence = opened;
      continue;
    }
    if (matchDirective(content) !== undefined) result.push(firstLine + index);
  }

  return result;
}
