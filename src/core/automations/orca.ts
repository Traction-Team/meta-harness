import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { isDirectory, normalizeProblemPath } from "../../util/fs.js";
import { runGit } from "../../util/git.js";
import { toLF } from "../../util/text.js";
import { NeedsInput } from "../../input.js";
import type { Factory } from "../factory/types.js";
import { desiredSet, isManaged } from "./desired.js";
import type { DesiredEntry } from "./desired.js";
import { noMainCheckout } from "./problems.js";
import { relativeFactoryDir } from "./stub.js";

const execFileAsync = promisify(execFile);

/** Runs the `orca` CLI with an argument list, never through a shell. */
export interface OrcaRunner {
  (args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

/** One automation as `orca automations list --json` reports it. */
export interface OrcaAutomation {
  id: string;
  title: string;
  prompt: string;
  /** The cron, as `--trigger` gave it. */
  rrule?: string;
  timezone?: string;
  agentId?: string;
  enabled?: boolean;
  /** ISO 8601; the oldest of two registrations with one title is kept. */
  createdAt?: string;
  /** Where the automation runs; this is how a registration belongs to a repository. */
  runContext?: { path?: string };
  /** `<mode>::<path>`, such as `worktree::/repo` or `main::/repo`. */
  workspaceId?: string;
  /** The workspace mode, when Orca reports it apart from `workspaceId`. */
  workspaceMode?: string;
  baseBranch?: string;
  /** Whether a worktree run runs the repository's setup. */
  launchSetup?: boolean;
  /** Whether a run reuses its agent session; sync requires a fresh one. */
  reuseSession?: boolean;
}

/** One call sync makes. `args` are the `orca` arguments, without the runner's flags. */
export interface OrcaChange {
  kind: "create" | "update" | "disable" | "remove";
  name: string;
  args: string[];
  /** For an update, the settings that differ, for the `~` line. */
  fields: string[];
}

export interface OrcaPlan {
  changes: OrcaChange[];
  /** Managed registrations that already match. */
  unchanged: string[];
  /** Entries titled `automation: ` that are not this factory's. */
  leftAlone: string[];
  /** The agent the planned registrations use. */
  agent: string;
}

export interface OrcaSyncResult {
  created: string[];
  updated: string[];
  disabled: string[];
  removed: string[];
  unchanged: string[];
  leftAlone: string[];
  /** The changes that were applied, in plan order, for the human output. */
  applied: OrcaChange[];
  failure?: { message: string; fix: string };
}

/** The human line for one change, as `sync orca` and `plan orca` print it. */
export function changeLine(change: OrcaChange): string {
  if (change.kind === "create") return `+ automation: ${change.name}`;
  if (change.kind === "update") return `~ automation: ${change.name} (${change.fields.join(", ")})`;
  if (change.kind === "disable") return `off automation: ${change.name}`;
  return `- automation: ${change.name}`;
}

/** A plan for one `sync orca` or `plan orca` run. */
export interface OrcaCommandPlan extends OrcaPlan {
  desired: DesiredEntry[];
}

/** `orca` is not installed. */
export class OrcaMissingError extends MetafabError {
  constructor() {
    const message = "The orca command was not found";
    super(message, {
      exitCode: ExitCode.Failed,
      code: "orca-missing",
      problems: [
        {
          level: "error",
          file: normalizeProblemPath("metafab"),
          message,
          fix: "Install Orca, or run the sync on a machine that has it",
        },
      ],
    });
    this.name = "OrcaMissingError";
  }
}

/**
 * The production runner: `orca [...args, --environment local, --json]`, so a
 * paired remote Orca in the caller's environment never receives the sync.
 */
export function createOrcaRunner(): OrcaRunner {
  return async (args) => {
    const env = { ...process.env };
    delete env.ORCA_PAIRING_CODE;

    try {
      const { stdout, stderr } = await execFileAsync(
        "orca",
        [...args, "--environment", "local", "--json"],
        { env, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      );
      return { exitCode: 0, stdout, stderr };
    } catch (error) {
      const failure = error as {
        code?: number | string;
        stdout?: string;
        stderr?: string;
        message?: string;
      };
      if (typeof failure.code === "number") {
        return {
          exitCode: failure.code,
          stdout: failure.stdout ?? "",
          stderr: failure.stderr ?? failure.message ?? "",
        };
      }
      if (failure.code === "ENOENT") throw new OrcaMissingError();
      throw error;
    }
  };
}

/**
 * The repository's main checkout: the current checkout when Git says it is the
 * main worktree, otherwise the first `worktree ` record of `git worktree list
 * --porcelain`, which a sync run from a linked worktree names. Undefined when
 * there is none, or it is bare, or it does not hold `.factory/` at this
 * factory's relative path. `git worktree list` names the git directory rather
 * than the checkout for a `--separate-git-dir` repository, which is why the
 * current checkout wins when `--git-dir` and `--git-common-dir` agree.
 */
export async function mainCheckout(factory: Factory): Promise<string | undefined> {
  const toplevel = await gitOutput(["rev-parse", "--show-toplevel"], factory.root);
  const gitDir = await gitOutput(["rev-parse", "--git-dir"], factory.root);
  const commonDir = await gitOutput(["rev-parse", "--git-common-dir"], factory.root);
  if (toplevel === undefined || gitDir === undefined || commonDir === undefined) {
    return undefined;
  }

  let candidate: string;
  if (samePath(path.resolve(factory.root, gitDir), path.resolve(factory.root, commonDir))) {
    candidate = toplevel;
  } else {
    const listed = await gitOutput(
      ["-c", "core.quotePath=false", "worktree", "list", "--porcelain"],
      factory.root,
    );
    if (listed === undefined) return undefined;

    const lines = toLF(listed).split("\n");
    const first = lines.find((line) => line.startsWith("worktree "));
    if (first === undefined) return undefined;

    const end = lines.indexOf("");
    const record = lines.slice(0, end === -1 ? lines.length : end);
    if (record.includes("bare")) return undefined;

    candidate = first.slice("worktree ".length);
    if (candidate === "") return undefined;
  }

  const main = await realPath(candidate);
  const relDir = await relativeFactoryDir(factory.root);
  return (await isDirectory(path.join(main, relDir, ".factory"))) ? main : undefined;
}

async function gitOutput(args: string[], cwd: string): Promise<string | undefined> {
  const result = await runGit(args, { cwd });
  if (result.exitCode !== 0) return undefined;
  return toLF(result.stdout).replace(/\n$/, "");
}

async function realPath(target: string): Promise<string> {
  try {
    return await realpath(target);
  } catch {
    return target;
  }
}

/** Reads the installed automations, or throws with Orca's message and fix. */
export async function readOrcaAutomations(run: OrcaRunner): Promise<OrcaAutomation[]> {
  const result = await run(["automations", "list"]);
  if (result.exitCode !== 0) throw orcaFailure(result);

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw orcaUnreadable();
  }
  const automations = (parsed as { automations?: unknown } | undefined)?.automations;
  if (!Array.isArray(automations)) throw orcaUnreadable();
  return automations as OrcaAutomation[];
}

/**
 * The changes that make Orca match `desired`, or NeedsInput when the agent is
 * missing. Nothing is written: `applyOrcaSync` runs the changes.
 */
export async function planOrcaSync(input: {
  desired: DesiredEntry[];
  installed: OrcaAutomation[];
  repoRoot: string;
  factory: Factory;
  account: string;
  trunk: string;
  agent?: string;
}): Promise<OrcaPlan> {
  const { desired, installed, repoRoot, factory, account, trunk } = input;
  const factoryName = factory.factoryYaml?.name ?? "";

  const managed: { entry: OrcaAutomation; name: string }[] = [];
  const leftAlone: string[] = [];
  for (const entry of installed) {
    if (!samePath(entry.runContext?.path, repoRoot)) continue;
    const name = isManaged(entry, factoryName);
    if (name !== undefined) managed.push({ entry, name });
    else if (entry.title.startsWith("automation: ")) leftAlone.push(entry.title);
  }

  let agent = input.agent;
  if (agent === undefined) {
    const agents = new Set(
      managed
        .map(({ entry }) => entry.agentId)
        .filter((id): id is string => typeof id === "string" && id !== ""),
    );
    if (agents.size === 1) agent = [...agents][0];
  }
  if (agent === undefined && desired.length > 0) {
    throw new NeedsInput([
      {
        name: "agent",
        flag: "--agent",
        description: "The Orca agent to run the automations with, such as opencode, claude or codex",
      },
    ]);
  }
  const agentId = agent ?? "";

  const byName = new Map<string, OrcaAutomation[]>();
  for (const { entry, name } of managed) {
    const entries = byName.get(name);
    if (entries === undefined) byName.set(name, [entry]);
    else entries.push(entry);
  }

  const changes: OrcaChange[] = [];
  const unchanged: string[] = [];

  // Keep the oldest registration of each title and remove the rest.
  const kept = new Map<string, OrcaAutomation>();
  for (const [name, entries] of byName) {
    const [oldest, ...duplicates] = [...entries].sort(byCreatedAt);
    kept.set(name, oldest!);
    for (const duplicate of duplicates) {
      changes.push(removeChange(name, duplicate));
    }
  }

  for (const entry of desired) {
    const installedEntry = kept.get(entry.name);
    if (installedEntry === undefined) {
      changes.push(createChange(entry, agentId, repoRoot, trunk));
      continue;
    }

    if (workspaceMode(installedEntry) !== entry.checkout) {
      // Orca cannot move an automation between workspace modes.
      changes.push(removeChange(entry.name, installedEntry));
      changes.push(createChange(entry, agentId, repoRoot, trunk));
      continue;
    }

    const fields: string[] = [];
    const args = ["automations", "edit", installedEntry.id];
    const add = (field: string, ...flags: string[]): void => {
      fields.push(field);
      args.push(...flags);
    };

    if (trimEnd(installedEntry.prompt ?? "") !== trimEnd(entry.stub)) {
      add("prompt", "--prompt", entry.stub);
    }
    if (cronOf(installedEntry.rrule) !== cronOf(entry.cron)) {
      add("cron", "--trigger", cronOf(entry.cron));
    }
    if (installedEntry.timezone !== entry.tz) {
      add("timezone", "--timezone", entry.tz);
    }
    if (installedEntry.agentId !== agentId) {
      add("agent", "--provider", agentId);
    }
    if (installedEntry.enabled === false) {
      add("enabled", "--enabled");
    }
    if (entry.checkout === "worktree") {
      if (installedEntry.baseBranch !== `origin/${trunk}`) {
        add("base branch", "--base-branch", `origin/${trunk}`);
      }
      if (installedEntry.launchSetup !== true) {
        add("setup", "--setup", "run");
      }
    } else if (!samePath(workspacePath(installedEntry), repoRoot)) {
      add("workspace", "--workspace", `path:${repoRoot}`);
    }
    if (installedEntry.reuseSession !== false) {
      add("session", "--fresh-session");
    }

    if (fields.length === 0) unchanged.push(entry.name);
    else changes.push({ kind: "update", name: entry.name, args, fields });
  }

  for (const [name, entry] of kept) {
    if (desired.some((wanted) => wanted.name === name)) continue;
    if (entry.enabled === false) {
      unchanged.push(name);
      continue;
    }
    const automation = factory.automations?.list.find((candidate) => candidate.name === name);
    const keepsHistory =
      automation !== undefined &&
      !automation.enabled &&
      (automation.owner === "*" || automation.owner.toLowerCase() === account.toLowerCase());
    changes.push(
      keepsHistory
        ? { kind: "disable", name, args: ["automations", "edit", entry.id, "--disabled"], fields: [] }
        : removeChange(name, entry),
    );
  }

  return { changes, unchanged, leftAlone, agent: agentId };
}

/** Runs the changes in plan order, stopping at the first call that fails. */
export async function applyOrcaSync(
  changes: OrcaChange[],
  run: OrcaRunner,
): Promise<OrcaSyncResult> {
  const result: OrcaSyncResult = {
    created: [],
    updated: [],
    disabled: [],
    removed: [],
    unchanged: [],
    leftAlone: [],
    applied: [],
  };

  for (const change of changes) {
    try {
      const answer = await run(change.args);
      if (answer.exitCode !== 0) {
        result.failure = failureOf(orcaFailure(answer));
        return result;
      }
    } catch (error) {
      if (!(error instanceof MetafabError)) throw error;
      result.failure = failureOf(error);
      return result;
    }

    result.applied.push(change);
    if (change.kind === "create") result.created.push(change.name);
    else if (change.kind === "update") result.updated.push(change.name);
    else if (change.kind === "disable") result.disabled.push(change.name);
    else result.removed.push(change.name);
  }

  return result;
}

/**
 * Reads the files and Orca, then plans the sync: what both `sync orca` and
 * `plan orca` need, before anything is written.
 */
export async function prepareOrcaSync(input: {
  factory: Factory;
  account: string;
  trunk: string;
  agent?: string;
  run: OrcaRunner;
}): Promise<OrcaCommandPlan> {
  const desired = await desiredSet(input.factory, "orca", input.account, input.trunk);

  const main = await mainCheckout(input.factory);
  if (main === undefined) throw errorFrom(noMainCheckout());

  const installed = await readOrcaAutomations(input.run);
  const plan = await planOrcaSync({
    desired,
    installed,
    repoRoot: main,
    factory: input.factory,
    account: input.account,
    trunk: input.trunk,
    agent: input.agent,
  });
  return { desired, ...plan };
}

/** The result of a plan that is applied nowhere, as `--dry-run` reports it. */
export function plannedResult(plan: OrcaCommandPlan): OrcaSyncResult {
  const result: OrcaSyncResult = {
    created: [],
    updated: [],
    disabled: [],
    removed: [],
    unchanged: plan.unchanged,
    leftAlone: plan.leftAlone,
    applied: [...plan.changes],
  };
  for (const change of plan.changes) {
    if (change.kind === "create") result.created.push(change.name);
    else if (change.kind === "update") result.updated.push(change.name);
    else if (change.kind === "disable") result.disabled.push(change.name);
    else result.removed.push(change.name);
  }
  return result;
}

function createChange(
  entry: DesiredEntry,
  agent: string,
  repoRoot: string,
  trunk: string,
): OrcaChange {
  const args = [
    "automations",
    "create",
    "--name",
    entry.title,
    "--trigger",
    cronOf(entry.cron),
    "--timezone",
    entry.tz,
    "--prompt",
    entry.stub,
    "--provider",
    agent,
    "--enabled",
    "--fresh-session",
  ];
  if (entry.checkout === "worktree") {
    args.push("--repo", `path:${repoRoot}`, "--base-branch", `origin/${trunk}`, "--setup", "run");
  } else {
    args.push("--workspace", `path:${repoRoot}`);
  }
  return { kind: "create", name: entry.name, args, fields: [] };
}

function removeChange(name: string, entry: OrcaAutomation): OrcaChange {
  return { kind: "remove", name, args: ["automations", "remove", entry.id], fields: [] };
}

function byCreatedAt(left: OrcaAutomation, right: OrcaAutomation): number {
  const first = left.createdAt ?? "";
  const second = right.createdAt ?? "";
  return first < second ? -1 : first > second ? 1 : 0;
}

/** The cron with its fields joined by one space, for comparing with Orca's copy. */
function cronOf(cron: string | undefined): string {
  return (cron ?? "").trim().split(/\s+/).join(" ");
}

function trimEnd(text: string): string {
  return text.replace(/\s+$/, "");
}

/** The path part of `workspaceId`, after `::`. */
function workspacePath(entry: OrcaAutomation): string | undefined {
  const id = entry.workspaceId;
  if (id === undefined) return undefined;
  const at = id.indexOf("::");
  return at === -1 ? undefined : id.slice(at + 2);
}

/** `worktree` or `main`, from the entry's own field or its `workspaceId`. */
function workspaceMode(entry: OrcaAutomation): "worktree" | "main" | undefined {
  if (entry.workspaceMode === "worktree" || entry.workspaceMode === "main") {
    return entry.workspaceMode;
  }
  const id = entry.workspaceId;
  if (id === undefined) return undefined;
  const at = id.indexOf("::");
  const mode = at === -1 ? id : id.slice(0, at);
  return mode === "worktree" || mode === "main" ? mode : undefined;
}

/** Two absolute paths name one checkout; letter case is ignored where the system ignores it. */
function samePath(left: string | undefined, right: string): boolean {
  if (left === undefined) return false;
  const first = path.resolve(left);
  const second = path.resolve(right);
  return process.platform === "win32" || process.platform === "darwin"
    ? first.toLowerCase() === second.toLowerCase()
    : first === second;
}

function errorFrom(problem: Problem): MetafabError {
  return new MetafabError(problem.message, {
    exitCode: ExitCode.Failed,
    code: "orca-sync",
    problems: [problem],
  });
}

function orcaFailure(result: { exitCode: number; stderr: string }): MetafabError {
  const message =
    result.stderr.trim() === "" ? `orca exited with code ${result.exitCode}` : result.stderr.trim();
  return new MetafabError(message, {
    exitCode: ExitCode.Failed,
    code: "orca-failed",
    problems: [
      {
        level: "error",
        file: normalizeProblemPath("metafab"),
        message,
        fix: "Start Orca, then run the sync again",
      },
    ],
  });
}

function orcaUnreadable(): MetafabError {
  const message = "Orca did not answer with a list of automations";
  return new MetafabError(message, {
    exitCode: ExitCode.Failed,
    code: "orca-unreadable",
    problems: [
      {
        level: "error",
        file: normalizeProblemPath("metafab"),
        message,
        fix: "Start Orca, then run the sync again",
      },
    ],
  });
}

function failureOf(error: MetafabError): { message: string; fix: string } {
  const problem = error.problems?.find((candidate) => candidate.level === "error");
  return {
    message: error.message,
    fix: problem?.fix ?? "Start Orca, then run the sync again",
  };
}
