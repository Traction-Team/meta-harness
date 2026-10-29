import { resolveNewFactoryRoot } from "../core/discovery.js";
import { describeInit, runInit } from "../core/init/index.js";
import { ExitCode } from "../errors.js";
import type { CommandResult } from "../output.js";
import type { CommandDefinition } from "./types.js";

export const initCommand: CommandDefinition = {
  name: "init",
  description: "Create missing factory files and build the factory",
  options: {
    agents: { type: "string" },
    adopt: { type: "boolean" },
  },
  async run(context) {
    const root = await resolveNewFactoryRoot(context.cwd);
    const report = await runInit({
      root,
      ...(typeof context.options.agents === "string" ? { agents: context.options.agents } : {}),
      adopt: context.options.adopt === true,
      io: context.io,
    });

    const result: CommandResult = {
      ok: true,
      command: "init",
      exitCode: ExitCode.Ok,
      created: report.created,
      updated: report.updated,
      gitattributes: report.gitattributes,
      moved: report.moved,
      changed: report.changed,
      problems: report.problems,
    };

    if (context.options.json !== true) result.summary = describeInit(report);
    return result;
  },
};
