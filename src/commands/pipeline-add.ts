import { notImplemented } from "./not-implemented.js";
import type { CommandDefinition } from "./types.js";

export const pipelineAddCommand: CommandDefinition = {
  name: "pipeline add",
  description: "Add a workflow to the pipeline",
  options: {
    after: { type: "string" },
    stop: { type: "string" },
  },
  async run() {
    return notImplemented("pipeline add");
  },
};
