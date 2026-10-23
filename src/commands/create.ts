import { notImplemented } from "./not-implemented.js";
import type { CommandDefinition } from "./types.js";

export const createCommand: CommandDefinition = {
  name: "create",
  description: "Create a skill in the factory",
  async run() {
    return notImplemented("create");
  },
};
