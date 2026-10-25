import { ExitCode, MetafabError } from "../errors.js";
import { findFactory } from "../core/discovery.js";
import { planCreate, validateDescription, writeCreatedSkill } from "../core/edit/index.js";
import { ask } from "../input.js";
import { normalizeProblemPath } from "../util/fs.js";
import type { CommandResult } from "../output.js";
import type { CommandDefinition } from "./types.js";

const DESCRIPTION = {
  name: "description",
  flag: "--description",
  description: "Skill description",
};

function argumentError(command: string, message: string): MetafabError {
  return new MetafabError(message, {
    problems: [
      {
        level: "error",
        file: normalizeProblemPath("metafab"),
        message,
        fix: `Run metafab ${command} <path> [--description <text>]`,
      },
    ],
  });
}

function descriptionOption(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export const createCommand: CommandDefinition = {
  name: "create",
  description: "Create a skill in the factory",
  options: {
    description: { type: "string" },
  },
  async run(context) {
    const input = context.positionals;
    if (input.length !== 1) {
      throw argumentError("create", "create requires one path, such as workflows/review-slice.");
    }

    const { root } = await findFactory(context.cwd);
    const plan = await planCreate(root, input[0]!);
    const given = descriptionOption(context.options.description);
    const description = validateDescription(given ?? (await ask(DESCRIPTION, context.io)));
    await writeCreatedSkill(plan, description);

    const file = `.factory/${plan.relDir}/SKILL.md`;
    const result: CommandResult = {
      ok: true,
      command: "create",
      exitCode: ExitCode.Ok,
      summary: `Created ${file}\nRun metafab build to install the change.`,
      path: file,
      name: plan.name,
      description,
    };
    return result;
  },
};
