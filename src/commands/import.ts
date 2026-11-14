import { describeImport, runImport } from "../core/import/index.js";
import { resolveNewFactoryRoot } from "../core/discovery.js";
import { ExitCode, MetafabError } from "../errors.js";
import type { CommandResult } from "../output.js";
import { normalizeProblemPath } from "../util/fs.js";
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

function bothSetupFlags(): MetafabError {
  const message = "Pass --setup or --no-setup, not both";
  return new MetafabError(message, {
    exitCode: ExitCode.Failed,
    code: "usage-error",
    problems: [
      {
        level: "error",
        file: normalizeProblemPath("metafab"),
        message,
        fix: "Run metafab import <source> [--setup | --no-setup]",
      },
    ],
  });
}

export const importCommand: CommandDefinition = {
  name: "import",
  description: "Import a fab as the factory upstream",
  usage: "metafab import <source> [--agents <list>] [--force] [--adopt] [--setup | --no-setup]",
  arguments: [
    {
      name: "source",
      description:
        "The fab: an npm package, a Git repository, an HTTPS tarball or a local path",
    },
  ],
  options: {
    agents: {
      type: "string",
      value: "<list>",
      description: "Agent tools to install for, when import creates metafab.yaml",
    },
    force: { type: "boolean", description: "Replace local factory files that differ from the fab" },
    adopt: {
      type: "boolean",
      description: "Move existing repository skills into .factory/skills/ without asking",
    },
    setup: {
      type: "boolean",
      description: "Create the missing required repository files from the fab's templates",
    },
    "no-setup": {
      type: "boolean",
      description: "Leave the missing required repository files uncreated",
    },
  },
  async run(context) {
    const source = context.positionals[0];
    if (source === undefined || source.trim() === "") throw missingSource();

    const setup = context.options.setup === true;
    const noSetup = context.options["no-setup"] === true;
    if (setup && noSetup) throw bothSetupFlags();

    const root = await resolveNewFactoryRoot(context.cwd, { command: "import" });
    const report = await runImport({
      root,
      source,
      cwd: context.cwd,
      ...(typeof context.options.agents === "string" ? { agents: context.options.agents } : {}),
      force: context.options.force === true,
      adopt: context.options.adopt === true,
      ...(setup ? { setup: true } : noSetup ? { setup: false } : {}),
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
      requires: report.requires,
      copied: report.copied,
      changed: report.changed,
      hooks: report.hooks,
      problems: report.problems,
      declined: report.declined,
      review: report.review,
    };

    if (context.options.json !== true) result.summary = describeImport(report);
    return result;
  },
};
