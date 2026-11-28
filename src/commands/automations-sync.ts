import { account } from "../core/automations/account.js";
import {
  applyOrcaSync,
  changeLine,
  createOrcaRunner,
  plannedResult,
  prepareOrcaSync,
} from "../core/automations/orca.js";
import type { OrcaSyncResult } from "../core/automations/orca.js";
import { badBranch, missingAccount, needsFormatTwo, noTrunk } from "../core/automations/problems.js";
import { defaultTrunk, isBranchName } from "../core/automations/stub.js";
import { findFactory } from "../core/discovery.js";
import { loadFactory } from "../core/factory/index.js";
import { ExitCode } from "../errors.js";
import type { Problem } from "../errors.js";
import type { CommandResult } from "../output.js";
import { normalizeProblemPath } from "../util/fs.js";
import type { CommandContext, CommandDefinition } from "./types.js";

const COMMAND = "automations sync";

function failed(problems: readonly Problem[]): CommandResult {
  return { ok: false, command: COMMAND, exitCode: ExitCode.Failed, problems: [...problems] };
}

/** One line per change, then one per foreign entry, or the up-to-date line. */
function describe(result: OrcaSyncResult): string {
  const lines = result.applied.map(changeLine);
  for (const title of result.leftAlone) lines.push(`left alone: ${title}`);

  if (lines.length > 0) return lines.join("\n");
  return result.failure === undefined ? "Orca automations are up to date." : "";
}

function syncResult(result: OrcaSyncResult, json: boolean): CommandResult {
  const command: CommandResult = {
    ok: result.failure === undefined,
    command: COMMAND,
    exitCode: result.failure === undefined ? ExitCode.Ok : ExitCode.Failed,
    problems:
      result.failure === undefined
        ? []
        : [
            {
              level: "error",
              file: normalizeProblemPath("metafab"),
              message: result.failure.message,
              fix: result.failure.fix,
            },
          ],
    created: result.created,
    updated: result.updated,
    disabled: result.disabled,
    removed: result.removed,
    unchanged: result.unchanged,
    leftAlone: result.leftAlone,
  };

  const text = describe(result);
  if (!json && text !== "") command.summary = text;
  return command;
}

function targetProblem(value: string | undefined): Problem {
  return {
    level: "error",
    file: normalizeProblemPath("metafab"),
    message:
      value === undefined ? "automations sync requires a target" : `Unknown target "${value}"`,
    fix: "Run metafab automations sync orca",
  };
}

async function runSync(context: CommandContext): Promise<CommandResult> {
  const target = context.positionals[0];
  if (context.positionals.length !== 1 || target !== "orca") return failed([targetProblem(target)]);

  const location = await findFactory(context.cwd, { command: COMMAND });
  const factory = await loadFactory(location.root);
  if (factory.factoryYaml?.format !== 2) return failed([needsFormatTwo()]);

  const owner = await account("orca", factory.root);
  if (owner === undefined) return failed([missingAccount("orca")]);

  const branch = context.options.branch;
  if (typeof branch === "string" && !(await isBranchName(factory.root, branch))) {
    return failed([badBranch(branch)]);
  }
  const trunk = typeof branch === "string" ? branch : await defaultTrunk(factory.root);
  if (trunk === undefined) return failed([noTrunk()]);

  const agent = typeof context.options.agent === "string" ? context.options.agent : undefined;
  const run = createOrcaRunner();
  const plan = await prepareOrcaSync({ factory, account: owner, trunk, agent, run });
  const json = context.options.json === true;

  if (context.options["dry-run"] === true) return syncResult(plannedResult(plan), json);

  const applied = await applyOrcaSync(plan.changes, run);
  return syncResult({ ...applied, unchanged: plan.unchanged, leftAlone: plan.leftAlone }, json);
}

export const automationsSyncCommand: CommandDefinition = {
  name: COMMAND,
  description: "Make Orca's automations match the factory",
  usage: "metafab automations sync orca [--agent <id>] [--branch <trunk>] [--dry-run]",
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
    "dry-run": { type: "boolean", description: "Print the changes and make none" },
  },
  run: runSync,
};
