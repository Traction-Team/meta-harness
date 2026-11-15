import type {
  EnvVariable,
  GitConfigScope,
  ResolvedSelection,
  SelectionSource,
} from "./types.js";

export interface EnvValueReport {
  name: string;
  label: string;
}

/** One variable of `metafab env` and `build --json`'s `env`. */
export interface EnvVariableReport {
  name: string;
  description?: string;
  values: EnvValueReport[];
  /** Value names, in the order `values` declares them. */
  selected: string[];
  source: SelectionSource;
  /** The Git config scope, for `git`. */
  scope?: GitConfigScope;
  /** The `FACTORY_ENV_<VAR>` variable that supplied the selection, for `environment`. */
  from?: string;
}

/**
 * The `variables` list `env` reports and `build --json` adds, in declaration
 * order, with each variable's values and where its selection came from.
 */
export function describeSelection(
  variables: readonly EnvVariable[],
  resolved: ResolvedSelection,
): EnvVariableReport[] {
  const byName = new Map(resolved.variables.map((variable) => [variable.variable, variable]));

  const reports: EnvVariableReport[] = [];
  for (const variable of variables) {
    const selection = byName.get(variable.name);
    if (selection === undefined) continue;

    reports.push({
      name: variable.name,
      ...(variable.description === undefined ? {} : { description: variable.description }),
      values: variable.values.map((value) => ({ name: value.name, label: value.label })),
      selected: [...selection.values],
      source: selection.source,
      ...(selection.scope === undefined ? {} : { scope: selection.scope }),
      ...(selection.from === undefined ? {} : { from: selection.from }),
    });
  }
  return reports;
}

/** The source words `metafab env` prints in its last column. */
export function sourceWord(resolved: {
  source: SelectionSource;
  scope?: GitConfigScope;
  from?: string;
}): string {
  switch (resolved.source) {
    case "option":
      return "--env";
    case "environment":
      return resolved.from ?? "process environment";
    case "git":
      return `Git config (${resolved.scope ?? "unknown"})`;
    case "default":
      return "default in factory.yaml";
    case "all":
      return "every value (nothing selected)";
  }
}
