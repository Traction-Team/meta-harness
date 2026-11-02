import { describeDiff, jsonFile, runDiff } from "../core/update/index.js";
import { findFactory } from "../core/discovery.js";
import { ExitCode } from "../errors.js";
import type { CommandResult } from "../output.js";
import type { CommandDefinition } from "./types.js";

export const diffCommand: CommandDefinition = {
  name: "diff",
  description: "Show local edits since the upstream version",
  async run(context) {
    const location = await findFactory(context.cwd);
    const report = await runDiff({
      root: location.root,
      ...(context.positionals[0] === undefined ? {} : { path: context.positionals[0] }),
      // A terminal may answer a Git credential prompt; JSON output never waits.
      interactive: context.io.tty === true && context.options.json !== true,
    });

    const result: CommandResult = {
      ok: true,
      command: "diff",
      exitCode: ExitCode.Ok,
      files: report.files.map(jsonFile),
      problems: [],
    };

    if (context.options.json !== true) result.summary = describeDiff(report);
    return result;
  },
};
