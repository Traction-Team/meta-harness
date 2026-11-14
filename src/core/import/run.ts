import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { confirm, NeedsInput } from "../../input.js";
import type { InputIO } from "../../input.js";
import { isDirectory, pathExists } from "../../util/fs.js";
import { cliVersion } from "../../util/version.js";
import {
  ADOPTION_QUESTION,
  adoptionRequired,
  applyAdoption,
  assertAdoptionAllowed,
  planAdoption,
} from "../adopt.js";
import type { AdoptionMove, AdoptionPlan } from "../adopt.js";
import { applyBuild, planBuild } from "../build/index.js";
import type { BuildChange } from "../build/index.js";
import { destinations } from "../config/destinations.js";
import { CONFIG_FILE, CONFIG_FILENAME } from "../config/parse.js";
import type { UpstreamEntry } from "../config/types.js";
import { createConfig, setUpstream } from "../config/writers.js";
import { loadFactory } from "../factory/load.js";
import { assertGitattributesWritable, ensureGitattributes } from "../init/gitattributes.js";
import { selectTargets } from "../init/targets.js";
import type { TargetPrompt } from "../init/targets.js";
import {
  assertFactoryDirectoryUsable,
  preflightBuild,
  readConfig,
  selectedTargets,
} from "../setup.js";
import { fetchFab, parseSource, resolve } from "../sources/index.js";
import type { FetchedFab, SourceOptions } from "../sources/index.js";
import { renderSummary, summarise } from "../summary.js";
import type { Summary } from "../summary.js";
import { copyFactoryTree, FAB_ROOT_EXCLUDES } from "./copy.js";
import { findImportConflicts, localFilesForImport } from "./conflicts.js";
import { emptyTree, snapshotDirectories, snapshotFactory, snapshotTree } from "./file-tree.js";
import { alignFactorySpelling } from "../update/spelling.js";

export interface ImportOptions {
  /** Directory that contains, or will contain, `.factory/`. */
  root: string;
  /** The source exactly as the user typed it. */
  source: string;
  /** Directory relative paths resolve against; the process cwd by default. */
  cwd?: string;
  /** Raw `--agents` value. */
  agents?: string;
  /** Replace differing local files instead of stopping. */
  force?: boolean;
  /** Consent to adopt existing repository skills without asking. */
  adopt?: boolean;
  /** Injected input and output; production uses the process streams. */
  io?: InputIO;
  /** Injected agent-target prompt, so tests do not need a terminal. */
  prompt?: TargetPrompt;
  /** Let Git prompt for credentials; the command enables it for a TTY. */
  interactive?: boolean;
  /** Injected source settings, used by tests for a local registry or transport. */
  sourceOptions?: SourceOptions;
}

export interface ImportReport {
  root: string;
  upstream: UpstreamEntry;
  /** Files created before the copy, such as `metafab.yaml` and `.gitattributes`. */
  created: string[];
  /** Existing files changed before the copy. */
  updated: string[];
  /** `.gitattributes` lines added. */
  gitattributes: string[];
  /** Skills moved from a destination into `.factory/skills/`. */
  moved: AdoptionMove[];
  /** Fab paths copied into `.factory/`. */
  copied: string[];
  /** Files created, updated, or removed by the closing build. */
  changed: BuildChange[];
  /** Build warnings. */
  problems: Problem[];
  /** The review summary, also rendered as the command's human output. */
  review: Summary;
  /** True when the adoption question was answered with no. */
  declined: boolean;
}

function upstreamExists(): MetafabError {
  return new MetafabError("This factory already has an upstream", {
    exitCode: ExitCode.NotOwned,
    code: "upstream-exists",
    problems: [
      {
        level: "error",
        file: CONFIG_FILE,
        message: "This factory already has an upstream",
        fix: "Use metafab update or metafab detach",
      },
    ],
  });
}

function importConflicts(conflicts: Problem[]): MetafabError {
  return new MetafabError("Import stopped because the incoming fab would replace local files.", {
    exitCode: ExitCode.NotOwned,
    code: "import-conflict",
    problems: conflicts,
  });
}

function importTitle(upstream: UpstreamEntry): string {
  switch (upstream.kind) {
    case "npm":
      return `Imported ${upstream.source} ${upstream.version}`;
    case "git":
      return upstream.version === undefined
        ? `Imported ${upstream.source} ${upstream.commit.slice(0, 7)}`
        : `Imported ${upstream.source} ${upstream.version}`;
    case "unversioned":
      return `Imported ${upstream.source}`;
  }
}

function declinedReport(
  root: string,
  upstream: UpstreamEntry,
  review: Summary,
): ImportReport {
  return {
    root,
    upstream,
    created: [],
    updated: [],
    gitattributes: [],
    moved: [],
    copied: [],
    changed: [],
    problems: [],
    review,
    declined: true,
  };
}

/**
 * Runs `metafab import`: resolve and fetch the source, check it against the
 * repository without writing, collect adoption consent, then create the local
 * configuration, adopt skills, copy the fab, record the upstream and build.
 *
 * Nothing is written before the preflight and consent are complete. A temporary
 * fetch directory is removed whatever way the command ends.
 */
export async function runImport(options: ImportOptions): Promise<ImportReport> {
  const root = path.resolve(options.root);
  const factoryDir = path.join(root, ".factory");
  const io: InputIO = options.io ?? {};
  const tty = io.tty ?? process.stdin.isTTY === true;

  await assertFactoryDirectoryUsable(factoryDir, "import");
  const hasFactory = await isDirectory(factoryDir);
  const existingConfig = await readConfig(factoryDir, "import");

  if (existingConfig.upstream !== undefined) throw upstreamExists();
  const configErrors = existingConfig.problems.filter((problem) => problem.level === "error");
  if (configErrors.length > 0) {
    throw new MetafabError("The factory configuration has problems.", {
      exitCode: ExitCode.Failed,
      code: "config-invalid",
      problems: configErrors,
    });
  }

  const spec = parseSource(options.source, { cwd: options.cwd ?? process.cwd() });
  const sourceOptions: SourceOptions = {
    ...options.sourceOptions,
    ...(options.interactive === true ? { interactive: true } : {}),
  };
  const resolved = await resolve(spec, sourceOptions);

  let fetched: FetchedFab | undefined;
  try {
    fetched = await fetchFab(resolved, sourceOptions);

    const selection = await selectTargets({
      ...(options.agents === undefined ? {} : { agents: options.agents }),
      ...(hasFactory ? { existing: existingConfig.agentsRaw ?? "all" } : {}),
      io,
      ...(options.prompt === undefined ? {} : { prompt: options.prompt }),
    });
    const targets = selectedTargets(selection);

    const factory = hasFactory ? await loadFactory(root) : undefined;
    const plan: AdoptionPlan = await planAdoption(
      root,
      destinations(targets).map((destination) => destination.directory),
      factory,
    );
    assertAdoptionAllowed(plan);

    const local = await localFilesForImport(root, factoryDir, plan.moves, hasFactory);
    await assertGitattributesWritable(root, "import");
    const { conflicts, ambiguities } = await findImportConflicts(fetched.factoryDir, local);
    // `--force` replaces differing local content, but it cannot choose between
    // two local entries that fold to one incoming path: a case-sensitive
    // filesystem can hold both, and renaming either would be a guess.
    if (ambiguities.length > 0) throw importConflicts([...ambiguities, ...conflicts]);
    if (conflicts.length > 0 && options.force !== true) throw importConflicts(conflicts);

    let declined = false;
    if (plan.moves.length > 0 && options.adopt !== true) {
      if (!tty) throw new NeedsInput([adoptionRequired(plan)]);
      const accepted = await confirm(
        { name: "adopt", flag: "--adopt", description: ADOPTION_QUESTION },
        {},
        { ...io, tty },
      );
      declined = !accepted;
    }

    if (declined) {
      return declinedReport(
        root,
        fetched.upstream,
        summarise(emptyTree(), emptyTree(), { title: importTitle(fetched.upstream) }),
      );
    }

    const configExists = hasFactory && (await pathExists(path.join(factoryDir, CONFIG_FILENAME)));
    await preflightBuild(root, existingConfig, selection, configExists, plan.moves);

    const created: string[] = [];
    const updated: string[] = [];

    if (await createConfig(factoryDir, { agents: selection })) {
      created.push(`.factory/${CONFIG_FILENAME}`);
    }

    const gitattributesExisted = await pathExists(path.join(root, ".gitattributes"));
    const gitattributes = await ensureGitattributes(root);
    if (gitattributes.changed) {
      if (gitattributesExisted) updated.push(".gitattributes");
      else created.push(".gitattributes");
    }

    const before = await snapshotFactory(root);
    if (plan.moves.length > 0) await applyAdoption(plan);
    // With `--force` a case-only clash is realigned before the copy, so the
    // result is the same on every filesystem. A declined import never reaches
    // here, so it still renames nothing. A local file where the fab has a
    // directory is skipped by `alignFactorySpelling` and replaced by the copy.
    const fabTree = await snapshotTree(fetched.factoryDir);
    await alignFactorySpelling(factoryDir, {
      files: Object.keys(fabTree).filter(
        (relativePath) => relativePath.includes("/") || !FAB_ROOT_EXCLUDES.has(relativePath),
      ),
      directories: await snapshotDirectories(fetched.factoryDir),
    });
    const copied = await copyFactoryTree(fetched.factoryDir, factoryDir);
    await setUpstream(factoryDir, fetched.upstream);
    const after = await snapshotFactory(root);

    const builtFactory = await loadFactory(root);
    const config = await readConfig(factoryDir, "import");
    const warnings = [...builtFactory.problems, ...config.problems].filter(
      (problem) => problem.level === "warning",
    );
    const buildPlan = await planBuild(builtFactory, config, cliVersion());

    if (buildPlan.conflicts.length > 0) {
      throw new MetafabError(
        "Build stopped because the repository contains output that Metafab does not own.",
        {
          exitCode: ExitCode.NotOwned,
          code: "build-conflict",
          problems: [...buildPlan.conflicts, ...buildPlan.errors, ...warnings, ...buildPlan.warnings],
        },
      );
    }
    if (buildPlan.errors.length > 0) {
      throw new MetafabError("Build failed after import.", {
        exitCode: ExitCode.Failed,
        code: "build-failed",
        problems: [...buildPlan.errors, ...warnings, ...buildPlan.warnings],
      });
    }

    const build = await applyBuild(buildPlan);

    return {
      root,
      upstream: fetched.upstream,
      created,
      updated,
      gitattributes: [...gitattributes.added],
      moved: plan.moves.map((move) => ({ ...move, from: [...move.from] })),
      copied,
      changed: build.changed,
      problems: [...warnings, ...buildPlan.warnings, ...build.hookWarnings],
      review: summarise(before, after, { title: importTitle(fetched.upstream) }),
      declined: false,
    };
  } finally {
    await fetched?.cleanup?.();
  }
}

/** Human-readable report for `import`: the review summary, or the declined notice. */
export function describeImport(report: ImportReport): string {
  if (report.declined) return "Adoption declined. Nothing changed.";
  return renderSummary(report.review);
}
