import type { Problem } from "../../errors.js";

export interface EnvValue {
  name: string;
  /** The declared label, or `When <variable> is <value>`. */
  label: string;
  line: number;
}

export interface EnvVariable {
  name: string;
  description?: string;
  /** Declaration order, never empty after validation. */
  values: EnvValue[];
  /** Value names in declaration order, when the variable declares a default. */
  default?: string[];
  /** The variable's key line in `factory.yaml`. */
  line: number;
}

/**
 * Variable name → selected value names, in declaration order. Every declared
 * variable has an entry.
 */
export type EnvSelection = ReadonlyMap<string, readonly string[]>;

export type SelectionSource = "option" | "environment" | "git" | "default" | "all";

export type GitConfigScope = "worktree" | "local" | "global" | "system";

export interface ResolvedVariable {
  variable: string;
  values: string[];
  source: SelectionSource;
  /** The Git config scope the selection came from, for `git`. */
  scope?: GitConfigScope;
  /** The `FACTORY_ENV_<VAR>` variable that supplied the selection, for `environment`. */
  from?: string;
}

export interface ResolvedSelection {
  variables: ResolvedVariable[];
  selection: EnvSelection;
  warnings: Problem[];
}
