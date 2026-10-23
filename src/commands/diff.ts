import { notImplemented } from "./not-implemented.js";
import type { CommandDefinition } from "./types.js";

export const diffCommand: CommandDefinition = {
  name: "diff",
  description: "Show local edits since the upstream version",
  async run() {
    return notImplemented("diff");
  },
};
