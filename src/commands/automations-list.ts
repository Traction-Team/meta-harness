import { afterOf } from "../core/automations/prompt.js";
import type { Automation } from "../core/automations/types.js";
import { needsFormatTwo } from "../core/automations/problems.js";
import { findFactory } from "../core/discovery.js";
import { loadFactory } from "../core/factory/index.js";
import type { Factory } from "../core/factory/types.js";
import { ExitCode } from "../errors.js";
import type { Problem } from "../errors.js";
import type { CommandResult } from "../output.js";
import type { CommandDefinition } from "./types.js";

const AUTOMATIONS_DIR = ".factory/automations";
const AUTOMATION_FILE = ".factory/automations/";

/** A block's labels, padded so every value starts in the same column. */
const TRIGGER = "  trigger:  ";
const CHECKOUT = "  checkout: ";
const OWNER = "  owner:    ";
const AFTER = "  after:    ";

function failed(problems: readonly Problem[]): CommandResult {
  return {
    ok: false,
    command: "automations list",
    exitCode: ExitCode.Failed,
    problems: [...problems],
  };
}

/** Every error `check` reports in `.factory/automations/`. */
function automationErrors(factory: Factory): Problem[] {
  return factory.problems.filter(
    (problem) =>
      problem.level === "error" &&
      (problem.file === AUTOMATIONS_DIR || problem.file.startsWith(AUTOMATION_FILE)),
  );
}

function block(automation: Automation, after: readonly string[]): string {
  const lines = [`${automation.name}  (${automation.enabled ? "enabled" : "disabled"})`];
  if (automation.description !== undefined) {
    lines.push(`  description: ${automation.description}`);
  }
  for (const trigger of automation.triggers) {
    lines.push(
      trigger.kind === "schedule"
        ? `${TRIGGER}schedule ${trigger.cron} ${trigger.tz}`
        : `${TRIGGER}after ${trigger.names.join(", ")}`,
    );
  }
  lines.push(`${CHECKOUT}${automation.checkout}`);
  lines.push(`${OWNER}${automation.owner}`);
  lines.push(`${AFTER}${after.length === 0 ? "none" : after.join(", ")}`);
  return lines.join("\n");
}

export const automationsListCommand: CommandDefinition = {
  name: "automations list",
  description: "Show the automations in the factory",
  usage: "metafab automations list [--json]",
  async run(context) {
    const location = await findFactory(context.cwd, { command: "automations list" });
    const factory = await loadFactory(location.root);

    if (factory.factoryYaml?.format !== 2) return failed([needsFormatTwo()]);

    const problems = automationErrors(factory);
    if (problems.length > 0) return failed(problems);

    const list = factory.automations?.list ?? [];
    const after = new Map(
      list.map((automation) => [automation.name, afterOf(automation.name, list)]),
    );

    const result: CommandResult = {
      ok: true,
      command: "automations list",
      exitCode: ExitCode.Ok,
      problems: [],
      automations: list.map((automation) => ({
        name: automation.name,
        file: automation.file,
        owner: automation.owner,
        description: automation.description,
        enabled: automation.enabled,
        checkout: automation.checkout,
        triggers: automation.triggers,
        after: after.get(automation.name),
      })),
    };

    if (context.options.json !== true) {
      result.summary =
        list.length === 0
          ? "No automations."
          : list.map((automation) => block(automation, after.get(automation.name) ?? [])).join("\n\n");
    }
    return result;
  },
};
