import { main } from "../../src/cli.js";
import type { CommandDefinition } from "../../src/commands/types.js";

export interface RunCliOptions {
  cwd?: string;
  tty?: boolean;
  commands?: readonly CommandDefinition[];
}

export interface RunCliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export async function runCli(argv: readonly string[], options: RunCliOptions = {}): Promise<RunCliResult> {
  let stdout = "";
  let stderr = "";

  const code = await main(
    argv,
    {
      cwd: options.cwd ?? process.cwd(),
      tty: options.tty ?? false,
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
      },
    },
    options.commands,
  );

  return { stdout, stderr, code };
}
