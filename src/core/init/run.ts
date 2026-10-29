import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { confirm, NeedsInput } from "../../input.js";
import type { InputIO } from "../../input.js";
import { isDirectory, pathExists } from "../../util/fs.js";
import {
  ADOPTION_QUESTION,
  adoptionRequired,
  applyAdoption,
  planAdoption,
} from "../adopt.js";
import type { AdoptionMove } from "../adopt.js";
import { applyBuild, planBuild } from "../build/index.js";
import type { BuildChange } from "../build/index.js";
import { CONFIG_FILENAME } from "../config/parse.js";
import { destinations } from "../config/destinations.js";
import { loadConfig } from "../config/load.js";
import { TARGETS } from "../config/types.js";
import type { Target } from "../config/types.js";
import { createConfig } from "../config/writers.js";
import { createFactoryYamlText } from "../edit/factory-yaml.js";
import { loadFactory } from "../factory/load.js";
import { ensureGitattributes } from "./gitattributes.js";
import { deriveFactoryName } from "./name.js";
import { selectTargets } from "./targets.js";
import type { TargetPrompt } from "./targets.js";

export interface InitOptions {
  /** Directory that will contain `.factory/`. */
  root: string;
  /** Raw `--agents` value. */
  agents?: string;
  /** Consent to adopt existing repository skills without asking. */
  adopt?: boolean;
  /** Injected input and output; production uses the process streams. */
  io?: InputIO;
  /** Injected agent-target prompt, so tests do not need a terminal. */
  prompt?: TargetPrompt;
}

export interface InitReport {
  root: string;
  /** Files created by `init`, in the order it created them. */
  created: string[];
  /** Existing files changed by `init`, other than build output. */
  updated: string[];
  /** `.gitattributes` lines added. */
  gitattributes: string[];
  /** Skills moved from a destination into `.factory/skills/`. */
  moved: AdoptionMove[];
  /** Files created, updated, or removed by the closing build. */
  changed: BuildChange[];
  /** Build warnings. */
  problems: Problem[];
  /** True when the adoption question was answered with no. */
  declined: boolean;
}

function cliVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require("../../../package.json") as { version?: unknown };
  return typeof pkg.version === "string" ? pkg.version : "0.0.0";
}

function selectedTargets(selection: "all" | Target[]): Target[] {
  return selection === "all" ? [...TARGETS] : [...selection];
}

async function ensureFactoryFiles(
  root: string,
  factoryDir: string,
  selection: "all" | Target[],
): Promise<string[]> {
  const created: string[] = [];
  await mkdir(factoryDir, { recursive: true });

  const factoryFile = path.join(factoryDir, "factory.yaml");
  if (!(await pathExists(factoryFile))) {
    const name = deriveFactoryName(path.basename(root));
    await writeFile(factoryFile, createFactoryYamlText(name), "utf8");
    created.push(".factory/factory.yaml");
  }

  const agentsFile = path.join(factoryDir, "AGENTS.md");
  if (!(await pathExists(agentsFile))) {
    await writeFile(agentsFile, "", "utf8");
    created.push(".factory/AGENTS.md");
  }

  if (await createConfig(factoryDir, { agents: selection })) {
    created.push(`.factory/${CONFIG_FILENAME}`);
  }

  return created;
}

/**
 * Runs the `init` sequence: resolve targets, preflight adoption and collect consent,
 * create missing factory files, add `.gitattributes` lines, apply adoption, then build.
 * Nothing is written before the adoption preflight and consent are complete.
 */
export async function runInit(options: InitOptions): Promise<InitReport> {
  const root = path.resolve(options.root);
  const factoryDir = path.join(root, ".factory");
  const io: InputIO = options.io ?? {};
  const tty = io.tty ?? process.stdin.isTTY === true;

  const hasFactory = await isDirectory(factoryDir);
  const existingConfig = await loadConfig(factoryDir);
  const selection = await selectTargets({
    ...(options.agents === undefined ? {} : { agents: options.agents }),
    ...(hasFactory ? { existing: existingConfig.agentsRaw ?? "all" } : {}),
    io,
    ...(options.prompt === undefined ? {} : { prompt: options.prompt }),
  });
  const targets = selectedTargets(selection);

  const factory = hasFactory ? await loadFactory(root) : undefined;
  const plan = await planAdoption(
    root,
    destinations(targets).map((destination) => destination.directory),
    factory,
  );

  if (plan.blockers.length > 0) {
    const count = plan.blockers.length;
    throw new MetafabError(
      `Adoption is blocked by ${count} ${count === 1 ? "entry" : "entries"}.`,
      {
        exitCode: ExitCode.NotOwned,
        code: "adoption-blocked",
        problems: [...plan.blockers],
      },
    );
  }

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
    return {
      root,
      created: [],
      updated: [],
      gitattributes: [],
      moved: [],
      changed: [],
      problems: [],
      declined: true,
    };
  }

  const created = await ensureFactoryFiles(root, factoryDir, selection);
  const updated: string[] = [];

  const gitattributesExisted = await pathExists(path.join(root, ".gitattributes"));
  const gitattributes = await ensureGitattributes(root);
  if (gitattributes.changed) {
    if (gitattributesExisted) updated.push(".gitattributes");
    else created.push(".gitattributes");
  }

  if (plan.moves.length > 0) await applyAdoption(plan);

  const builtFactory = await loadFactory(root);
  const config = await loadConfig(factoryDir);
  const loadedProblems = [...builtFactory.problems, ...config.problems];
  const loadedWarnings = loadedProblems.filter((problem) => problem.level === "warning");

  const buildPlan = await planBuild(builtFactory, config, cliVersion());
  const allWarnings = [...loadedWarnings, ...buildPlan.warnings];
  if (buildPlan.conflicts.length > 0) {
    throw new MetafabError("Build stopped because the repository contains output that Metafab does not own.", {
      exitCode: ExitCode.NotOwned,
      code: "build-conflict",
      problems: [...buildPlan.conflicts, ...buildPlan.errors, ...allWarnings],
    });
  }
  if (buildPlan.errors.length > 0) {
    throw new MetafabError("Build failed after init.", {
      exitCode: ExitCode.Failed,
      code: "build-failed",
      problems: [...buildPlan.errors, ...allWarnings],
    });
  }

  const report = await applyBuild(buildPlan);

  return {
    root,
    created,
    updated,
    gitattributes: [...gitattributes.added],
    moved: plan.moves.map((move) => ({ ...move, from: [...move.from] })),
    changed: report.changed,
    problems: allWarnings,
    declined: false,
  };
}

/** Human-readable report for `init`, or `Already initialised` when nothing needed changing. */
export function describeInit(report: InitReport): string {
  if (report.declined) return "Adoption declined. Nothing changed.";

  const seemsComplete =
    report.created.length === 0 &&
    report.updated.length === 0 &&
    report.gitattributes.length === 0 &&
    report.moved.length === 0 &&
    report.changed.length === 0;
  if (seemsComplete) return "Already initialised";

  const marks = { created: "+", updated: "~", removed: "-" } as const;
  const gitattributesUpdated = report.updated.includes(".gitattributes");
  const lines = [
    ...report.created.map((file) => `Created ${file}`),
    ...report.updated.map((file) => `Updated ${file}`),
    ...(gitattributesUpdated
      ? report.gitattributes.map((line) => `Added .gitattributes line: ${line}`)
      : []),
    ...report.moved.map((move) => `Moved ${move.from.join(", ")} -> ${move.to}`),
    ...report.changed.map((change) => `${marks[change.action]} ${change.path}`),
  ];
  return lines.join("\n");
}
