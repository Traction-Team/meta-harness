import { notImplemented } from "./not-implemented.js";
import type { CommandDefinition } from "./types.js";

export const checkCommand: CommandDefinition = {
  name: "check",
  description: "Validate the factory and its installed output",
  async run() {
    return notImplemented("check");
  },
};
