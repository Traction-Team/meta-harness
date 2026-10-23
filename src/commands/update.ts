import { notImplemented } from "./not-implemented.js";
import type { CommandDefinition } from "./types.js";

export const updateCommand: CommandDefinition = {
  name: "update",
  description: "Merge or overwrite from the factory upstream",
  async run() {
    return notImplemented("update");
  },
};
