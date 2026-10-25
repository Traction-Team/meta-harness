import { ExitCode, MetafabError } from "../errors.js";
import { findFactory } from "../core/discovery.js";
import { renameSkill } from "../core/edit/index.js";
import { normalizeProblemPath } from "../util/fs.js";
import type { CommandResult } from "../output.js";
import type { CommandDefinition } from "./types.js";

function argumentError(message: string): MetafabError {
  return new MetafabError(message, {
    problems: [
      {
        level: "error",
        file: normalizeProblemPath("metafab"),
        message,
        fix: "Run metafab rename <old> <new>",
      },
    ],
  });
}

export const renameCommand: CommandDefinition = {
  name: "rename",
  description: "Rename a skill and update the pipeline",
  async run(context) {
    const names = context.positionals;
    if (names.length !== 2) {
      throw argumentError("rename requires an old name and a new name.");
    }

    const { root } = await findFactory(context.cwd);
    const result = await renameSkill(root, names[0]!, names[1]!);

    const runBuild = "Run metafab build to install the change.";
    const commandResult: CommandResult = {
      ok: true,
      command: "rename",
      exitCode: ExitCode.Ok,
      summary: `Renamed ${result.from} to ${result.to}\n${result.path}\n${runBuild}`,
      from: result.from,
      to: result.to,
      path: result.path,
      pipeline: result.pipeline,
    };
    if (result.warnings.length > 0) commandResult.problems = result.warnings;
    return commandResult;
  },
};
