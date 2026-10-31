import { lstat, mkdir, mkdtemp, readdir, realpath, rm, stat } from "node:fs/promises";
import type { Stats } from "node:fs";
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

/**
 * Names npm never packs, even when `files` names the directory they are in:
 * `npm-packlist` applies these rules at every depth. They are left out only
 * when npm is a target, so a two-target publish carries the same files on both
 * and a Git-only publish keeps them; each path left out is reported.
 */
const NPM_IGNORED_NAMES = new Set([
  ".DS_Store",
  ".gitignore",
  ".lock-wscript",
  ".npmignore",
  ".npmrc",
  "npm-debug.log",
]);

/** Directories npm ignores with everything below them. */
const NPM_IGNORED_DIRECTORIES = new Set([".git", ".hg", ".svn", "archived-packages", "CVS"]);

/**
 * Whether `npm pack` would leave `name` out. The patterns are npm's defaults,
 * matched the way its per-directory walk matches them. `npm-packlist` also
 * ignores `node_modules`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
 * and `bun.lockb`, but only at the package root; staging writes nothing there
 * except `README.md` and `package.json`, so those rules never apply to a fab.
 */
function npmIgnores(name: string, parent: string): boolean {
  if (NPM_IGNORED_NAMES.has(name) || NPM_IGNORED_DIRECTORIES.has(name)) return true;
  if (name.startsWith("._") || name.startsWith(".wafpickle-")) return true;
  if (name.startsWith(".") && name.endsWith(".swp")) return true;
  if (name.endsWith(".orig")) return true;
  // `/build/config.gypi` is anchored to each directory, as npm's walkers are.
  return parent === "build" && name === "config.gypi";
}

function stagingError(
  message: string,
  code: string,
  problems: Problem[],
  exitCode: ExitCode = ExitCode.Failed,
): MetafabError {
  return new MetafabError(message, {
    exitCode,
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
 * npm cannot publish a name it never packs, so staging leaves the path out of
 * the fab instead of failing, and says so: the person asked for the fab, not
 * for that file to disappear.
 */
function npmIgnoredProblem(relativePath: string): Problem {
  return {
    level: "warning",
    file: `.factory/${relativePath}`,
    line: 1,
    message: `npm never packs .factory/${relativePath}, so it is left out of the fab`,
    fix: "Rename the path or remove it from .factory/; the name cannot be published",
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
  warnings: Problem[];
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
  /** Whether the names npm never packs are left out, as an npm publish needs. */
  npmFilter: boolean;
  /**
   * A Git-only publish, which must carry every file: Git cannot store a path
   * with a `.git` component, so staging refuses one instead of losing it.
   */
  gitOnly: boolean;
  destinationFactory: string;
  /** The real `.factory/` the links must stay inside. */
  rootReal: string;
  state: CopyState;
}

function destinationFor(context: CopyContext, relativePath: string): string {
  return path.join(context.destinationFactory, ...relativePath.split("/"));
}

interface ResolvedLink {
  /** The link's target, after following it. */
  resolved: string;
  info: Stats;
}

/**
 * Resolves a link, reporting by name the ways a link can leave the fab: it is
 * broken, it points outside `.factory/`, or its target is not a file or
 * directory. Every link is checked this way before staging decides to copy it,
 * so a link npm would drop still cannot pass unnoticed.
 */
async function resolveLink(
  linkPath: string,
  relativePath: string,
  context: CopyContext,
): Promise<ResolvedLink | undefined> {
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
    return undefined;
  }

  if (!isInsideAbsolute(context.rootReal, resolved)) {
    context.state.problems.push(
      fabProblem(
        relativePath,
        `Symlink .factory/${relativePath} points outside .factory/`,
        "Point it inside .factory/, or remove the symlink",
      ),
    );
    return undefined;
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
    return undefined;
  }

  if (!info.isFile() && !info.isDirectory()) {
    context.state.problems.push(
      fabProblem(
        relativePath,
        `Symlink .factory/${relativePath} does not point to a file or directory`,
        "Replace it with a regular file inside .factory/",
      ),
    );
    return undefined;
  }

  return { resolved, info };
}

/**
 * A link is published as the content of its target, the same decision `build`
 * makes for a skill. A link that leaves `.factory/` or loops stops the publish
 * by name instead of disappearing from the fab.
 */
async function copyLink(
  link: ResolvedLink,
  relativePath: string,
  context: CopyContext,
  ancestry: Set<string>,
): Promise<void> {
  const { resolved, info } = link;

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

  if (!fileAllowed(context.state, relativePath, info.size)) return;
  await copyFileWithMode(resolved, destinationFor(context, relativePath));
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
    // Both rules come before the link branch: a link named `README.md` at the
    // factory root leaves the fab too, and `.factory/README.md` may point
    // outside `.factory/` because it is read as the fab README, never copied.
    if (ALWAYS_EXCLUDED.has(relativePath)) continue;
    // Git reads a directory named `.git` as another repository and never adds
    // the files below it. An npm publish drops the name with a warning instead,
    // so only a Git-only fab, which has to carry everything, refuses it.
    if (context.gitOnly && name === ".git") {
      context.state.problems.push(
        fabProblem(
          relativePath,
          `Git cannot store .factory/${relativePath} in a fab`,
          "Rename the path, add it to publish.exclude, or publish to npm only",
        ),
      );
      continue;
    }

    const info = await lstat(absolute).catch(() => undefined);
    if (info === undefined) {
      context.state.problems.push(
        fabProblem(relativePath, `Cannot read .factory/${relativePath}`, "Check its permissions"),
      );
      continue;
    }

    if (info.isSymbolicLink()) {
      // The link is checked before the npm drop: a broken or escaping link
      // stops the publish even when its name is one npm never packs.
      const link = await resolveLink(absolute, relativePath, context);
      if (link === undefined) continue;
      if (context.npmFilter && npmIgnores(name, path.basename(prefix))) {
        context.state.warnings.push(npmIgnoredProblem(relativePath));
        continue;
      }
      if (!countEntry(context.state, relativePath)) return;
      await copyLink(link, relativePath, context, descendants);
      continue;
    }

    if (context.npmFilter && npmIgnores(name, path.basename(prefix))) {
      context.state.warnings.push(npmIgnoredProblem(relativePath));
      continue;
    }

    if (info.isDirectory()) {
      if (!countEntry(context.state, relativePath)) return;
      await walkFactory(absolute, relativePath, context, descendants);
      continue;
    }

    if (info.isFile()) {
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
 * modes, without `metafab.yaml`, without `.factory/README.md`, without every
 * `publish.exclude` glob and, when npm is a target, without the names `npm pack`
 * never carries (each one is reported as a warning).
 *
 * The copy follows the fab rules `import` applies, so a fab that would be
 * rejected on the way back in is never published: 1 MB per file, 64 MiB and
 * 10 000 entries in total, and no link that leaves `.factory/`. The staged
 * factory is then validated again, because an exclude can break a reference.
 *
 * A link is checked even when npm would leave its name out, and a Git-only fab
 * refuses a path with a `.git` component, which Git cannot store.
 */
export async function stageFab(factory: Factory, options: StageOptions = {}): Promise<StagedFab> {
  const isExcluded = exclusionMatcher(options.exclude ?? []);
  const targets = options.targets ?? [];
  const npmFilter = targets.includes("npm");
  const gitOnly = !npmFilter && targets.includes("git");

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
      throw stagingError(
        "Cannot read the factory directory.",
        "publish-invalid-fab",
        [
          fabProblem("", "Cannot resolve the .factory directory", "Restore the .factory directory"),
        ],
        ExitCode.InvalidFab,
      );
    }

    const state: CopyState = {
      problems: [],
      warnings: [],
      entries: 0,
      totalSize: 0,
      stopped: false,
    };
    await walkFactory(
      factory.dir,
      "",
      { isExcluded, npmFilter, gitOnly, destinationFactory: factoryDir, rootReal, state },
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
      // A staged fab that breaks the fab rules is an invalid fab, as import
      // reports it (exit 4), not a validation failure of the repository.
      throw stagingError(
        "The fab does not follow the fab rules.",
        "publish-invalid-fab",
        errors,
        ExitCode.InvalidFab,
      );
    }

    return {
      root,
      factoryDir,
      factory: staged,
      warnings: state.warnings,
      cleanup: () => rm(root, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
