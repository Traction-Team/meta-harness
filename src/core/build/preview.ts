import { chmod, lstat, mkdir, readdir, realpath, rm, rmdir, stat, writeFile } from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { AGENTS_SKILLS_DIRECTORY, CLAUDE_SKILLS_DIRECTORY } from "../config/destinations.js";
import type { Config } from "../config/types.js";
import { resolveSelection } from "../env/select.js";
import type { Factory } from "../factory/types.js";
import { desiredOutput, skillWrites } from "./plan.js";
import type { BuildChange, BuildWrite, PlanBuildOptions } from "./plan.js";
import { isInside } from "./skill.js";

/**
 * Directories a preview may not write into. The next `build` would find the
 * preview's output there and treat it as unowned.
 */
const FORBIDDEN = [
  { directory: ".factory", label: ".factory" },
  { directory: CLAUDE_SKILLS_DIRECTORY, label: ".claude/skills" },
  { directory: AGENTS_SKILLS_DIRECTORY, label: ".agents/skills" },
] as const;

export interface PreviewPlan {
  /** Absolute path of the preview directory; empty when `--out` was empty. */
  out: string;
  /** True when `out` did not exist, so the preview creates it. */
  created: boolean;
  /** The files to write, with paths relative to `out` and forward slashes. */
  writes: BuildWrite[];
  errors: Problem[];
  conflicts: Problem[];
  warnings: Problem[];
}

function notADirectory(given: string): Problem {
  return {
    level: "error",
    file: given,
    message: `--out ${given} is not a directory`,
    fix: "Pass a directory that does not exist or is empty",
  };
}

function notEmpty(given: string): Problem {
  return {
    level: "error",
    file: given,
    message: `--out ${given} is not empty`,
    fix: "Choose a new directory or empty it",
  };
}

function insideDestination(given: string, label: string): Problem {
  return {
    level: "error",
    file: given,
    message: `--out ${given} is inside ${label}, where build would find it`,
    fix: "Choose a directory outside .factory/ and the skill destinations",
  };
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

type EntryKind = "absent" | "directory" | "other";

/** What is at `target` now, following a link to a directory. */
async function entryKind(target: string): Promise<EntryKind> {
  let info: Stats;
  try {
    info = await lstat(target);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return "absent";
    // A component above the path is a file, so the path cannot be a directory.
    if (code === "ENOTDIR") return "other";
    throw error;
  }

  if (info.isDirectory()) return "directory";
  if (info.isSymbolicLink() && (await isDirectory(target))) return "directory";
  return "other";
}

/**
 * A path with every existing component resolved through links and the missing
 * tail joined on unchanged, so a destination that does not exist yet, or a
 * `.claude` that is a link, is compared on the same footing as `out`.
 */
async function canonical(target: string): Promise<string> {
  const missing: string[] = [];
  let current = target;
  for (;;) {
    try {
      const real = await realpath(current);
      return path.join(real, ...missing.reverse());
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
      missing.push(path.basename(current));
      const parent = path.dirname(current);
      if (parent === current) return path.join(target);
      current = parent;
    }
  }
}

/**
 * What `metafab build --out <dir>` writes: the compiled skills for the
 * selection, and the root block beside them. Nothing in the repository is read
 * for ownership or written.
 */
export async function planPreview(
  factory: Factory,
  config: Config,
  cliVersion: string,
  out: string,
  options: PlanBuildOptions = {},
): Promise<PreviewPlan> {
  const plan: PreviewPlan = {
    out: out === "" ? "" : path.resolve(out),
    created: false,
    writes: [],
    errors: [],
    conflicts: [],
    warnings: [],
  };

  if (out === "") {
    plan.errors.push({
      level: "error",
      file: "--out",
      message: "--out needs a directory",
      fix: "Pass a directory, such as --out /tmp/preview-amp",
    });
    return plan;
  }

  const kind = await entryKind(plan.out);
  if (kind === "absent") {
    plan.created = true;
  } else if (kind === "other") {
    plan.errors.push(notADirectory(out));
    return plan;
  } else if ((await readdir(plan.out)).length > 0) {
    plan.conflicts.push(notEmpty(out));
    return plan;
  }

  const target = await canonical(plan.out);
  for (const forbidden of FORBIDDEN) {
    const location = await canonical(path.join(factory.root, ...forbidden.directory.split("/")));
    if (isInside(location, target)) {
      plan.errors.push(insideDestination(out, forbidden.label));
      return plan;
    }
  }

  // A caller that read `--env` has already resolved the selection; otherwise the
  // developer's process environment and Git config decide it.
  const selection =
    options.selection ??
    (await resolveSelection(factory.factoryYaml?.env ?? [], { root: factory.root }));
  plan.warnings.push(...selection.warnings);

  const desired = await desiredOutput(factory, config, cliVersion, selection);
  plan.warnings.push(...desired.warnings);
  if (desired.errors.length > 0) {
    plan.errors.push(...desired.errors);
    return plan;
  }

  for (const [directory, skills] of desired.skills) {
    for (const skill of skills) {
      plan.writes.push(...skillWrites(directory, skill));
    }
  }
  if (desired.agentsBlock !== undefined) {
    plan.writes.push({
      path: "AGENTS.md",
      content: Buffer.from(`${desired.agentsBlock}\n`, "utf8"),
    });
  }

  return plan;
}

export interface PreviewIo {
  /** Default: `writeFile(target, content, { flag: "wx" })`, which never overwrites. */
  writeFile?: (target: string, content: Buffer) => Promise<void>;
  /** Default: removes one file, or one empty directory. */
  remove?: (target: string) => Promise<void>;
}

interface Created {
  path: string;
  directory: boolean;
}

/** A failure the preview handles: it rolls back, then throws a MetafabError. */
class PreviewStop extends Error {
  constructor(
    readonly problem: Problem,
    readonly exitCode: ExitCode,
  ) {
    super(problem.message);
  }
}

function conflictProblem(target: string): Problem {
  return {
    level: "error",
    file: target,
    message: `${target} appeared while the preview was being written`,
    fix: "Choose a new directory or empty it, then run metafab build --out again",
  };
}

function writeProblem(target: string, error: unknown): Problem {
  const code = (error as NodeJS.ErrnoException | undefined)?.code ?? "error";
  return {
    level: "error",
    file: target,
    message: `Cannot write ${target}`,
    fix: `Check that it is writable and has space left (${code}), then run metafab build --out again`,
  };
}

function removeWarning(target: string): Problem {
  return {
    level: "warning",
    file: target,
    message: `Could not remove ${target}; remove it by hand`,
  };
}

async function removeEntry(target: string): Promise<void> {
  const info = await lstat(target);
  if (info.isDirectory()) await rmdir(target);
  else await rm(target);
}

/** A directory that stays because an entry inside it stayed, or because it is gone. */
function leftInPlace(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOTEMPTY" || code === "EEXIST" || code === "ENOENT";
}

/** Missing directories from the highest down to `target`, `target` last. */
async function missingChain(target: string): Promise<string[]> {
  const missing: string[] = [];
  let current = target;
  for (;;) {
    try {
      await lstat(current);
      return missing.reverse();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // ENOTDIR means a file above `current` is in the way; keep walking so the
      // walk finds it and the caller can report it as an entry that appeared.
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        throw new PreviewStop(writeProblem(current, error), ExitCode.Failed);
      }
      missing.push(current);
      const parent = path.dirname(current);
      if (parent === current) return missing.reverse();
      current = parent;
    }
  }
}

/**
 * Creates the preview's directories and files exclusively, so it never writes
 * into an entry it did not make. On a failure it removes every entry it created,
 * deepest first, and leaves a directory that existed before the run in place.
 */
export async function writePreview(
  plan: PreviewPlan,
  io: PreviewIo = {},
): Promise<BuildChange[]> {
  if (plan.writes.length === 0) return [];

  const write =
    io.writeFile ??
    (async (target: string, content: Buffer) => {
      await writeFile(target, content, { flag: "wx" });
    });
  const remove = io.remove ?? removeEntry;

  const created: Created[] = [];
  const made = new Set<string>();
  const changes: BuildChange[] = [];

  const record = (target: string, directory: boolean): void => {
    created.push({ path: target, directory });
    made.add(target);
  };

  const create = async (directory: string): Promise<void> => {
    try {
      await mkdir(directory);
      record(directory, true);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw new PreviewStop(writeProblem(directory, error), ExitCode.Failed);
      }
      // Above `out` another process may make a directory; it is not ours, and
      // not a conflict. At or below `out` the preflight saw nothing, so anything
      // there appeared while the preview was being written.
      if (isInside(plan.out, directory)) {
        throw new PreviewStop(conflictProblem(directory), ExitCode.NotOwned);
      }
    }
  };

  const rollback = async (): Promise<Problem[]> => {
    const warnings: Problem[] = [];
    const deepestFirst = [...created].sort((left, right) => right.path.length - left.path.length);
    for (const entry of deepestFirst) {
      try {
        await remove(entry.path);
      } catch (error) {
        if (entry.directory && leftInPlace(error)) continue;
        warnings.push(removeWarning(entry.path));
      }
    }
    return warnings;
  };

  try {
    for (const directory of await missingChain(plan.out)) {
      await create(directory);
    }

    for (const entry of plan.writes) {
      const target = path.join(plan.out, ...entry.path.split("/"));

      const chain = await missingChain(path.dirname(target));
      // The nearest directory that already exists is either `out`, one this run
      // made, or something that appeared after the preflight.
      const existing = chain.length > 0 ? path.dirname(chain[0]!) : path.dirname(target);
      if (isInside(plan.out, existing) && existing !== plan.out && !made.has(existing)) {
        throw new PreviewStop(conflictProblem(existing), ExitCode.NotOwned);
      }
      for (const directory of chain) {
        await create(directory);
      }

      try {
        await write(target, entry.content);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new PreviewStop(conflictProblem(target), ExitCode.NotOwned);
        }
        throw new PreviewStop(writeProblem(target, error), ExitCode.Failed);
      }
      record(target, false);
      if (entry.mode !== undefined) {
        try {
          await chmod(target, entry.mode);
        } catch (error) {
          throw new PreviewStop(writeProblem(target, error), ExitCode.Failed);
        }
      }
      changes.push({ path: entry.path, action: "created" });
    }

    return changes;
  } catch (error) {
    const warnings = await rollback();
    if (!(error instanceof PreviewStop)) throw error;

    const conflict = error.exitCode === ExitCode.NotOwned;
    throw new MetafabError(
      conflict ? "The preview conflicts with what is on disk." : "The preview could not be written.",
      {
        exitCode: error.exitCode,
        code: conflict ? "preview-conflict" : "preview-write-failed",
        problems: [error.problem, ...warnings],
        cause: error,
      },
    );
  }
}
