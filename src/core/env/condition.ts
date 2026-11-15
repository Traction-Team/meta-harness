import { didYouMean } from "../../util/suggest.js";
import { isNameFormatted } from "../factory/validate.js";
import type { EnvVariable } from "./types.js";

/**
 * A condition over an environment selection, as the spec's Conditions section
 * defines it. `==` is a test of one value and `!=` its negation; `in` lists
 * several.
 */
export type Condition =
  | { kind: "test"; variable: string; values: string[]; negate: boolean }
  | { kind: "not"; operand: Condition }
  | { kind: "and" | "or"; operands: Condition[] };

/** The characters that end a word, whichever side of it whitespace sits on. */
const WORD_BREAK = "()[],=!";

/** The fix for a condition that does not parse: the grammar, in one line. */
export const CONDITION_FIX =
  "Write env.<variable> == <value>, != <value> or in [<values>], joined with and, or, not and parentheses";

type Token = { kind: "symbol" | "word"; text: string };

/** A parse error, rendered as `<reason> at "<token>"`. */
class ConditionError extends Error {
  readonly reason: string;
  readonly token: string;

  constructor(reason: string, token: string) {
    super(`${reason} at "${token}"`);
    this.name = "ConditionError";
    this.reason = reason;
    this.token = token;
  }
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const pair = text.slice(index, index + 2);
    if (pair === "==" || pair === "!=") {
      tokens.push({ kind: "symbol", text: pair });
      index += 2;
      continue;
    }

    if (WORD_BREAK.includes(char)) {
      tokens.push({ kind: "symbol", text: char });
      index += 1;
      continue;
    }

    let end = index;
    while (end < text.length && !/\s/.test(text[end]!) && !WORD_BREAK.includes(text[end]!)) {
      end += 1;
    }
    tokens.push({ kind: "word", text: text.slice(index, end) });
    index = end;
  }

  return tokens;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Condition {
    if (this.tokens.length === 0) throw new ConditionError("Empty condition", "");
    const condition = this.parseOr();
    const leftover = this.peek();
    if (leftover !== undefined) throw new ConditionError("Unexpected token", leftover.text);
    return condition;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private peekWord(word: string): boolean {
    const token = this.peek();
    return token?.kind === "word" && token.text === word;
  }

  /** Parses the operand after an operator, naming the operator when none follows. */
  private operandAfter(operator: string, parse: () => Condition): Condition {
    if (this.peek() === undefined) throw new ConditionError("Trailing operator", operator);
    return parse();
  }

  private parseOr(): Condition {
    const operands = [this.parseAnd()];
    while (this.peekWord("or")) {
      this.index += 1;
      operands.push(this.operandAfter("or", () => this.parseAnd()));
    }
    return operands.length === 1 ? operands[0]! : { kind: "or", operands };
  }

  private parseAnd(): Condition {
    const operands = [this.parseNot()];
    while (this.peekWord("and")) {
      this.index += 1;
      operands.push(this.operandAfter("and", () => this.parseNot()));
    }
    return operands.length === 1 ? operands[0]! : { kind: "and", operands };
  }

  private parseNot(): Condition {
    if (!this.peekWord("not")) return this.parseAtom();
    this.index += 1;
    return { kind: "not", operand: this.operandAfter("not", () => this.parseNot()) };
  }

  private parseAtom(): Condition {
    const token = this.peek();
    if (token === undefined) throw new ConditionError("Expected a condition", "");

    if (token.kind === "symbol" && token.text === "(") {
      this.index += 1;
      const inner = this.parseOr();
      const close = this.peek();
      if (close === undefined) throw new ConditionError('Unclosed "("', "");
      if (close.kind !== "symbol" || close.text !== ")") {
        throw new ConditionError('Expected ")"', close.text);
      }
      this.index += 1;
      return inner;
    }

    if (token.kind !== "word" || token.text === "and" || token.text === "or" || token.text === "in") {
      throw new ConditionError("Expected a condition", token.text);
    }

    if (!token.text.startsWith("env.")) {
      throw new ConditionError("Expected env.<variable>", token.text);
    }
    const variable = token.text.slice("env.".length);
    if (variable === "") throw new ConditionError("Expected a variable name", token.text);
    if (!isNameFormatted(variable)) throw new ConditionError("Invalid variable name", token.text);
    this.index += 1;

    return this.parseTest(variable);
  }

  private parseTest(variable: string): Condition {
    const operator = this.peek();
    if (operator === undefined) throw new ConditionError("Expected ==, != or in", "");
    if (operator.kind === "symbol" && operator.text === "=") {
      throw new ConditionError("Expected ==", operator.text);
    }
    if (operator.kind === "symbol" && operator.text === "!") {
      throw new ConditionError("Expected !=", operator.text);
    }

    if (operator.kind === "symbol" && (operator.text === "==" || operator.text === "!=")) {
      this.index += 1;
      const value = this.peek();
      if (value === undefined) throw new ConditionError("Trailing operator", operator.text);
      if (value.kind !== "word") throw new ConditionError("Expected a value", value.text);
      if (!isNameFormatted(value.text)) {
        throw new ConditionError("Invalid value name", value.text);
      }
      this.index += 1;
      return { kind: "test", variable, values: [value.text], negate: operator.text === "!=" };
    }

    if (operator.kind === "word" && operator.text === "in") {
      this.index += 1;
      return { kind: "test", variable, values: this.parseValues(), negate: false };
    }

    throw new ConditionError("Expected ==, != or in", operator.text);
  }

  private parseValues(): string[] {
    const open = this.peek();
    if (open === undefined) throw new ConditionError('Expected "["', "");
    if (open.kind !== "symbol" || open.text !== "[") {
      throw new ConditionError('Expected "["', open.text);
    }
    this.index += 1;

    const values: string[] = [];
    for (;;) {
      const token = this.peek();
      if (token === undefined) throw new ConditionError('Unclosed "["', "");
      if (token.kind === "symbol" && token.text === "]") {
        throw values.length === 0
          ? new ConditionError("Empty value list", token.text)
          : new ConditionError("Expected a value", token.text);
      }
      if (token.kind !== "word") throw new ConditionError("Expected a value", token.text);
      if (!isNameFormatted(token.text)) {
        throw new ConditionError("Invalid value name", token.text);
      }
      values.push(token.text);
      this.index += 1;

      const separator = this.peek();
      if (separator === undefined) throw new ConditionError('Unclosed "["', "");
      if (separator.kind === "symbol" && separator.text === "]") {
        this.index += 1;
        return values;
      }
      if (separator.kind !== "symbol" || separator.text !== ",") {
        throw new ConditionError('Expected "," or "]"', separator.text);
      }
      this.index += 1;
    }
  }
}

/** Parses a condition, or returns the first error as `<reason> at "<token>"`. */
export function parseCondition(text: string): { condition: Condition } | { error: string } {
  try {
    return { condition: new Parser(tokenize(text)).parse() };
  } catch (error) {
    if (error instanceof ConditionError) return { error: error.message };
    throw error;
  }
}

function tests(condition: Condition): { variable: string; values: string[] }[] {
  switch (condition.kind) {
    case "test":
      return [condition];
    case "not":
      return tests(condition.operand);
    case "and":
    case "or":
      return condition.operands.flatMap(tests);
  }
}

/**
 * The names a condition uses that the factory does not declare, as messages.
 * `parseCondition` has already proved the shape.
 */
export function conditionProblems(
  condition: Condition,
  variables: readonly EnvVariable[],
): string[] {
  const declared = new Map(variables.map((variable) => [variable.name, variable]));
  const problems: string[] = [];

  for (const test of tests(condition)) {
    const variable = declared.get(test.variable);
    if (variable === undefined) {
      problems.push(`Condition names unknown variable "${test.variable}"`);
      continue;
    }
    const values = variable.values.map((value) => value.name);
    for (const value of test.values) {
      if (!values.includes(value)) {
        problems.push(`Condition names unknown value "${value}" of ${test.variable}`);
      }
    }
  }

  return problems;
}

/**
 * The fix for the problems `conditionProblems` reports: the did-you-mean for
 * the one name the factory does not declare, else the declared names.
 */
export function conditionFix(condition: Condition, variables: readonly EnvVariable[]): string {
  const declared = new Map(variables.map((variable) => [variable.name, variable]));
  const unknown: { name: string; candidates: readonly string[] }[] = [];

  for (const test of tests(condition)) {
    const variable = declared.get(test.variable);
    if (variable === undefined) {
      unknown.push({ name: test.variable, candidates: variables.map((entry) => entry.name) });
      continue;
    }
    const values = variable.values.map((value) => value.name);
    for (const value of test.values) {
      if (!values.includes(value)) unknown.push({ name: value, candidates: values });
    }
  }

  if (unknown.length !== 1) return "Use a declared variable and value";
  const [first] = unknown;
  return didYouMean(first!.name, first!.candidates) ?? `Use one of: ${first!.candidates.join(", ")}`;
}

/** Evaluates a condition in a scenario, which selects one value per variable. */
export function evaluate(
  condition: Condition,
  scenario: ReadonlyMap<string, string>,
): boolean {
  switch (condition.kind) {
    case "test": {
      const selected = scenario.get(condition.variable);
      const included = selected !== undefined && condition.values.includes(selected);
      return condition.negate ? !included : included;
    }
    case "not":
      return !evaluate(condition.operand, scenario);
    case "and":
      return condition.operands.every((operand) => evaluate(operand, scenario));
    case "or":
      return condition.operands.some((operand) => evaluate(operand, scenario));
  }
}

/** The variables a condition names, in the order it first names them. */
export function conditionVariables(condition: Condition): Set<string> {
  return new Set(tests(condition).map((test) => test.variable));
}
