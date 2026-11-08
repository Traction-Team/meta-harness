import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { loadConfig } from "../config/load.js";
import { CONFIG_FILE } from "../config/parse.js";
import type { Config, UpstreamEntry } from "../config/types.js";
import { removeUpstream } from "../config/writers.js";

export interface DetachOptions {
  /** Repository root that contains `.factory/`. */
  root: string;
}

export interface DetachReport {
  root: string;
  /** False when the configuration had no upstream in the first place. */
  detached: boolean;
  /** The upstream that was removed. */
  upstream?: UpstreamEntry;
}

function configInvalid(problems: Problem[]): MetafabError {
  return new MetafabError("The factory configuration has problems.", {
    exitCode: ExitCode.Failed,
    code: "config-invalid",
    problems,
  });
}

/**
 * Removes the `upstream` key from `.factory/metafab.yaml`.
 *
 * Only the configuration changes: every factory file stays exactly as it is,
 * so a detached factory keeps the content it last received.
 */
export async function runDetach(options: DetachOptions): Promise<DetachReport> {
  const root = path.resolve(options.root);
  const factoryDir = path.join(root, ".factory");
  const config: Config = await loadConfig(factoryDir);

  const configErrors = config.problems.filter((problem) => problem.level === "error");
  if (configErrors.length > 0) throw configInvalid(configErrors);

  const previous = config.upstream;
  if (previous === undefined) return { root, detached: false };

  await removeUpstream(factoryDir);
  return { root, detached: true, upstream: previous };
}

/** Human-readable report for `detach`. */
export function describeDetach(report: DetachReport): string {
  if (!report.detached) return "No upstream to detach.";
  return `Removed the upstream from ${CONFIG_FILE}.`;
}
