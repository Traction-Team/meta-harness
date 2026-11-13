import type { HookChange } from "./sync.js";

export * from "./script.js";
export * from "./sync.js";

const ACTION_MARK = {
  created: "+",
  updated: "~",
  removed: "-",
} as const;

/**
 * The `+ git hook <name>`, `~ git hook <name>` or `- git hook <name>` line for
 * each hook a build created, updated or removed.
 */
export function hookChangeLines(hooks: readonly HookChange[]): string[] {
  return hooks.map((change) => `${ACTION_MARK[change.action]} git hook ${change.hook}`);
}
