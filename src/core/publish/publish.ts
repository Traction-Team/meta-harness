import { ExitCode, MetafabError } from "../../errors.js";
import type { PublishConfig } from "../config/types.js";
import { gitVersionState, publishGitFab } from "./git-target.js";
import { npmVersionState, publishNpmFab } from "./npm-target.js";
import type {
  PreparedFab,
  PublishOptions,
  PublishResult,
  PublishTargetName,
  PublishTargetResult,
} from "./types.js";

/**
 * Publish order. Git goes first because its push is atomic and its preflight is
 * the strongest, so a half-published release can be finished by a re-run that
 * skips the target already carrying these bytes (plan 1.011, open question 1).
 */
const PUBLISH_ORDER: PublishTargetName[] = ["git", "npm"];

function versionConflict(target: PublishTargetName, version: string): MetafabError {
  const label = target === "npm" ? "npm" : "Git fab repository";
  return new MetafabError(`Version ${version} is already published to ${label} with different content.`, {
    exitCode: ExitCode.Failed,
    code: "publish-version-exists",
    problems: [
      {
        level: "error",
        file: ".factory/metafab.yaml",
        message: `The ${label} already has ${version} with different content.`,
        fix: "Bump publish.version; a published version cannot change",
      },
    ],
  });
}

function skippedDetail(target: PublishTargetName, version: string): string {
  return target === "npm"
    ? `${version} is already on npm with identical content.`
    : `v${version} is already in the fab repository with identical content.`;
}

function failureDetail(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") return error.message.trim();
  return String(error);
}

/**
 * Publishes one prepared fab to every configured target.
 *
 * The version preflight runs for every target before anything is published: a
 * version that exists with different content refuses the whole publish, while a
 * version that exists with identical content is skipped. A target failure is
 * reported in its result and the remaining targets are not attempted.
 */
export async function publishFab(
  prepared: PreparedFab,
  publish: PublishConfig,
  options: PublishOptions = {},
): Promise<PublishResult> {
  const version = publish.version;
  if (version === undefined) {
    throw new MetafabError('"publish.version" is required.', {
      exitCode: ExitCode.Failed,
      code: "publish-missing-setting",
    });
  }

  const context: PublishOptions = {
    ...options,
    interactive:
      options.interactive ?? (process.stdin.isTTY === true && options.json !== true),
  };
  const targets = PUBLISH_ORDER.filter((target) => prepared.targets.includes(target));

  const existing = new Map<PublishTargetName, "new" | "identical">();
  for (const target of targets) {
    if (target === "git") {
      const state = await gitVersionState(publish, version, prepared.root, context);
      if (state.tagExists && !state.identical) throw versionConflict("git", version);
      existing.set(target, state.tagExists ? "identical" : "new");
    } else {
      const state = await npmVersionState(publish, version, prepared.root, context);
      if (state.exists && !state.identical) throw versionConflict("npm", version);
      existing.set(target, state.exists ? "identical" : "new");
    }
  }

  const results = new Map<PublishTargetName, PublishTargetResult>();
  let failed: PublishTargetName | undefined;

  for (const target of targets) {
    if (existing.get(target) === "identical") {
      results.set(target, { target, status: "skipped", detail: skippedDetail(target, version) });
      continue;
    }
    if (failed !== undefined) {
      results.set(target, {
        target,
        status: "skipped",
        detail: `Not attempted: the ${failed} target failed.`,
      });
      continue;
    }

    try {
      const detail =
        target === "git"
          ? await publishGitFab(publish, version, prepared.root, context)
          : await publishNpmFab(publish, version, prepared.root, context);
      results.set(target, { target, status: "published", detail });
    } catch (error) {
      // Head protection is a refusal the command must report with its own exit
      // code, and it happens before this target changes anything.
      if (error instanceof MetafabError && error.exitCode === ExitCode.NotOwned) throw error;
      results.set(target, { target, status: "failed", detail: failureDetail(error) });
      failed = target;
    }
  }

  return {
    version,
    targets: prepared.targets.map(
      (target) => results.get(target) as PublishTargetResult,
    ),
  };
}
