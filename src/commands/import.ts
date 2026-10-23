import { notImplemented } from "./not-implemented.js";
import type { CommandDefinition } from "./types.js";

export const importCommand: CommandDefinition = {
  name: "import",
  description: "Import a fab as the factory upstream",
  options: {
    agents: { type: "string" },
    force: { type: "boolean" },
  },
  async run() {
    return notImplemented("import");
  },
};
