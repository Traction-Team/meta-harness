import { conditionVariables, evaluate } from "./condition.js";
import type { Condition } from "./condition.js";
import type { EnvSelection, EnvVariable } from "./types.js";

/**
 * The most scenarios a block may span over the variables it and its enclosing
 * conditions name. A document that needs more is an error, so rendering and the
 * all-values root block stay cheap however many variables a factory declares.
 */
export const MAX_COMBINATIONS = 1024;

/** One selected value for each of a block's variables. */
export type Scenario = ReadonlyMap<string, string>;

/** How a block applies to the selection. */
export type Applies = { kind: "all" } | { kind: "none" } | { kind: "some"; label: string };

/**
 * Product of the declared value counts of `variables`: the all-values case,
 * independent of the selection. A variable the factory does not declare has no
 * declared values, so the product is 0.
 */
export function combinations(
  variables: Iterable<string>,
  declared: readonly EnvVariable[],
): number {
  const counts = new Map(declared.map((variable) => [variable.name, variable.values.length]));
  let total = 1;

  for (const name of variables) {
    const count = counts.get(name);
    if (count === undefined) return 0;
    total *= count;
    if (total > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  }

  return total;
}

/**
 * Every scenario over `variables`, in declaration order: the product of the
 * selected values, with the first variable varying slowest. A variable the
 * selection does not give a value for contributes none.
 */
export function scenarios(selection: EnvSelection, variables: Iterable<string>): Scenario[] {
  let result: Scenario[] = [new Map()];

  for (const name of variables) {
    const values = selection.get(name) ?? [];
    const next: Scenario[] = [];
    for (const scenario of result) {
      for (const value of values) {
        const extended = new Map(scenario);
        extended.set(name, value);
        next.push(extended);
      }
    }
    result = next;
  }

  return result;
}

/**
 * Classifies a condition in the scenarios where its enclosing conditions are
 * true: `all` when it holds in every one, `none` when it holds in none, else
 * `some` with the label its kept text takes. No other variable is enumerated,
 * because no other variable can change the result.
 */
export function classify(
  condition: Condition,
  enclosing: readonly Condition[],
  selection: EnvSelection,
  variables: readonly EnvVariable[],
): Applies {
  const named = conditionVariables(condition);
  for (const outer of enclosing) {
    for (const name of conditionVariables(outer)) named.add(name);
  }

  const context = scenarios(selection, declarationOrder(named, variables)).filter((scenario) =>
    enclosing.every((outer) => evaluate(outer, scenario)),
  );
  if (context.length === 0) return { kind: "none" };

  const kept = context.filter((scenario) => evaluate(condition, scenario));
  if (kept.length === context.length) return { kind: "all" };
  if (kept.length === 0) return { kind: "none" };
  return { kind: "some", label: labelFor(condition, context, kept, variables) };
}

/** The selection with every declared value of every variable: the root `AGENTS.md` render. */
export function allValues(variables: readonly EnvVariable[]): EnvSelection {
  return new Map(
    variables.map((variable) => [variable.name, variable.values.map((value) => value.name)]),
  );
}

/** The declared variables a set of names names, in `env` order. */
function declarationOrder(
  named: ReadonlySet<string>,
  variables: readonly EnvVariable[],
): string[] {
  return variables.map((variable) => variable.name).filter((name) => named.has(name));
}

/**
 * The label a partially matching block takes, as the spec's Rendering section
 * builds it: each of the condition's variables that takes more than one value
 * in the context and is not true for every one of them contributes the labels
 * of the values it can be true for, joined with ` or `. When that names no
 * variable, every combination of the condition's variables for which it is true
 * is listed instead.
 */
function labelFor(
  condition: Condition,
  context: readonly Scenario[],
  kept: readonly Scenario[],
  variables: readonly EnvVariable[],
): string {
  const own = conditionVariables(condition);
  const parts: string[] = [];

  for (const variable of variables) {
    if (!own.has(variable.name)) continue;

    const possible = new Set(context.map((scenario) => scenario.get(variable.name)));
    if (possible.size < 2) continue;

    const reachable = new Set(kept.map((scenario) => scenario.get(variable.name)));
    if (reachable.size === possible.size) continue;

    const labels = variable.values
      .filter((value) => reachable.has(value.name))
      .map((value) => value.label);
    if (labels.length > 0) parts.push(labels.join(" or "));
  }

  if (parts.length > 0) return parts.join(", and ");

  const ownVariables = variables.filter((variable) => own.has(variable.name));
  const seen = new Set<string>();
  const listed: string[] = [];

  for (const scenario of kept) {
    const names = ownVariables.map((variable) => scenario.get(variable.name) ?? "");
    const key = names.join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    listed.push(
      ownVariables
        .map((variable, index) => {
          const name = names[index] ?? "";
          return (
            variable.values.find((value) => value.name === name)?.label ??
            `When ${variable.name} is ${name}`
          );
        })
        .join(", and "),
    );
  }

  return listed.join(" or ");
}
