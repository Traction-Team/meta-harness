import { MetafabError } from "../../errors.js";
import { ask } from "../../input.js";
import type { InputIO } from "../../input.js";
import { normalizeProblemPath } from "../../util/fs.js";
import { TARGETS } from "../config/types.js";
import type { Target } from "../config/types.js";

export type TargetSelection = "all" | Target[];

export type TargetPrompt = (targets: readonly Target[], io: InputIO) => Promise<TargetSelection>;

export interface SelectTargetsOptions {
  /** Raw `--agents` value. */
  agents?: string;
  /** The `agents` value from an existing metafab.yaml, if any. */
  existing?: TargetSelection;
  /** Injected input and output; production uses the process streams. */
  io?: InputIO;
  /** Injected terminal prompt, so tests do not need a terminal. */
  prompt?: TargetPrompt;
}

function agentsError(message: string): MetafabError {
  const fix = `Use a comma-separated list of ${TARGETS.join(", ")}, or all.`;

  return new MetafabError(message, {
    code: "invalid-agents",
    problems: [
      {
        level: "error",
        file: normalizeProblemPath("metafab"),
        message,
        fix,
      },
    ],
  });
}

function unique(targets: readonly Target[]): Target[] {
  return [...new Set(targets)];
}

export function parseAgentsFlag(value: string): TargetSelection {
  const list = value.trim();
  if (list === "") throw agentsError("--agents requires at least one target.");
  if (list === "all") return "all";

  const names = list.split(",").map((name) => name.trim());
  const targets: Target[] = [];

  for (const name of names) {
    if (name === "") throw agentsError(`Invalid value for --agents: "${value}".`);
    if (!(TARGETS as readonly string[]).includes(name)) {
      throw agentsError(`Unknown agent target "${name}" in --agents.`);
    }
    targets.push(name as Target);
  }

  return unique(targets);
}

function parseAnswer(answer: string, targets: readonly Target[]): TargetSelection | undefined {
  const value = answer.trim();
  if (value === "" || value.toLowerCase() === "all") return "all";

  const selected: Target[] = [];
  for (const part of value.split(",")) {
    const item = part.trim();
    if (item === "") return undefined;

    const position = Number(item);
    const target =
      Number.isInteger(position) && position >= 1 && position <= targets.length
        ? targets[position - 1]
        : targets.find((candidate) => candidate === item.toLowerCase());

    if (target === undefined) return undefined;
    selected.push(target);
  }

  return selected.length === 0 ? undefined : unique(selected);
}

export const promptForTargets: TargetPrompt = async (targets, io) => {
  const list = targets.map((target, index) => `  ${index + 1}. ${target}`).join("\n");
  io.stderr?.(`Agent targets:\n${list}\n`);

  for (;;) {
    const answer = await ask(
      {
        name: "agents",
        flag: "--agents",
        description: "Agent targets (numbers or names, comma-separated, or all)",
      },
      io,
    );
    const selected = parseAnswer(answer, targets);
    if (selected !== undefined) return selected;
    io.stderr?.(`Choose from: ${targets.join(", ")}, or all.\n`);
  }
};

export async function selectTargets(options: SelectTargetsOptions = {}): Promise<TargetSelection> {
  if (options.agents !== undefined) return parseAgentsFlag(options.agents);
  if (options.existing !== undefined) {
    return options.existing === "all" ? "all" : unique(options.existing);
  }

  const io = options.io ?? {};
  const tty = io.tty ?? process.stdin.isTTY === true;
  if (!tty) return "all";

  const prompt = options.prompt ?? promptForTargets;
  return prompt([...TARGETS], io);
}
