import { resolveNewFactoryRoot } from "../core/discovery.js";
import { describeInit, runInit } from "../core/init/index.js";
import { ExitCode, MetafabError } from "../errors.js";
import type { CommandResult } from "../output.js";
import { normalizeProblemPath } from "../util/fs.js";
import type { CommandDefinition } from "./types.js";

function bothHookFlags(): MetafabError {
  const message = "Pass --git-hooks or --no-git-hooks, not both";
  return new MetafabError(message, {
    exitCode: ExitCode.Failed,
    code: "usage-error",
    problems: [
      {
        level: "error",
        file: normalizeProblemPath("metafab"),
        message,
        fix: "Run metafab init [--git-hooks | --no-git-hooks]",
      },
    ],
  });
}

export const initCommand: CommandDefinition = {
  name: "init",
  description: "Create missing factory files and build the factory",
  usage: "metafab init [--agents <list>] [--adopt] [--git-hooks | --no-git-hooks]",
  options: {
    agents: {
      type: "string",
      value: "<list>",
      description: "Agent tools to install for: targets separated by commas, or all",
    },
    adopt: {
      type: "boolean",
      description: "Move existing repository skills into .factory/skills/ without asking",
    },
    "git-hooks": {
      type: "boolean",
      description: "Run metafab build after checkout, merge and rebase",
    },
    "no-git-hooks": {
      type: "boolean",
      description: "Leave Git hooks off without asking",
    },
  },
  async run(context) {
    const gitHooks = context.options["git-hooks"] === true;
    const noGitHooks = context.options["no-git-hooks"] === true;
    if (gitHooks && noGitHooks) throw bothHookFlags();

    const hookFlag: boolean | undefined = gitHooks ? true : noGitHooks ? false : undefined;

    const root = await resolveNewFactoryRoot(context.cwd, { command: "init" });
    const report = await runInit({
      root,
      ...(typeof context.options.agents === "string" ? { agents: context.options.agents } : {}),
      adopt: context.options.adopt === true,
      ...(hookFlag === undefined ? {} : { gitHooks: hookFlag }),
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
      hooks: report.hooks,
      problems: report.problems,
      declined: report.declined,
      notes: report.notes,
      suggestions: report.suggestions,
    };

    if (context.options.json !== true) result.summary = describeInit(report);
    return result;
  },
};
