import { notImplemented } from "./not-implemented.js";
import type { CommandDefinition } from "./types.js";

export const createCommand: CommandDefinition = {
  name: "create",
  description: "Create a skill in the factory",
  options: {
    description: { type: "string" },
  },
  async run() {
    return notImplemented("create");
  },
};
