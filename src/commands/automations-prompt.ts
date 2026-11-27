import { account } from "../core/automations/account.js";
import {
  missingAccount,
  missingAutomation,
  needsFormatTwo,
  otherOwner,
  turnedOff,
  unknownTarget,
} from "../core/automations/problems.js";
import { afterOf, promptProblems, renderPrompt } from "../core/automations/prompt.js";
import { TARGETS } from "../core/automations/types.js";
import type { Target } from "../core/automations/types.js";
import { findFactory } from "../core/discovery.js";
import { envOptions, resolveSelection } from "../core/env/index.js";
import type { ResolvedSelection } from "../core/env/index.js";
import { loadFactory } from "../core/factory/index.js";
import { ExitCode, MetafabError } from "../errors.js";
import type { Problem } from "../errors.js";
import type { CommandResult } from "../output.js";
import { normalizeProblemPath } from "../util/fs.js";
import type { CommandContext, CommandDefinition } from "./types.js";

const COMMAND = "automations prompt";

/**
 * A prompt failure writes nothing to standard output: its problems go to
 * standard error, so a run's harness reports what it printed and stops.
 */
function failed(problems: readonly Problem[]): CommandResult {
  return {
    ok: false,
    command: COMMAND,
    exitCode: ExitCode.Failed,
    problems: [...problems],
    textOnly: true,
  };
}

function targetOption(value: unknown): Target | undefined {
  if (typeof value !== "string") return undefined;
  return TARGETS.find((target) => target === value);
}

async function runPrompt(context: CommandContext): Promise<CommandResult> {
  const name = context.positionals[0];
  if (context.positionals.length !== 1 || name === undefined) {
    const message = "automations prompt requires one automation name.";
    return failed([
      {
        level: "error",
        file: normalizeProblemPath("metafab"),
        message,
        fix: "Run metafab automations prompt <name> [--target <target>] [--env <variable>=<values>]",
      },
    ]);
  }

  const location = await findFactory(context.cwd, { command: COMMAND });
  const factory = await loadFactory(location.root);
  if (factory.factoryYaml?.format !== 2) return failed([needsFormatTwo()]);

  const list = factory.automations?.list ?? [];
  const automation = list.find((entry) => entry.name === name);
  if (automation === undefined) {
    // A directory that exists but did not load has its own errors, which say
    // more than "no automation named".
    const own = factory.problems.filter(
      (problem) =>
        problem.level === "error" &&
        (problem.file === `.factory/automations/${name}` ||
          problem.file === `.factory/automations/${name}/automation.md`),
    );
    return failed(own.length > 0 ? own : [missingAutomation(name)]);
  }
  if (!automation.enabled) return failed([turnedOff(automation)]);

  const targetValue = context.options.target;
  const target = targetOption(targetValue);
  if (targetValue !== undefined && target === undefined) {
    return failed([unknownTarget(typeof targetValue === "string" ? targetValue : "")]);
  }

  const problems = await promptProblems(name, factory);
  if (problems.length > 0) return failed(problems);

  const resolved: ResolvedSelection = await resolveSelection(factory.factoryYaml?.env ?? [], {
    root: factory.root,
    options: envOptions(context.options.env),
  });

  if (target !== undefined) {
    const actor = await account(target, factory.root);
    if (actor === undefined) return failed([missingAccount(target)]);
    if (automation.owner !== "*" && automation.owner.toLowerCase() !== actor.toLowerCase()) {
      return failed([otherOwner(automation, actor)]);
    }
  }

  const text = await renderPrompt(factory, automation, resolved.selection, afterOf(name, list));
  const result: CommandResult = {
    ok: true,
    command: COMMAND,
    exitCode: ExitCode.Ok,
    problems: [],
    prompt: text,
    textOnly: true,
  };
  if (context.options.json !== true) result.summary = text;
  return result;
}

export const automationsPromptCommand: CommandDefinition = {
  name: COMMAND,
  description: "Print one run's prompt for an automation",
  usage:
    "metafab automations prompt <name> [--target <target>] [--env <variable>=<values>]...",
  arguments: [{ name: "name", description: "An automation in .factory/automations/" }],
  options: {
    target: {
      type: "string",
      value: "<target>",
      description: "Also check the account the target runs as: orca or amp",
    },
    env: {
      type: "string",
      multiple: true,
      value: "<variable>=<values>",
      description: "Render the prompt for this environment selection",
    },
  },
  async run(context) {
    try {
      return await runPrompt(context);
    } catch (error) {
      // A bad --env and a body that a selection empties are failures of this
      // command, not bugs, and neither may write to standard output.
      if (error instanceof MetafabError) return failed(error.problems ?? []);
      throw error;
    }
  },
};
