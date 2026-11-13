import { ExitCode, MetafabError } from "../errors.js";
import { findFactory } from "../core/discovery.js";
import { planCreate, validateDescription, writeCreatedSkill } from "../core/edit/index.js";
import { ask } from "../input.js";
import { normalizeProblemPath } from "../util/fs.js";
import type { CommandResult } from "../output.js";
import type { CommandContext, CommandDefinition } from "./types.js";

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

const DESCRIPTION_ATTEMPTS = 3;

async function askDescription(context: CommandContext): Promise<string> {
  let answer = "";

  for (let attempt = 0; attempt < DESCRIPTION_ATTEMPTS; attempt += 1) {
    answer = await ask(DESCRIPTION, context.io);
    if (answer.trim() !== "") return answer;
    context.io.stderr?.("A description is required.\n");
  }

  return answer;
}

export const createCommand: CommandDefinition = {
  name: "create",
  description: "Create a skill in the factory",
  usage: "metafab create <path> [--description <text>]",
  arguments: [
    { name: "path", description: "Where the skill goes in .factory/, such as workflows/review-slice" },
  ],
  options: {
    description: {
      type: "string",
      value: "<text>",
      description: "The skill's description; asked for in a terminal when absent",
    },
  },
  async run(context) {
    const input = context.positionals;
    if (input.length !== 1) {
      throw argumentError("create", "create requires one path, such as workflows/review-slice.");
    }

    const { root } = await findFactory(context.cwd, { command: "create" });
    const plan = await planCreate(root, input[0]!);
    const given = descriptionOption(context.options.description);
    const description = validateDescription(given ?? (await askDescription(context)));
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
