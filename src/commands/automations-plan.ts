import { account } from "../core/automations/account.js";
import { planAmp } from "../core/automations/amp-schedule.js";
import type { AmpEntry } from "../core/automations/amp-schedule.js";
import { desiredSet } from "../core/automations/desired.js";
import { changeLine, createOrcaRunner, plannedResult, prepareOrcaSync } from "../core/automations/orca.js";
import type { OrcaCommandPlan } from "../core/automations/orca.js";
import {
  badBranch,
  missingAccount,
  missingAmpAccount,
  needsFormatTwo,
  noTrunk,
} from "../core/automations/problems.js";
import { defaultTrunk, isBranchName } from "../core/automations/stub.js";
import { findFactory } from "../core/discovery.js";
import { loadFactory } from "../core/factory/index.js";
import type { Factory } from "../core/factory/types.js";
import { ExitCode } from "../errors.js";
import type { Problem } from "../errors.js";
import type { CommandResult } from "../output.js";
import { normalizeProblemPath } from "../util/fs.js";
import type { CommandContext, CommandDefinition } from "./types.js";

const COMMAND = "automations plan";

function failed(problems: readonly Problem[]): CommandResult {
  return { ok: false, command: COMMAND, exitCode: ExitCode.Failed, problems: [...problems] };
}

function targetProblem(value: string | undefined): Problem {
  return {
    level: "error",
    file: normalizeProblemPath("metafab"),
    message: value === undefined ? "automations plan requires a target" : `Unknown target "${value}"`,
    fix: "Run metafab automations plan orca, or metafab automations plan amp",
  };
}

function describe(plan: OrcaCommandPlan): string {
  const lines: string[] = [];
  for (const entry of plan.desired) {
    lines.push(`automation: ${entry.name}`);
    lines.push(`  title:    ${entry.title}`);
    lines.push(`  trigger:  ${entry.cron} ${entry.tz}`);
    lines.push(`  checkout: ${entry.checkout}`);
  }

  const changes = plannedResult(plan);
  const changeLines = changes.applied.map(changeLine);
  for (const title of changes.leftAlone) changeLines.push(`left alone: ${title}`);

  if (changeLines.length === 0) changeLines.push("Orca automations are up to date.");
  if (lines.length > 0) lines.push("");
  lines.push(...changeLines);
  return lines.join("\n");
}

async function runPlanOrca(
  context: CommandContext,
  factory: Factory,
  accountEmail: string,
  trunk: string,
): Promise<CommandResult> {
  const agent = typeof context.options.agent === "string" ? context.options.agent : undefined;
  const plan = await prepareOrcaSync({
    factory,
    account: accountEmail,
    trunk,
    agent,
    run: createOrcaRunner(),
  });
  const changes = plannedResult(plan);

  const result: CommandResult = {
    ok: true,
    command: COMMAND,
    exitCode: ExitCode.Ok,
    problems: [],
    account: accountEmail,
    entries: plan.desired,
    created: changes.created,
    updated: changes.updated,
    disabled: changes.disabled,
    removed: changes.removed,
    unchanged: changes.unchanged,
    leftAlone: changes.leftAlone,
  };
  if (context.options.json !== true) result.summary = describe(plan);
  return result;
}

/** The lines `plan amp` prints without `--json`. */
function describeAmp(entries: readonly AmpEntry[]): string {
  if (entries.length === 0) return "No automations to register in Amp.";

  const lines: string[] = [];
  for (const entry of entries) {
    if (lines.length > 0) lines.push("");
    lines.push(entry.title);
    lines.push(`  label:    ${entry.schedule_label}`);
    for (const line of entry.schedule.split("\n")) lines.push(`  ${line}`);
  }
  return lines.join("\n");
}

async function runPlanAmp(
  context: CommandContext,
  factory: Factory,
  accountEmail: string,
  trunk: string,
): Promise<CommandResult> {
  const desired = await desiredSet(factory, "amp", accountEmail, trunk);
  const entries = planAmp(desired, new Date());

  const result: CommandResult = {
    ok: true,
    command: COMMAND,
    exitCode: ExitCode.Ok,
    problems: [],
    account: accountEmail,
    entries,
  };
  if (context.options.json !== true) result.summary = describeAmp(entries);
  return result;
}

async function runPlan(context: CommandContext): Promise<CommandResult> {
  const target = context.positionals[0];
  if (context.positionals.length !== 1 || (target !== "orca" && target !== "amp")) {
    return failed([targetProblem(target)]);
  }

  const location = await findFactory(context.cwd, { command: COMMAND });
  const factory = await loadFactory(location.root);
  if (factory.factoryYaml?.format !== 2) return failed([needsFormatTwo()]);

  const owner = await account(target, factory.root);
  if (owner === undefined) {
    return failed([target === "amp" ? missingAmpAccount() : missingAccount("orca")]);
  }

  // The trunk is settled before either target builds its desired set, so a
  // branch Git refuses never reaches a stub or a registration.
  const branch = context.options.branch;
  if (typeof branch === "string" && !(await isBranchName(factory.root, branch))) {
    return failed([badBranch(branch)]);
  }
  const trunk = typeof branch === "string" ? branch : await defaultTrunk(factory.root);
  if (trunk === undefined) return failed([noTrunk()]);

  return target === "amp"
    ? runPlanAmp(context, factory, owner, trunk)
    : runPlanOrca(context, factory, owner, trunk);
}

export const automationsPlanCommand: CommandDefinition = {
  name: COMMAND,
  description: "Show the registrations a target's sync would create, update or remove",
  usage: "metafab automations plan <target> [--agent <id>] [--branch <trunk>]",
  arguments: [{ name: "target", description: "The harness to plan for; orca or amp" }],
  options: {
    agent: {
      type: "string",
      value: "<id>",
      description: "The Orca agent to run the automations with, such as opencode, claude or codex",
    },
    branch: {
      type: "string",
      value: "<trunk>",
      description: "The trunk a run switches to; the remote's default branch by default",
    },
  },
  run: runPlan,
};
