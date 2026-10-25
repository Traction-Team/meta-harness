import { ExitCode, MetafabError } from "../errors.js";
import { findFactory } from "../core/discovery.js";
import { mapFactory, mapSummary } from "../core/edit/index.js";
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
        fix: "Run metafab map",
      },
    ],
  });
}

export const mapCommand: CommandDefinition = {
  name: "map",
  description: "Show the pipeline, workflows, and skills",
  async run(context) {
    if (context.positionals.length !== 0) {
      throw argumentError("map takes no arguments.");
    }

    const { root } = await findFactory(context.cwd);
    const data = await mapFactory(root);
    const errors = data.problems.filter((problem) => problem.level === "error");

    const result: CommandResult = {
      ok: errors.length === 0,
      command: "map",
      exitCode: errors.length === 0 ? ExitCode.Ok : ExitCode.Failed,
      factory: data.factory,
      pipeline: data.pipeline,
      standaloneWorkflows: data.standaloneWorkflows,
      skills: data.skills,
      summary: mapSummary(data),
    };
    if (data.problems.length > 0) result.problems = data.problems;
    return result;
  },
};
