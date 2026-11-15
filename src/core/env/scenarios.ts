import type { EnvVariable } from "./types.js";

/**
 * The most scenarios a block may span over the variables it and its enclosing
 * conditions name. A document that needs more is an error, so rendering and the
 * all-values root block stay cheap however many variables a factory declares.
 */
export const MAX_COMBINATIONS = 1024;

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
