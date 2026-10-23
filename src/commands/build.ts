import { notImplemented } from "./not-implemented.js";
import type { CommandDefinition } from "./types.js";

export const buildCommand: CommandDefinition = {
  name: "build",
  description: "Compile the factory for the configured agent tools",
  async run() {
    return notImplemented("build");
  },
};
