import { describeDetach, runDetach } from "../core/update/index.js";
import { findFactory } from "../core/discovery.js";
import { ExitCode } from "../errors.js";
import type { CommandResult } from "../output.js";
import type { CommandDefinition } from "./types.js";

export const detachCommand: CommandDefinition = {
  name: "detach",
  description: "Remove upstream metadata without changing factory files",
  usage: "metafab detach",
  async run(context) {
    const location = await findFactory(context.cwd, { command: "detach" });
    const report = await runDetach({ root: location.root });

    const result: CommandResult = {
      ok: true,
      command: "detach",
      exitCode: ExitCode.Ok,
      detached: report.detached,
      ...(report.upstream === undefined ? {} : { upstream: report.upstream }),
      problems: [],
    };

    if (context.options.json !== true) result.summary = describeDetach(report);
    return result;
  },
};
