import type { CommandResult } from "../output.js";

export type CommandOptionValue = string | boolean | (string | boolean)[];

export interface CommandOptionDefinition {
  type: "string" | "boolean";
  short?: string;
  multiple?: boolean;
  /** One line for --help. */
  description: string;
  /** Placeholder for a string option, such as "<list>". */
  value?: string;
}

export interface CommandArgument {
  name: string;
  description: string;
  optional?: boolean;
}

export type CommandOptions = Readonly<Record<string, CommandOptionDefinition>>;

export interface CommandIO {
  tty: boolean;
  stdin?: NodeJS.ReadableStream;
  stderr?: (text: string) => void;
}

export interface CommandContext {
  /** Directory the command runs in; the resolved process cwd by default. */
  cwd: string;
  /** Arguments after the command name that are not options. */
  positionals: readonly string[];
  /**
   * Options declared by the command, plus the global `json` and `help` flags, parsed with
   * `node:util` `parseArgs`.
   */
  options: Readonly<Record<string, CommandOptionValue | undefined>>;
  /** Injected input and output; production uses the process streams. */
  io: CommandIO;
}

export interface CommandDefinition {
  name: string;
  description: string;
  /** The usage line, identical to the command's cell in docs/specs/cli.md. */
  usage: string;
  arguments?: readonly CommandArgument[];
  /** Options this command accepts after its name. Global flags are handled by cli.ts. */
  options?: CommandOptions;
  run(context: CommandContext): Promise<CommandResult>;
}
