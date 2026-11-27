import type { Problem } from "../../errors.js";

/** One way an automation starts: a schedule, or the end of another automation. */
export type Trigger =
  | { kind: "schedule"; cron: string; tz: string; line: number }
  | { kind: "after"; names: string[]; line: number };

export interface Automation {
  name: string;
  /** `.factory/automations/<name>/automation.md`, always with `/`. */
  file: string;
  /** `"*"` or an email, trimmed. */
  owner: string;
  description?: string;
  enabled: boolean;
  checkout: "worktree" | "main";
  triggers: Trigger[];
  /** Raw, LF, below the frontmatter. */
  body: string;
  /** First body line, for directive problems. */
  bodyLine: number;
  /** Line of the `triggers` key, where a loop names this automation. */
  triggersLine: number;
}

export interface Automations {
  /** Sorted by name. */
  list: Automation[];
  /** `.factory/automations/run.md`, when the factory has one. */
  runFile?: string;
  problems: Problem[];
}
