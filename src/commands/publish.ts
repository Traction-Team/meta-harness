import { runCheck } from "../core/check/index.js";
import { loadConfig } from "../core/config/load.js";
import { findFactory } from "../core/discovery.js";
import { loadFactory } from "../core/factory/index.js";
import { prepareFab, publishFab, requirePublishConfig } from "../core/publish/index.js";
import type {
  PublishOptions,
  PublishTargetResult,
  ValidPublishConfig,
} from "../core/publish/index.js";
import { stripSourceCredentials } from "../core/sources/index.js";
import { ExitCode, MetafabError } from "../errors.js";
import type { Problem } from "../errors.js";
import type { CommandResult } from "../output.js";
import { normalizeProblemPath } from "../util/fs.js";
import { cliVersion } from "../util/version.js";
import type { CommandDefinition } from "./types.js";

const DRY_RUN_DETAIL = "Dry run: nothing was published.";

function argumentError(message: string): MetafabError {
  return new MetafabError(message, {
    problems: [
      {
        level: "error",
        file: normalizeProblemPath("metafab"),
        message,
        fix: "Run metafab publish [--dry-run] [--tag <tag>]",
      },
    ],
  });
}

function failed(problems: readonly Problem[]): CommandResult {
  return {
    ok: false,
    command: "publish",
    exitCode: ExitCode.Failed,
    problems: [...problems],
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} kB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

function targetLabel(target: "npm" | "git", publish: ValidPublishConfig): string {
  if (target === "npm") return `npm (${publish.name ?? "name missing"})`;
  return `git (${stripSourceCredentials(publish.git ?? "url missing")})`;
}

/** The dry-run and publish report: files, total size and every target. */
function summary(
  version: string,
  files: readonly string[],
  size: number,
  targets: readonly PublishTargetResult[],
  publish: ValidPublishConfig,
): string {
  const lines = [
    `Fab ${version} for ${targets.map((target) => targetLabel(target.target, publish)).join(", ")}`,
    "Files:",
    ...files.map((file) => `  ${file}`),
    `${files.length} file${files.length === 1 ? "" : "s"}, ${formatSize(size)}`,
  ];

  for (const target of targets) {
    lines.push(`${target.target}: ${target.status} — ${target.detail}`);
  }

  return lines.join("\n");
}

export const publishCommand: CommandDefinition = {
  name: "publish",
  description: "Package the factory and publish it",
  options: {
    "dry-run": { type: "boolean" },
    tag: { type: "string" },
  },
  async run(context) {
    if (context.positionals.length !== 0) {
      throw argumentError("publish takes no arguments.");
    }

    const location = await findFactory(context.cwd);
    const factory = await loadFactory(location.root);
    const config = await loadConfig(factory.dir);

    if (config.problems.some((problem) => problem.level === "error")) {
      return failed(config.problems);
    }

    let publish: ValidPublishConfig;
    try {
      publish = requirePublishConfig(config);
    } catch (error) {
      if (error instanceof MetafabError) return failed(error.problems ?? []);
      throw error;
    }

    const checked = await runCheck(location.root, cliVersion());
    if (checked.some((problem) => problem.level === "error")) return failed(checked);

    const warnings: Problem[] = checked.filter((problem) => problem.level === "warning");
    const prepared = await prepareFab(factory, config);
    warnings.push(...prepared.warnings);

    try {
      if (context.options["dry-run"] === true) {
        const targets: PublishTargetResult[] = prepared.targets.map((target) => ({
          target,
          status: "skipped",
          detail: DRY_RUN_DETAIL,
        }));
        const result: CommandResult = {
          ok: true,
          command: "publish",
          exitCode: ExitCode.Ok,
          version: publish.version,
          files: prepared.files,
          size: prepared.size,
          targets,
          problems: warnings,
        };
        if (context.options.json !== true) {
          result.summary = summary(publish.version, prepared.files, prepared.size, targets, publish);
        }
        return result;
      }

      const options: PublishOptions = {
        json: context.options.json === true,
        ...(typeof context.options.tag === "string" ? { tag: context.options.tag } : {}),
        ...(context.io.stderr === undefined ? {} : { stderr: context.io.stderr }),
      };
      const report = await publishFab(prepared, publish, options);
      const failedTarget = report.targets.find((target) => target.status === "failed");
      const ok = failedTarget === undefined;

      const result: CommandResult = {
        ok,
        command: "publish",
        exitCode: ok ? ExitCode.Ok : (report.exitCode ?? ExitCode.Failed),
        version: report.version,
        files: prepared.files,
        size: prepared.size,
        targets: report.targets,
        problems: [...(report.problems ?? []), ...warnings],
      };
      if (context.options.json !== true) {
        result.summary = summary(
          report.version,
          prepared.files,
          prepared.size,
          report.targets,
          publish,
        );
      }
      return result;
    } finally {
      await prepared.cleanup();
    }
  },
};
