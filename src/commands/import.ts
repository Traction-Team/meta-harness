import { describeImport, runImport } from "../core/import/index.js";
import { resolveNewFactoryRoot } from "../core/discovery.js";
import { ExitCode, MetafabError } from "../errors.js";
import type { CommandResult } from "../output.js";
import type { CommandDefinition } from "./types.js";

function missingSource(): MetafabError {
  return new MetafabError("The import command requires a source.", {
    exitCode: ExitCode.Failed,
    code: "missing-source",
    problems: [
      {
        level: "error",
        file: "metafab",
        message: "The import command requires a source.",
        fix: "Run metafab import <source>",
      },
    ],
  });
}

export const importCommand: CommandDefinition = {
  name: "import",
  description: "Import a fab as the factory upstream",
  options: {
    agents: { type: "string" },
    force: { type: "boolean" },
    adopt: { type: "boolean" },
  },
  async run(context) {
    const source = context.positionals[0];
    if (source === undefined || source.trim() === "") throw missingSource();

    const root = await resolveNewFactoryRoot(context.cwd, { command: "import" });
    const report = await runImport({
      root,
      source,
      cwd: context.cwd,
      ...(typeof context.options.agents === "string" ? { agents: context.options.agents } : {}),
      force: context.options.force === true,
      adopt: context.options.adopt === true,
      // A terminal may answer a Git credential prompt; JSON output never waits.
      interactive: context.io.tty === true && context.options.json !== true,
      io: context.io,
    });

    const result: CommandResult = {
      ok: true,
      command: "import",
      exitCode: ExitCode.Ok,
      upstream: report.upstream,
      created: report.created,
      updated: report.updated,
      gitattributes: report.gitattributes,
      moved: report.moved,
      copied: report.copied,
      changed: report.changed,
      problems: report.problems,
      declined: report.declined,
      review: report.review,
    };

    if (context.options.json !== true) result.summary = describeImport(report);
    return result;
  },
};
