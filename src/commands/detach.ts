import { notImplemented } from "./not-implemented.js";
import type { CommandDefinition } from "./types.js";

export const detachCommand: CommandDefinition = {
  name: "detach",
  description: "Remove upstream metadata without changing factory files",
  async run() {
    return notImplemented("detach");
  },
};
