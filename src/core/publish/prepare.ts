import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { ErrorProblem } from "../../errors.js";
import { listFiles } from "../../util/fs.js";
import { CONFIG_FILE } from "../config/parse.js";
import type { Config, PublishConfig } from "../config/types.js";
import type { Factory } from "../factory/index.js";
import { buildPackageJson } from "./package-json.js";
import { resolveReadme } from "./readme.js";
import { stageFab } from "./stage.js";
import type { PreparedFab, PublishTargetName } from "./types.js";

/**
 * The fix for a failed publish target, from the Sharing spec's publish steps:
 * fix the failure and run the command again, where a target that already
 * carries these bytes is skipped. It lives beside `publishProblem` rather than
 * in `publish.ts` so both targets import it without a cycle: `publish.ts`
 * imports the targets.
 */
export const PUBLISH_RETRY_FIX =
  "Fix the failure, then run metafab publish again; a target that already has this version is skipped";

/** A `publish` section that has a version and at least one target. */
export type ValidPublishConfig = PublishConfig & { version: string };

/** A problem about the `publish` section, whose file is the configuration the person edits. */
export function publishProblem(message: string, fix: string): ErrorProblem {
  return {
    level: "error",
    file: CONFIG_FILE,
    message,
    fix,
  };
}

/** The targets a `publish` section enables: `name` adds npm, `git` adds Git. */
export function publishTargets(publish: PublishConfig): PublishTargetName[] {
  const targets: PublishTargetName[] = [];
  if (publish.name !== undefined) targets.push("npm");
  if (publish.git !== undefined) targets.push("git");
  return targets;
}

async function fabFileSize(root: string, file: string): Promise<number> {
  return (await stat(path.join(root, ...file.split("/")))).size;
}

/**
 * The `publish` section a publish needs, or the problems to report instead.
 * The command checks it before it runs anything else, and `prepareFab` uses the
 * same function, so both report the same problems.
 */
export function requirePublishConfig(config: Config): ValidPublishConfig {
  const publish = config.publish;
  if (publish === undefined) {
    throw new MetafabError('"publish" is not configured.', {
      exitCode: ExitCode.Failed,
      code: "publish-not-configured",
      problems: [
        publishProblem(
          'The configuration has no "publish" section.',
          'Add a "publish" section with "version" and "name" or "git"',
        ),
      ],
    });
  }

  if (publishTargets(publish).length === 0) {
    throw new MetafabError('"publish" names no target.', {
      exitCode: ExitCode.Failed,
      code: "publish-no-target",
      problems: [
        publishProblem(
          '"publish" requires "name" or "git".',
          'Add "name" for npm or "git" for a fab repository',
        ),
      ],
    });
  }

  if (publish.version === undefined) {
    throw new MetafabError('"publish.version" is required.', {
      exitCode: ExitCode.Failed,
      code: "publish-missing-setting",
      problems: [publishProblem('"publish.version" is required.', 'Add "version" to "publish"')],
    });
  }

  return publish as ValidPublishConfig;
}

/**
 * Builds the complete fab in a temporary directory: the staged `.factory/`,
 * the README at the root and, for the npm target, `package.json`. It publishes
 * nothing, so `--dry-run` and the real run report from the same data.
 *
 * `files` and `size` describe what the npm package holds when npm is a target
 * (`package.json` included) and what the Git fab holds otherwise.
 */
export async function prepareFab(factory: Factory, config: Config): Promise<PreparedFab> {
  const publish = requirePublishConfig(config);
  const targets = publishTargets(publish);

  const staged = await stageFab(factory, { exclude: publish.exclude, targets });

  try {
    const readme = await resolveReadme(factory.root, factory, publish, staged.factory);
    await writeFile(path.join(staged.root, "README.md"), readme, "utf8");

    if (targets.includes("npm")) {
      const packageJson = `${JSON.stringify(buildPackageJson(factory, publish), null, 2)}\n`;
      await writeFile(path.join(staged.root, "package.json"), packageJson, "utf8");
    }

    const files = await listFiles(staged.root);
    let size = 0;
    for (const file of files) size += await fabFileSize(staged.root, file);

    return { ...staged, files, size, targets };
  } catch (error) {
    await staged.cleanup();
    throw error;
  }
}
