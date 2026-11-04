import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * The version of the CLI that is running.
 *
 * `../../package.json` is the package root from both `src/util/` and
 * `dist/util/`, so the reported version is always the published one.
 */
export function cliVersion(): string {
  const pkg = require("../../package.json") as { version?: unknown };
  return typeof pkg.version === "string" ? pkg.version : "0.0.0";
}
