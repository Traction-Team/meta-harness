import { lstat, mkdir, mkdtemp, readdir, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { copyFileWithMode } from "../../util/fs.js";
import { loadFactory } from "../factory/index.js";
import type { Factory } from "../factory/index.js";
import { isInsideAbsolute } from "../sources/containment.js";
import { MAX_FAB_ENTRIES, MAX_FAB_FILE_SIZE, MAX_FAB_TOTAL_SIZE } from "../sources/extract.js";
import { exclusionMatcher } from "./exclude.js";
import type { StageOptions, StagedFab } from "./types.js";

/** Files the fab format forbids inside `.factory/`; see Sharing: Fab layout. */
const ALWAYS_EXCLUDED = new Set(["metafab.yaml", "README.md"]);

function stagingError(message: string, code: string, problems: Problem[]): MetafabError {
  return new MetafabError(message, {
    exitCode: ExitCode.Failed,
    code,
    problems,
  });
}

function fabProblem(relativePath: string, message: string, fix: string): Problem {
  return {
    level: "error",
    file: relativePath === "" ? ".factory" : `.factory/${relativePath}`,
    line: 1,
    message,
    fix,
  };
}

/**
 * A workflow that `publish.exclude` removes while the pipeline still names it
 * leaves a fab whose `factory.yaml` points at nothing, so staging stops before
 * it copies a file.
 */
function excludedWorkflowProblems(
  factory: Factory,
  isExcluded: (relativePath: string) => boolean,
): Problem[] {
  const problems: Problem[] = [];

  for (const entry of factory.factoryYaml?.pipeline ?? []) {
    const workflow = factory.skills.find(
      (skill) => skill.isWorkflow && skill.name === entry.workflow,
    );
    if (workflow === undefined) continue;
    if (!isExcluded(`${workflow.relDir}/SKILL.md`)) continue;

    problems.push({
      level: "error",
      file: ".factory/factory.yaml",
      line: entry.line,
      message: `Pipeline names excluded workflow "${entry.workflow}"`,
      fix: `Remove "${workflow.relDir}" from publish.exclude or the workflow from the pipeline`,
    });
  }

  return problems;
}

/** What the staged copy has seen so far: the fab rules import enforces. */
interface CopyState {
  problems: Problem[];
  entries: number;
  totalSize: number;
  stopped: boolean;
}

/** Every file, directory and link is one entry, as in an archive import reads. */
function countEntry(state: CopyState, relativePath: string): boolean {
  state.entries += 1;
  if (state.entries <= MAX_FAB_ENTRIES) return true;
  state.problems.push(
    fabProblem(
      relativePath,
      `fabs with more than ${MAX_FAB_ENTRIES} files, directories and links are not allowed`,
      "Add project-only paths to publish.exclude",
    ),
  );
  state.stopped = true;
  return false;
}

function fileAllowed(state: CopyState, relativePath: string, size: number): boolean {
  if (size > MAX_FAB_FILE_SIZE) {
    state.problems.push(
      fabProblem(
        relativePath,
        `files larger than ${MAX_FAB_FILE_SIZE} bytes are not allowed in a fab`,
        "Add the file to publish.exclude, or keep fab files under 1 MB",
      ),
    );
    return false;
  }

  state.totalSize += size;
  if (state.totalSize > MAX_FAB_TOTAL_SIZE) {
    state.problems.push(
      fabProblem(
        relativePath,
        `files larger than ${MAX_FAB_TOTAL_SIZE} bytes in total are not allowed in a fab`,
        "Add project-only paths to publish.exclude",
      ),
    );
    state.stopped = true;
    return false;
  }

  return true;
}

interface CopyContext {
  isExcluded: (relativePath: string) => boolean;
  destinationFactory: string;
  /** The real `.factory/` the links must stay inside. */
  rootReal: string;
  state: CopyState;
}

function destinationFor(context: CopyContext, relativePath: string): string {
  return path.join(context.destinationFactory, ...relativePath.split("/"));
}

/**
 * A link is published as the content of its target, the same decision `build`
 * makes for a skill. A link that leaves `.factory/`, is broken, or loops stops
 * the publish by name instead of disappearing from the fab.
 */
async function copyLink(
  linkPath: string,
  relativePath: string,
  context: CopyContext,
  ancestry: Set<string>,
): Promise<void> {
  let resolved: string;
  try {
    resolved = await realpath(linkPath);
  } catch {
    context.state.problems.push(
      fabProblem(
        relativePath,
        `Symlink .factory/${relativePath} is broken`,
        "Replace it with a regular file inside .factory/, or remove the symlink",
      ),
    );
    return;
  }

  if (!isInsideAbsolute(context.rootReal, resolved)) {
    context.state.problems.push(
      fabProblem(
        relativePath,
        `Symlink .factory/${relativePath} points outside .factory/`,
        "Point it inside .factory/, or remove the symlink",
      ),
    );
    return;
  }

  const info = await stat(resolved).catch(() => undefined);
  if (info === undefined) {
    context.state.problems.push(
      fabProblem(
        relativePath,
        `Cannot read the target of symlink .factory/${relativePath}`,
        "Replace it with a regular file inside .factory/",
      ),
    );
    return;
  }

  if (info.isDirectory()) {
    if (ancestry.has(resolved)) {
      context.state.problems.push(
        fabProblem(
          relativePath,
          `Symlink .factory/${relativePath} creates a loop`,
          "Remove the symlink",
        ),
      );
      return;
    }
    await walkFactory(resolved, relativePath, context, ancestry);
    return;
  }

  if (info.isFile()) {
    if (!fileAllowed(context.state, relativePath, info.size)) return;
    await copyFileWithMode(resolved, destinationFor(context, relativePath));
    return;
  }

  context.state.problems.push(
    fabProblem(
      relativePath,
      `Symlink .factory/${relativePath} does not point to a file or directory`,
      "Replace it with a regular file inside .factory/",
    ),
  );
}

async function walkFactory(
  directory: string,
  prefix: string,
  context: CopyContext,
  ancestry: Set<string>,
): Promise<void> {
  if (context.state.stopped) return;

  let names: string[];
  try {
    names = (await readdir(directory)).sort();
  } catch {
    context.state.problems.push(
      fabProblem(prefix, `Cannot read .factory/${prefix}`, "Check its permissions"),
    );
    return;
  }

  let descendants = ancestry;
  try {
    descendants = new Set([...ancestry, await realpath(directory)]);
  } catch {
    // Keep the ancestors we have; the entries below still report their own problems.
  }

  for (const name of names) {
    if (context.state.stopped) return;

    const absolute = path.join(directory, name);
    const relativePath = prefix === "" ? name : `${prefix}/${name}`;
    if (context.isExcluded(relativePath)) continue;

    const info = await lstat(absolute).catch(() => undefined);
    if (info === undefined) {
      context.state.problems.push(
        fabProblem(relativePath, `Cannot read .factory/${relativePath}`, "Check its permissions"),
      );
      continue;
    }

    if (info.isSymbolicLink()) {
      if (!countEntry(context.state, relativePath)) return;
      await copyLink(absolute, relativePath, context, descendants);
      continue;
    }

    if (info.isDirectory()) {
      if (!countEntry(context.state, relativePath)) return;
      await walkFactory(absolute, relativePath, context, descendants);
      continue;
    }

    if (info.isFile()) {
      if (ALWAYS_EXCLUDED.has(relativePath)) continue;
      if (!countEntry(context.state, relativePath)) return;
      if (!fileAllowed(context.state, relativePath, info.size)) return;
      await copyFileWithMode(absolute, destinationFor(context, relativePath));
      continue;
    }

    context.state.problems.push(
      fabProblem(
        relativePath,
        `device files and FIFOs are not allowed in a fab`,
        "Remove it from .factory/",
      ),
    );
  }
}

/**
 * Copies `.factory/` into a temporary directory for publishing, keeping file
 * modes, without `metafab.yaml`, without `.factory/README.md` and without every
 * `publish.exclude` glob.
 *
 * The copy follows the fab rules `import` applies, so a fab that would be
 * rejected on the way back in is never published: 1 MB per file, 64 MiB and
 * 10 000 entries in total, and no link that leaves `.factory/`. The staged
 * factory is then validated again, because an exclude can break a reference.
 */
export async function stageFab(factory: Factory, options: StageOptions = {}): Promise<StagedFab> {
  const isExcluded = exclusionMatcher(options.exclude ?? []);

  const problems = excludedWorkflowProblems(factory, isExcluded);
  if (problems.length > 0) {
    throw stagingError(
      "The fab would lose a workflow that the pipeline names.",
      "publish-excluded-workflow",
      problems,
    );
  }

  const root = await mkdtemp(path.join(tmpdir(), "metafab-publish-"));
  const factoryDir = path.join(root, ".factory");

  try {
    await mkdir(factoryDir, { recursive: true });

    const rootReal = await realpath(factory.dir).catch(() => undefined);
    if (rootReal === undefined) {
      throw stagingError("Cannot read the factory directory.", "publish-invalid-fab", [
        fabProblem("", "Cannot resolve the .factory directory", "Restore the .factory directory"),
      ]);
    }

    const state: CopyState = { problems: [], entries: 0, totalSize: 0, stopped: false };
    await walkFactory(
      factory.dir,
      "",
      { isExcluded, destinationFactory: factoryDir, rootReal, state },
      new Set([rootReal]),
    );

    // An exclude can empty `.factory/` or break a reference; import would
    // reject such a fab, so publish refuses to build it.
    if ((await readdir(factoryDir)).length === 0) {
      state.problems.push(
        fabProblem(
          "",
          "The fab has no files in .factory/",
          "Remove the publish.exclude entries that leave .factory/ empty",
        ),
      );
    }

    const staged = await loadFactory(root);
    const errors = [...state.problems, ...staged.problems].filter(
      (problem) => problem.level === "error",
    );
    if (errors.length > 0) {
      throw stagingError("The fab does not follow the fab rules.", "publish-invalid-fab", errors);
    }

    return {
      root,
      factoryDir,
      factory: staged,
      cleanup: () => rm(root, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
