import { notImplemented } from "./not-implemented.js";
import type { CommandDefinition } from "./types.js";

export const mapCommand: CommandDefinition = {
  name: "map",
  description: "Show the pipeline, workflows, and skills",
  async run() {
    return notImplemented("map");
  },
};
