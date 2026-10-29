import { ExitCode, MetafabError } from "../errors.js";
import { findFactory } from "../core/discovery.js";
import { removeWorkflow } from "../core/edit/index.js";
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
        fix: "Run metafab pipeline remove <workflow>",
      },
    ],
  });
}

export const pipelineRemoveCommand: CommandDefinition = {
  name: "pipeline remove",
  description: "Remove a workflow from the pipeline",
  async run(context) {
    if (context.positionals.length !== 1) {
      throw argumentError("pipeline remove requires one workflow name.");
    }

    const workflow = context.positionals[0]!;
    const { root } = await findFactory(context.cwd);
    const result = await removeWorkflow(root, workflow);

    const commandResult: CommandResult = {
      ok: true,
      command: "pipeline remove",
      exitCode: ExitCode.Ok,
      summary: `Removed ${workflow} from the pipeline.\n.factory/factory.yaml\n${runBuild}`,
      path: ".factory/factory.yaml",
      workflow,
      pipeline: result.pipeline,
    };
    return commandResult;
  },
};
