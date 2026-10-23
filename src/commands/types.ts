import type { CommandResult } from "../output.js";

export type CommandOptionValue = string | boolean | (string | boolean)[];

export interface CommandOptionDefinition {
  type: "string" | "boolean";
  short?: string;
  multiple?: boolean;
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
  /** Options declared by the command, parsed with `node:util` `parseArgs`. */
  options: Readonly<Record<string, CommandOptionValue | undefined>>;
  /** Injected input and output; production uses the process streams. */
  io: CommandIO;
}

export interface CommandDefinition {
  name: string;
  description: string;
  /** Options this command accepts after its name. Global flags are handled by cli.ts. */
  options?: CommandOptions;
  run(context: CommandContext): Promise<CommandResult>;
}
