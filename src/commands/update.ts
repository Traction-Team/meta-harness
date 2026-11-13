import { describeUpdate, runUpdate } from "../core/update/index.js";
import { findFactory } from "../core/discovery.js";
import { ExitCode } from "../errors.js";
import type { CommandResult } from "../output.js";
import type { CommandDefinition } from "./types.js";

export const updateCommand: CommandDefinition = {
  name: "update",
  description: "Merge or overwrite from the factory upstream",
  usage: "metafab update [--to <version|range|ref>] [--dry-run] [--no-build]",
  options: {
    to: {
      type: "string",
      value: "<version|range|ref>",
      description: "Update to this version, range or Git ref and record it",
    },
    "dry-run": {
      type: "boolean",
      description: "Show what would change without writing",
    },
    "no-build": {
      type: "boolean",
      description: "Do not run metafab build afterwards",
    },
  },
  async run(context) {
    const location = await findFactory(context.cwd, { command: "update" });
    const report = await runUpdate({
      root: location.root,
      ...(typeof context.options.to === "string" ? { to: context.options.to } : {}),
      dryRun: context.options["dry-run"] === true,
      noBuild: context.options["no-build"] === true,
      // A terminal may answer a Git credential prompt; JSON output never waits.
      interactive: context.io.tty === true && context.options.json !== true,
    });

    const conflicts = report.conflicts.length > 0;
    const result: CommandResult = {
      ok: !conflicts,
      command: "update",
      exitCode: conflicts ? ExitCode.Failed : ExitCode.Ok,
      status: report.status,
      versioned: report.versioned,
      previous: report.previous,
      upstream: report.upstream,
      from: report.from,
      to: report.to,
      replaced: report.replaced,
      ...(report.requested === undefined ? {} : { requested: report.requested }),
      preserved: report.preserved,
      modeOnly: report.modeOnly,
      conflicts: report.conflicts,
      sideFiles: report.sideFiles,
      added: report.added,
      updated: report.updated,
      removed: report.removed,
      notes: report.notes,
      built: report.built,
      changed: report.changed,
      problems: report.problems,
      dryRun: context.options["dry-run"] === true,
      ...(report.review === undefined ? {} : { review: report.review }),
    };

    if (context.options.json !== true) result.summary = describeUpdate(report);
    return result;
  },
};
