import { notImplemented } from "./not-implemented.js";
import type { CommandDefinition } from "./types.js";

export const publishCommand: CommandDefinition = {
  name: "publish",
  description: "Package the factory and publish it",
  async run() {
    return notImplemented("publish");
  },
};
