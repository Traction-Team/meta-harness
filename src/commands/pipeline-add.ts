import { ExitCode, MetafabError } from "../errors.js";
import { findFactory } from "../core/discovery.js";
import { addWorkflow } from "../core/edit/index.js";
import { normalizeProblemPath } from "../util/fs.js";
import type { CommandResult } from "../output.js";
import type { CommandDefinition } from "./types.js";

const runBuild = "Run metafab build to install the change.";

function argumentError(message: string): MetafabError {
  return new MetafabError(message, {
    problems: [
      {
        level: "error",
        file: normalizeProblemPath("metafab"),
        message,
        fix: "Run metafab pipeline add <workflow> [--after <workflow>] [--stop <text>]",
      },
    ],
  });
}

function stringOption(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export const pipelineAddCommand: CommandDefinition = {
  name: "pipeline add",
  description: "Add a workflow to the pipeline",
  usage: "metafab pipeline add <workflow> [--after <workflow>] [--stop <text>]",
  arguments: [{ name: "workflow", description: "An existing workflow" }],
  options: {
    after: {
      type: "string",
      value: "<workflow>",
      description: "Insert after this workflow instead of at the end",
    },
    stop: {
      type: "string",
      value: "<text>",
      description: "Who must act, and on what, before the next workflow starts",
    },
  },
  async run(context) {
    if (context.positionals.length !== 1) {
      throw argumentError("pipeline add requires one workflow name.");
    }

    const workflow = context.positionals[0]!;
    const after = stringOption(context.options.after);
    const stop = stringOption(context.options.stop);
    const { root } = await findFactory(context.cwd, { command: "pipeline add" });
    const result = await addWorkflow(root, workflow, {
      ...(after === undefined ? {} : { after }),
      ...(stop === undefined ? {} : { stop }),
    });

    const commandResult: CommandResult = {
      ok: true,
      command: "pipeline add",
      exitCode: ExitCode.Ok,
      problems: [],
      summary: `Added ${workflow} to the pipeline.\n.factory/factory.yaml\n${runBuild}`,
      path: ".factory/factory.yaml",
      workflow,
      pipeline: result.pipeline,
      created: result.created,
    };
    if (result.after !== undefined) commandResult.after = result.after;
    if (result.stop !== undefined) commandResult.stop = result.stop;
    return commandResult;
  },
};
