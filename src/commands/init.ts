import { notImplemented } from "./not-implemented.js";
import type { CommandDefinition } from "./types.js";

export const initCommand: CommandDefinition = {
  name: "init",
  description: "Create missing factory files and build the factory",
  options: {
    agents: { type: "string" },
  },
  async run() {
    return notImplemented("init");
  },
};
