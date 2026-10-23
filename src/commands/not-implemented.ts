import { ExitCode } from "../errors.js";
import type { CommandResult } from "../output.js";
import { normalizeProblemPath } from "../util/fs.js";

export function notImplemented(command: string): CommandResult {
  return {
    ok: false,
    command,
    exitCode: ExitCode.Failed,
    summary: `${command} is not implemented yet.`,
    problems: [
      {
        level: "error",
        file: normalizeProblemPath(".factory"),
        message: `The ${command} command is not implemented yet.`,
        fix: "This command arrives in a later release.",
      },
    ],
  };
}
