import type { CommandResult } from "../output.js";

export interface CommandContext {
  cwd: string;
  tty: boolean;
}

export interface CommandDefinition {
  name: string;
  description: string;
  run(context: CommandContext): Promise<CommandResult>;
}
