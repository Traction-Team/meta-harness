import type { Document } from "yaml";
import type { Problem } from "../../errors.js";
import type { Condition } from "../env/condition.js";
import type { EnvVariable } from "../env/types.js";

export interface Factory {
  root: string;
  dir: string;
  factoryYaml?: FactoryYaml;
  agentsMd?: string;
  skills: Skill[];
  problems: Problem[];
}

export interface FactoryYaml {
  format: 1 | 2;
  name: string;
  description?: string;
  pipeline: PipelineEntry[];
  /** Repository files the workflows need outside `.factory/`; empty when none. */
  requires: Requirement[];
  /** Format 2: the variables a developer selects values for; empty when none. */
  env: EnvVariable[];
  /** Format 2: the condition of each skill that depends on the environment; empty when none. */
  skills: SkillCondition[];
  doc: Document.Parsed;
}

/** A `skills` entry: a skill that is installed only where its condition can be true. */
export interface SkillCondition {
  name: string;
  condition?: Condition;
  /** Line of the entry in `factory.yaml`. */
  line: number;
}

export interface PipelineEntry {
  workflow: string;
  stop?: string;
  line: number;
}

export interface Requirement {
  /** Repository-relative, `/`-separated. */
  path: string;
  description: string;
  /** Repository-relative, starts with `.factory/templates/`. */
  template?: string;
  /** Line of the entry in `factory.yaml`. */
  line: number;
}

export interface Skill {
  name: string;
  relDir: string;
  group: string;
  isWorkflow: boolean;
  frontmatter: Record<string, unknown>;
  frontmatterLines: { start: number; end: number };
  title?: string;
}
