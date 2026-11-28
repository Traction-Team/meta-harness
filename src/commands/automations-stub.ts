import {
  badBranch,
  missingAutomation,
  needsFormatTwo,
  noTrunk,
  unknownTarget,
} from "../core/automations/problems.js";
import { defaultTrunk, relativeFactoryDir, renderStub } from "../core/automations/stub.js";
import { TARGETS } from "../core/automations/types.js";
import type { Target } from "../core/automations/types.js";
import { findFactory } from "../core/discovery.js";
import { loadFactory } from "../core/factory/index.js";
import { ExitCode } from "../errors.js";
import type { Problem } from "../errors.js";
import { ask } from "../input.js";
import type { CommandResult } from "../output.js";
import { normalizeProblemPath } from "../util/fs.js";
import { runGit } from "../util/git.js";
import { cliVersion } from "../util/version.js";
import type { CommandContext, CommandDefinition } from "./types.js";

const COMMAND = "automations stub";

const TARGET = {
  name: "target",
  flag: "--target",
  description: "The harness to register the automation in",
  choices: [...TARGETS],
};

function failed(problems: readonly Problem[]): CommandResult {
  return {
    ok: false,
    command: COMMAND,
    exitCode: ExitCode.Failed,
    problems: [...problems],
  };
}

function targetOption(value: unknown): Target | undefined {
  if (typeof value !== "string") return undefined;
  return TARGETS.find((target) => target === value);
}

/** `git check-ref-format --branch` accepts the value. */
async function isBranchName(root: string, value: string): Promise<boolean> {
  try {
    const result = await runGit(["check-ref-format", "--branch", value], { cwd: root });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function runStub(context: CommandContext): Promise<CommandResult> {
  const name = context.positionals[0];
  if (context.positionals.length !== 1 || name === undefined) {
    const message = "automations stub requires one automation name.";
    return failed([
      {
        level: "error",
        file: normalizeProblemPath("metafab"),
        message,
        fix: "Run metafab automations stub <name> --target <orca|amp> [--branch <trunk>]",
      },
    ]);
  }

  const location = await findFactory(context.cwd, { command: COMMAND });
  const factory = await loadFactory(location.root);
  const yaml = factory.factoryYaml;
  if (yaml === undefined || yaml.format !== 2) return failed([needsFormatTwo()]);

  const automation = factory.automations?.list.find((entry) => entry.name === name);
  if (automation === undefined) return failed([missingAutomation(name)]);

  const targetValue = context.options.target;
  let target = targetOption(targetValue);
  if (targetValue !== undefined && target === undefined) {
    return failed([unknownTarget(typeof targetValue === "string" ? targetValue : "")]);
  }
  if (target === undefined) {
    const answer = await ask(TARGET, context.io);
    target = targetOption(answer);
    if (target === undefined) return failed([unknownTarget(answer)]);
  }

  const branchValue = context.options.branch;
  let trunk: string | undefined;
  if (typeof branchValue === "string") {
    if (!(await isBranchName(factory.root, branchValue))) return failed([badBranch(branchValue)]);
    trunk = branchValue;
  } else {
    trunk = await defaultTrunk(factory.root);
  }
  if (trunk === undefined) return failed([noTrunk()]);

  const text = renderStub({
    factoryName: yaml.name,
    automation,
    target,
    trunk,
    factoryRelDir: await relativeFactoryDir(factory.root),
    cliVersion: cliVersion(),
  });

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

export const automationsStubCommand: CommandDefinition = {
  name: COMMAND,
  description: "Print the text a target registers for an automation",
  usage: "metafab automations stub <name> --target <orca|amp> [--branch <trunk>]",
  arguments: [{ name: "name", description: "An automation in .factory/automations/" }],
  options: {
    target: {
      type: "string",
      value: "<target>",
      description: "The harness to register the automation in: orca or amp",
    },
    branch: {
      type: "string",
      value: "<trunk>",
      description: "The trunk a run switches to; the remote's default branch by default",
    },
  },
  run: runStub,
};
