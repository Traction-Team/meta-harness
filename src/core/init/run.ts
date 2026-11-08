import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
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
import type { AdoptionMove } from "../adopt.js";
import { applyBuild, planBuild } from "../build/index.js";
import type { BuildChange } from "../build/index.js";
import { CONFIG_FILE, CONFIG_FILENAME, parseConfig } from "../config/parse.js";
import { destinations } from "../config/destinations.js";
import { loadConfig, unreadableConfigCode } from "../config/load.js";
import { TARGETS } from "../config/types.js";
import type { Config, Target } from "../config/types.js";
import { createConfig, createConfigText, setGitHooks } from "../config/writers.js";
import { createFactoryYamlText } from "../edit/factory-yaml.js";
import { loadFactory } from "../factory/load.js";
import type { HookChange } from "../hooks/index.js";
import { assertGitattributesWritable, ensureGitattributes } from "./gitattributes.js";
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
  /** `--git-hooks` (`true`) or `--no-git-hooks` (`false`); absent when neither was given. */
  gitHooks?: boolean;
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
  /** Git hooks created, updated, or removed by the closing build. */
  hooks: HookChange[];
  /** Build and hook warnings. */
  problems: Problem[];
  /** True when the adoption question was answered with no. */
  declined: boolean;
  /** Human notes, such as a `git-hooks` value that was left alone. */
  notes: string[];
  /** Suggestions printed last, such as the Orca worktree setup step. */
  suggestions: string[];
}

const AGENTS_FILE = ".factory/AGENTS.md";

const GIT_HOOKS_QUESTION = "Run metafab build automatically after checkout, merge, and rebase?";

const ORCA_SUGGESTION =
  'Add "npx --yes @seasb/metafab build" to scripts.setup in orca.yaml so new Orca worktrees get the factory skills.';

function selectedTargets(selection: "all" | Target[]): Target[] {
  return selection === "all" ? [...TARGETS] : [...selection];
}

function unreadableFactory(file: string, message: string, fix: string): MetafabError {
  return new MetafabError(message, {
    exitCode: ExitCode.Failed,
    code: "factory-unreadable",
    problems: [{ level: "error", file, message, fix }],
  });
}

/** Refuses a `.factory` entry that cannot hold a factory before anything reads it. */
async function assertFactoryDirectoryUsable(factoryDir: string): Promise<void> {
  let info;
  try {
    info = await lstat(factoryDir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    throw unreadableFactory(
      ".factory",
      "Cannot read the .factory entry",
      "Check its permissions or restore the directory",
    );
  }

  if (info.isDirectory()) return;
  if (info.isSymbolicLink() && (await isDirectory(factoryDir))) return;

  throw unreadableFactory(
    ".factory",
    info.isSymbolicLink()
      ? ".factory is a symbolic link that does not point to a directory"
      : ".factory is a file, not a directory",
    "Move it or replace it with a directory, then run metafab init again",
  );
}

/**
 * The fix line for an unreadable configuration file. Only a permissions error
 * is worth telling the reader to check permissions; every other code means the
 * file is broken, a directory, a loop, or otherwise unreadable.
 */
function unreadableConfigFix(code: string): string {
  return code === "EACCES" || code === "EPERM"
    ? "Check its permissions or restore the file"
    : "Restore the file, then run metafab init again";
}

/** Loads `metafab.yaml`, refusing a file that exists but cannot be read. */
async function readConfig(factoryDir: string): Promise<Config> {
  const config = await loadConfig(factoryDir);
  const code = unreadableConfigCode(config);
  if (code !== undefined) {
    throw unreadableFactory(
      CONFIG_FILE,
      `Cannot read file ${CONFIG_FILE}`,
      unreadableConfigFix(code),
    );
  }

  return config;
}

/**
 * The one wording for a `.factory/factory.yaml` that exists but cannot be read,
 * shared by the `lstat` and the `readFile` failures.
 */
function unreadableFactoryFile(): MetafabError {
  return unreadableFactory(
    ".factory/factory.yaml",
    "Cannot read .factory/factory.yaml",
    "Check its permissions or restore the file",
  );
}

/**
 * Refuses a `.factory/factory.yaml` that exists but cannot be read before
 * anything is written. A file that is readable but invalid is left for the
 * closing build to report.
 *
 * The entry is found with `lstat`, not `stat`: a dangling symlink is an entry
 * too, and reading through it would create the target outside `.factory/`
 * instead of failing.
 */
async function assertFactoryFileReadable(factoryDir: string): Promise<void> {
  const file = path.join(factoryDir, "factory.yaml");

  try {
    await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw unreadableFactoryFile();
  }

  try {
    await readFile(file, "utf8");
  } catch {
    throw unreadableFactoryFile();
  }
}

function isAdoptionSource(file: string, moves: readonly AdoptionMove[]): boolean {
  return moves.some((move) =>
    move.from.some((from) => file === from || file.startsWith(`${from}/`)),
  );
}

/**
 * Refuses a `.factory/AGENTS.md` that is a symbolic link `init` would write
 * through. `ensureFactoryFiles` writes the file only when it does not resolve
 * to a file, so a link to an existing file is left alone.
 */
async function assertAgentsFileWritable(factoryDir: string): Promise<void> {
  const file = path.join(factoryDir, "AGENTS.md");

  let info;
  try {
    info = await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw unreadableFactory(
      AGENTS_FILE,
      `Cannot read ${AGENTS_FILE}`,
      "Check its permissions or restore the file",
    );
  }

  if (!info.isSymbolicLink()) return;
  if (await pathExists(file)) return;

  throw unreadableFactory(
    AGENTS_FILE,
    `${AGENTS_FILE} is a symbolic link, so metafab init will not write through it`,
    "Replace it with a regular file, then run metafab init again",
  );
}

/**
 * Refuses every entry `init` would write through a symbolic link, before it
 * writes anything. A dangling link would otherwise create its target, possibly
 * outside the repository.
 */
async function assertWritableEntries(root: string, factoryDir: string): Promise<void> {
  await assertGitattributesWritable(root, "init");
  await assertAgentsFileWritable(factoryDir);
}

/** The Orca setup suggestion, when this run created the config and Orca is used. */
async function orcaSuggestions(root: string, created: readonly string[]): Promise<string[]> {
  if (!created.includes(`.factory/${CONFIG_FILENAME}`)) return [];

  let text: string;
  try {
    text = await readFile(path.join(root, "orca.yaml"), "utf8");
  } catch {
    return [];
  }

  return text.includes("metafab build") ? [] : [ORCA_SUGGESTION];
}

/**
 * The output conflicts `build` would refuse, checked before `init` writes
 * anything. Validation errors that are already in the factory are left for the
 * closing build to report, so `init` still adds the missing entries the
 * specification promises. Conflict problems inside a planned move are ignored:
 * the move removes them.
 */
async function preflightBuild(
  root: string,
  config: Config,
  selection: "all" | Target[],
  configExists: boolean,
  moves: readonly AdoptionMove[],
): Promise<void> {
  const factory = await loadFactory(root);
  const effective = configExists ? config : parseConfig(createConfigText({ agents: selection }));
  const planned = await planBuild(factory, effective, cliVersion());
  const conflicts = planned.conflicts.filter((problem) => !isAdoptionSource(problem.file, moves));

  if (conflicts.length === 0) return;

  throw new MetafabError(
    "Build stopped because the repository contains output that Metafab does not own.",
    {
      exitCode: ExitCode.NotOwned,
      code: "build-conflict",
      problems: [...conflicts, ...planned.errors, ...planned.warnings],
    },
  );
}

async function ensureFactoryFiles(
  root: string,
  factoryDir: string,
  selection: "all" | Target[],
  gitHooks?: boolean,
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

  const config: { agents: "all" | Target[]; gitHooks?: boolean } = { agents: selection };
  if (gitHooks !== undefined) config.gitHooks = gitHooks;
  if (await createConfig(factoryDir, config)) {
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

  await assertFactoryDirectoryUsable(factoryDir);
  const hasFactory = await isDirectory(factoryDir);
  const existingConfig = await readConfig(factoryDir);
  const configExists =
    hasFactory && (await pathExists(path.join(factoryDir, CONFIG_FILENAME)));
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

  assertAdoptionAllowed(plan);

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
      hooks: [],
      problems: [],
      declined: true,
      notes: [],
      suggestions: [],
    };
  }

  const notes: string[] = [];
  let hooksValue: boolean | undefined;
  const hooksKeyPresent = configExists && existingConfig.gitHooksRaw !== undefined;

  if (hooksKeyPresent) {
    notes.push(
      `git-hooks is already ${String(existingConfig.gitHooks)} in .factory/${CONFIG_FILENAME}`,
    );
  } else if (options.gitHooks !== undefined) {
    hooksValue = options.gitHooks;
  } else if (tty) {
    hooksValue = await confirm(
      { name: "git-hooks", flag: "--git-hooks", description: GIT_HOOKS_QUESTION },
      { default: true },
      { ...io, tty },
    );
  }

  await preflightBuild(root, existingConfig, selection, configExists, plan.moves);
  await assertFactoryFileReadable(factoryDir);
  await assertWritableEntries(root, factoryDir);

  const created = await ensureFactoryFiles(root, factoryDir, selection, hooksValue);
  const updated: string[] = [];

  if (configExists && hooksValue !== undefined) {
    await setGitHooks(factoryDir, hooksValue);
    updated.push(`.factory/${CONFIG_FILENAME}`);
  }

  const gitattributesExisted = await pathExists(path.join(root, ".gitattributes"));
  const gitattributes = await ensureGitattributes(root);
  if (gitattributes.changed) {
    if (gitattributesExisted) updated.push(".gitattributes");
    else created.push(".gitattributes");
  }

  if (plan.moves.length > 0) await applyAdoption(plan);

  const suggestions = await orcaSuggestions(root, created);

  const builtFactory = await loadFactory(root);
  const config = await readConfig(factoryDir);
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
    hooks: report.hooks,
    problems: [...allWarnings, ...report.hookWarnings],
    declined: false,
    notes,
    suggestions,
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
    report.changed.length === 0 &&
    report.hooks.length === 0;

  const marks = { created: "+", updated: "~", removed: "-" } as const;
  const lines: string[] = [];

  if (seemsComplete) {
    lines.push("Already initialised");
  } else {
    const gitattributesUpdated = report.updated.includes(".gitattributes");
    lines.push(
      ...report.created.map((file) => `Created ${file}`),
      ...report.updated.map((file) => `Updated ${file}`),
      ...(gitattributesUpdated
        ? report.gitattributes.map((line) => `Added .gitattributes line: ${line}`)
        : []),
      ...report.moved.map((move) => `Moved ${move.from.join(", ")} -> ${move.to}`),
      ...report.changed.map((change) => `${marks[change.action]} ${change.path}`),
      ...report.hooks.map((change) => `${marks[change.action]} git hook ${change.hook}`),
    );
  }

  return [...lines, ...report.notes, ...report.suggestions].join("\n");
}
