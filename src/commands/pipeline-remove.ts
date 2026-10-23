import { notImplemented } from "./not-implemented.js";
import type { CommandDefinition } from "./types.js";

export const pipelineRemoveCommand: CommandDefinition = {
  name: "pipeline remove",
  description: "Remove a workflow from the pipeline",
  async run() {
    return notImplemented("pipeline remove");
  },
};
