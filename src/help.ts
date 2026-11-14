import type {
  CommandArgument,
  CommandDefinition,
  CommandOptionDefinition,
  CommandOptions,
} from "./commands/types.js";

/**
 * The flags `main` adds to every command's `parseArgs` options. They are also the
 * last lines of every command's help, so the parser and the help cannot drift.
 */
export const GLOBAL_OPTIONS: CommandOptions = {
  json: { type: "boolean", description: "Write one JSON object to stdout" },
  help: { type: "boolean", short: "h", description: "Show this help" },
};

export interface HelpArgument {
  name: string;
  description: string;
  optional: boolean;
}

export interface HelpOption {
  /** The flag as help prints it, such as `--force` or `-h, --help`. */
  flag: string;
  /** The placeholder an option that takes a value prints after its flag. */
  value?: string;
  description: string;
}

export interface CommandHelp {
  command: string;
  usage: string;
  description: string;
  arguments: HelpArgument[];
  options: HelpOption[];
}

/** A command as the global help and the group help list it. */
export interface CommandSummary {
  command: string;
  usage: string;
  description: string;
}

export interface GroupHelp {
  command: string;
  subcommands: CommandSummary[];
}

function flagLabel(name: string, option: CommandOptionDefinition): string {
  const short = option.short === undefined ? "" : `-${option.short}, `;
  const value = option.value === undefined ? "" : ` ${option.value}`;
  return `${short}--${name}${value}`;
}

function helpOption(name: string, option: CommandOptionDefinition): HelpOption {
  return {
    flag: flagLabel(name, option),
    ...(option.value === undefined ? {} : { value: option.value }),
    description: option.description,
  };
}

function helpArgument(argument: CommandArgument): HelpArgument {
  return {
    name: argument.name,
    description: argument.description,
    optional: argument.optional === true,
  };
}

function summary(definition: CommandDefinition): CommandSummary {
  return { command: definition.name, usage: definition.usage, description: definition.description };
}

/** The help of one command: its own options, then `--json` and `-h, --help`. */
export function commandHelp(definition: CommandDefinition): CommandHelp {
  return {
    command: definition.name,
    usage: definition.usage,
    description: definition.description,
    arguments: (definition.arguments ?? []).map(helpArgument),
    options: [
      ...Object.entries(definition.options ?? {}).map(([name, option]) => helpOption(name, option)),
      ...Object.entries(GLOBAL_OPTIONS).map(([name, option]) => helpOption(name, option)),
    ],
  };
}

function padTo(labels: readonly string[]): number {
  return labels.length === 0 ? 0 : Math.max(...labels.map((label) => label.length)) + 2;
}

export function renderCommandHelp(help: CommandHelp): string {
  const argumentsText = help.arguments.map((argument) => `<${argument.name}>`);
  const width = padTo([...argumentsText, ...help.options.map((option) => option.flag)]);
  const lines = [`Usage: ${help.usage}`, "", help.description];

  if (help.arguments.length > 0) {
    lines.push("", "Arguments:");
    help.arguments.forEach((argument, index) => {
      lines.push(`  ${argumentsText[index]!.padEnd(width)}${argument.description}`);
    });
  }

  lines.push("", "Options:");
  for (const option of help.options) lines.push(`  ${option.flag.padEnd(width)}${option.description}`);

  return lines.join("\n");
}

/** The commands whose name starts with `<group> `, in definition order. */
export function groupHelp(group: string, definitions: readonly CommandDefinition[]): GroupHelp {
  return {
    command: group,
    subcommands: definitions
      .filter((definition) => definition.name.startsWith(`${group} `))
      .map(summary),
  };
}

export function renderGroupHelp(help: GroupHelp): string {
  const width = padTo(help.subcommands.map((subcommand) => subcommand.usage));
  return [
    `Usage: metafab ${help.command} <subcommand>`,
    "",
    "Subcommands:",
    ...help.subcommands.map(
      (subcommand) => `  ${subcommand.usage.padEnd(width)}${subcommand.description}`,
    ),
    "",
    `Run metafab ${help.command} <subcommand> --help for its options.`,
  ].join("\n");
}

/** The command list `metafab --help` prints, with the same text and data. */
export function globalHelp(commands: readonly CommandDefinition[]): {
  text: string;
  commands: CommandSummary[];
} {
  const width = Math.max(...commands.map((command) => command.name.length)) + 2;
  const labels = [
    ...Object.entries(GLOBAL_OPTIONS).map(([name, option]) => helpOption(name, option)),
    { flag: "--version", description: "Show the metafab version" },
  ];
  const optionWidth = Math.max(...labels.map((option) => option.flag.length)) + 1;

  return {
    text: [
      "metafab <command> [options]",
      "",
      "Commands:",
      ...commands.map((command) => `  ${command.name.padEnd(width)}${command.description}`),
      "",
      "Options:",
      ...labels.map((option) => `  ${option.flag.padEnd(optionWidth)}${option.description}`),
    ].join("\n"),
    commands: commands.map(summary),
  };
}
