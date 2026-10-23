import { notImplemented } from "./not-implemented.js";
import type { CommandDefinition } from "./types.js";

export const renameCommand: CommandDefinition = {
  name: "rename",
  description: "Rename a skill and update the pipeline",
  async run() {
    return notImplemented("rename");
  },
};
