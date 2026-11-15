import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readlink,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "../config/types.js";
import { CLAUDE_SKILLS_DIRECTORY, AGENTS_SKILLS_DIRECTORY } from "../config/destinations.js";
import { destinations } from "../config/destinations.js";
import type { Problem } from "../../errors.js";
import type { Factory } from "../factory/types.js";
import { readdirTyped } from "../../util/fs.js";
import type { DirEntry } from "../../util/fs.js";
import { toLF } from "../../util/text.js";
import { sameFile } from "../sources/containment.js";
import {
  AGENTS_BLOCK_LINE_LIMIT,
  AGENTS_MARKERS,
  CLAUDE_MARKERS,
  GITIGNORE_MARKERS,
  agentsBlockLineCount,
  claudeBlockBody,
  gitignoreBlockBody,
  renderAgentsBlockBody,
} from "./agents.js";
import {
  appendMarkerBlock,
  findMarkerBlock,
  removeMarkerBlock,
  replaceMarkerBlock,
} from "./markers.js";
import type { MarkerLines, MarkerProblem, MarkerRange } from "./markers.js";
import {
  builtinComment,
  cannotReadProblem,
  compileSkill,
  isOwned,
  textContent,
} from "./skill.js";
import type { CompiledSkill, RenderFile } from "./skill.js";
import { syncGitHooks } from "../hooks/index.js";
import type { HookChange } from "../hooks/index.js";
import { parseMarkdown } from "../env/directives.js";
import { createImportCache } from "../env/imports.js";
import type { ImportCache } from "../env/imports.js";
import { renderDocument } from "../env/render.js";
import { allValues, classify } from "../env/scenarios.js";
import type { EnvSelection, EnvVariable, ResolvedSelection } from "../env/types.js";
import { resolveSelection } from "../env/select.js";

export interface BuildWrite {
  path: string;
  content: Buffer;
  mode?: number;
}

export interface BuildPlan {
  root: string;
  /** From `git-hooks` in `.factory/metafab.yaml`. */
  gitHooks: boolean;
  /** The CLI version that wrote the installed output and any Git hooks. */
  cliVersion: string;
  /** The environment selection this plan was made for. */
  selection: ResolvedSelection;
  writes: BuildWrite[];
  removals: string[];
  conflicts: Problem[];
  warnings: Problem[];
  errors: Problem[];
}

export interface PlanBuildOptions {
  /** A selection the caller already resolved, such as from `--env`. */
  selection?: ResolvedSelection;
}

export interface BuildChange {
  path: string;
  action: "created" | "updated" | "removed";
}

export interface BuildReport {
  changed: BuildChange[];
  hooks: HookChange[];
  hookWarnings: Problem[];
}

const SKILL_DESTINATIONS = [CLAUDE_SKILLS_DIRECTORY, AGENTS_SKILLS_DIRECTORY];

const BUILTIN_SKILL_DIR = fileURLToPath(
  new URL("../../../resources/metafab-skill", import.meta.url),
);

/** Installed name of the skill that `build` compiles from this package. */
const BUILTIN_SKILL_NAME = "metafab";

/**
 * Skill names that `build` installs from the package itself. Adoption must not
 * move a repository skill onto one of these names: the built-in copy would
 * shadow or overwrite the moved skill.
 */
export const BUILTIN_SKILL_NAMES: readonly string[] = [BUILTIN_SKILL_NAME];

const IMPORT_AGENTS = /^@(\.\/)?AGENTS\.md\s*$/;

function absolute(root: string, relativePath: string): string {
  return path.join(root, ...relativePath.split("/"));
}

async function lstatIfExists(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function markerProblem(file: string, problem: MarkerProblem): Problem {
  return {
    level: "error",
    file,
    line: problem.line,
    message: problem.message,
    fix: problem.fix,
  };
}

interface BlockPlan {
  text?: string;
  removeFile?: boolean;
  error?: Problem;
}

function planBlockFile(
  existing: string | undefined,
  markers: MarkerLines,
  file: string,
  body: string | undefined,
  removeWhenEmpty = false,
): BlockPlan {
  if (existing === undefined) {
    if (body === undefined) return {};
    const appended = appendMarkerBlock("", markers, body);
    if (!appended.ok) return { error: markerProblem(file, appended.problem) };
    return { text: appended.text };
  }

  const found = findMarkerBlock(existing, markers);
  if (!found.ok) return { error: markerProblem(file, found.problem) };

  if (body !== undefined) {
    const result =
      found.range === undefined
        ? appendMarkerBlock(existing, markers, body)
        : replaceMarkerBlock(existing, markers, body);
    if (!result.ok) return { error: markerProblem(file, result.problem) };
    return result.changed ? { text: result.text } : {};
  }

  if (found.range === undefined) return {};
  const removed = removeMarkerBlock(existing, markers);
  if (!removed.ok) return { error: markerProblem(file, removed.problem) };
  if (!removed.changed) return {};
  if (removed.text === "" && removeWhenEmpty) return { removeFile: true };
  return { text: removed.text };
}

function addBlockPlan(
  plan: BuildPlan,
  file: string,
  entry: RootEntry,
  result: BlockPlan,
  removals: Set<string>,
): void {
  if (result.error === undefined && result.text === undefined && result.removeFile !== true) {
    return;
  }

  const conflict = rootEntryConflict(file, entry.kind);
  if (conflict !== undefined) {
    plan.conflicts.push(conflict);
    return;
  }

  if (result.error !== undefined) {
    plan.errors.push(result.error);
    return;
  }

  if (result.text !== undefined) {
    plan.writes.push({ path: file, content: Buffer.from(result.text, "utf8") });
  }
  if (result.removeFile === true) removals.add(file);
}

function linesOutsideRange(text: string, range: MarkerRange | undefined): string[] {
  const lines = toLF(text).split("\n");
  if (range === undefined) return lines;
  return [...lines.slice(0, range.start), ...lines.slice(range.end + 1)];
}

function importsAgents(text: string, range: MarkerRange | undefined): boolean {
  return linesOutsideRange(text, range).some((line) => IMPORT_AGENTS.test(line));
}

function claudeBlock(): string {
  return [CLAUDE_MARKERS.start, claudeBlockBody(), CLAUDE_MARKERS.end].join("\n");
}

interface DesiredSkill {
  name: string;
  files: { path: string; content: Buffer; mode: number }[];
}

function skillWrites(destination: string, skill: DesiredSkill): BuildWrite[] {
  return skill.files.map((file) => ({
    path: `${destination}/${skill.name}/${file.path}`,
    content: file.content,
    mode: file.mode,
  }));
}

/**
 * A `compileSkill` renderer for one skill: each Markdown file's body is parsed
 * and rendered for the selection, with imports expanded. A document with an
 * error is left as it is, because `build` stops on those errors before it writes
 * anything; a warning still renders, so an unclosed fence only turns its own
 * directive lines into text.
 */
function markdownRenderer(
  sourcePath: string,
  route: string,
  variables: readonly EnvVariable[],
  selection: EnvSelection,
  imports: ImportCache,
): (file: RenderFile) => Promise<string> {
  return async (file) => {
    const document = await parseMarkdown(file.text, {
      file: `${sourcePath}/${file.relative}`,
      firstLine: file.firstLine,
      variables,
      imports,
      route: `${route}/${file.relative}`,
      chain: [],
    });
    if (document.problems.some((problem) => problem.level === "error")) return file.text;
    return renderDocument(document, { variables, selection });
  };
}

/**
 * The `.factory/AGENTS.md` text for the root block. A format 2 factory renders it
 * for every declared value of every variable, so the committed block is the same
 * for every developer; a format 1 factory keeps it as written. As for a skill,
 * only an error leaves the text unrendered.
 */
async function standingInstructions(
  factory: Factory,
  imports: ImportCache,
): Promise<string | undefined> {
  const text = factory.agentsMd;
  const yaml = factory.factoryYaml;
  if (text === undefined || yaml === undefined || yaml.format !== 2) return text;

  const document = await parseMarkdown(text, {
    file: ".factory/AGENTS.md",
    firstLine: 1,
    variables: yaml.env,
    imports,
    route: "AGENTS.md",
    chain: [],
  });
  if (document.problems.some((problem) => problem.level === "error")) return text;
  return renderDocument(document, { variables: yaml.env, selection: allValues(yaml.env) });
}

/**
 * Compiles the factory's skills for the selection. A skill whose `skills`
 * condition is false for it is left out, so `scanDestination` removes its owned
 * output as for a deleted skill; a partial match installs with its label.
 */
async function compileFactorySkills(
  factory: Factory,
  plan: BuildPlan,
  imports: ImportCache,
): Promise<DesiredSkill[]> {
  const desired: DesiredSkill[] = [];
  const yaml = factory.factoryYaml;
  const formatTwo = yaml?.format === 2;
  const variables = yaml?.env ?? [];
  const conditions = formatTwo ? yaml.skills : [];
  const selection = plan.selection.selection;

  for (const skill of factory.skills) {
    const sourcePath = `.factory/${skill.relDir}`;
    let appliesOnly: string | undefined;

    const condition = conditions.find((entry) => entry.name === skill.name)?.condition;
    if (condition !== undefined) {
      const applies = classify(condition, [], selection, variables);
      if (applies.kind === "none") continue;
      if (applies.kind === "some") appliesOnly = applies.label;
    }

    const compiled: CompiledSkill = await compileSkill(
      {
        dir: path.join(factory.dir, ...skill.relDir.split("/")),
        name: skill.name,
        sourcePath,
      },
      {
        factoryDir: factory.dir,
        render: formatTwo
          ? markdownRenderer(sourcePath, skill.relDir, variables, selection, imports)
          : undefined,
        appliesOnly,
      },
    );

    if (compiled.problems.length > 0) plan.errors.push(...compiled.problems);
    desired.push({
      name: compiled.name,
      files: compiled.files.map((file) => ({
        path: file.path,
        content: file.content,
        mode: file.mode,
      })),
    });
  }

  return desired;
}

async function compileBuiltinSkill(
  config: Config,
  cliVersion: string,
  errors: Problem[],
): Promise<DesiredSkill | undefined> {
  if (!config.metafabSkill) return undefined;

  const compiled = await compileSkill(
    { dir: BUILTIN_SKILL_DIR, name: BUILTIN_SKILL_NAME, sourcePath: "resources/metafab-skill" },
    { factoryDir: BUILTIN_SKILL_DIR, comment: builtinComment(cliVersion) },
  );

  if (compiled.problems.length > 0) errors.push(...compiled.problems);

  return {
    name: BUILTIN_SKILL_NAME,
    files: compiled.files.map((file) => ({
      path: file.path,
      content: file.content,
      mode: file.mode,
    })),
  };
}

function permissionProblem(relativePath: string, error: unknown): Problem | undefined {
  const code = (error as NodeJS.ErrnoException).code;
  if (code !== "EACCES" && code !== "EPERM") return undefined;
  return cannotReadProblem(relativePath);
}

function dedupeErrors(errors: readonly Problem[]): Problem[] {
  const seen = new Set<string>();
  return errors.filter((problem) => {
    const key = `${problem.file}\u0000${problem.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readDirectoryIfExists(
  directory: string,
  relativePath: string,
  errors?: Problem[],
): Promise<DirEntry[] | undefined> {
  try {
    return await readdirTyped(directory);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    const problem = permissionProblem(relativePath, error);
    if (problem === undefined) throw error;
    errors?.push(problem);
    return undefined;
  }
}

function directoryChainProblem(relativePath: string, info: import("node:fs").Stats): Problem | undefined {
  if (info.isSymbolicLink()) {
    return {
      level: "error",
      file: relativePath,
      message: `${relativePath} is a symbolic link, not a directory`,
      fix: "Remove the symbolic link, then run metafab build again",
    };
  }
  if (!info.isDirectory()) {
    return {
      level: "error",
      file: relativePath,
      message: `${relativePath} is a file, not a directory`,
      fix: "Move the file or rename it, then run metafab build again",
    };
  }
  return undefined;
}

interface DestinationChain {
  traversable: boolean;
  symlink?: boolean;
  problem?: Problem;
  readError?: Problem;
}

async function inspectDestinationChain(
  root: string,
  directory: string,
): Promise<DestinationChain> {
  let current = "";
  let previous: string | undefined;
  for (const part of directory.split("/")) {
    previous = current === "" ? undefined : current;
    current = current === "" ? part : `${current}/${part}`;

    let info;
    try {
      info = await lstatIfExists(absolute(root, current));
    } catch (error) {
      // An lstat on a child fails with EACCES when a component above it cannot be
      // searched, so name the component that actually blocks the traversal.
      const code = (error as NodeJS.ErrnoException).code;
      const blocked =
        (code === "EACCES" || code === "EPERM") && previous !== undefined ? previous : current;
      return { traversable: false, readError: cannotReadProblem(blocked) };
    }

    if (info === undefined) return { traversable: true };
    const problem = directoryChainProblem(current, info);
    if (problem !== undefined) {
      return { traversable: false, symlink: info.isSymbolicLink(), problem };
    }
  }
  return { traversable: true };
}

type RootEntryKind = "absent" | "file" | "symlink" | "other";

interface RootEntry {
  kind: RootEntryKind;
  text?: string;
  readError?: boolean;
  problem?: Problem;
}

async function readRootEntry(root: string, relativePath: string): Promise<RootEntry> {
  const target = absolute(root, relativePath);
  const info = await lstatIfExists(target);
  if (info === undefined) return { kind: "absent" };

  if (info.isSymbolicLink()) {
    try {
      return { kind: "symlink", text: await readFile(target, "utf8") };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "EISDIR" || code === "ENOTDIR") {
        return { kind: "symlink" };
      }
      return { kind: "symlink", readError: true };
    }
  }

  if (info.isFile()) {
    try {
      return { kind: "file", text: await readFile(target, "utf8") };
    } catch (error) {
      const problem = permissionProblem(relativePath, error);
      if (problem === undefined) throw error;
      return { kind: "file", problem };
    }
  }
  return { kind: "other" };
}

function symlinkReadConflict(relativePath: string): Problem {
  return {
    level: "error",
    file: relativePath,
    message: `${relativePath} is a symbolic link that metafab build cannot read`,
    fix: "Remove the symbolic link or replace it with a real file, then run metafab build again",
  };
}

function rootEntryConflict(relativePath: string, kind: RootEntryKind): Problem | undefined {
  if (kind === "symlink") {
    return {
      level: "error",
      file: relativePath,
      message: `${relativePath} is a symbolic link, not a regular file`,
      fix: "Remove the symbolic link, then run metafab build again",
    };
  }
  if (kind === "other") {
    return {
      level: "error",
      file: relativePath,
      message: `${relativePath} is not a regular file`,
      fix: "Move it or rename it, then run metafab build again",
    };
  }
  return undefined;
}

async function claudeLinksToRootAgents(root: string, entry: RootEntry): Promise<boolean> {
  if (entry.kind !== "symlink") return false;

  const claudePath = absolute(root, "CLAUDE.md");
  const agentsPath = absolute(root, "AGENTS.md");

  let rootReal = root;
  try {
    rootReal = await realpath(root);
  } catch {
    // Keep the lexical root; the comparisons below still work on a normal checkout.
  }

  try {
    const [claudeStat, agentsStat] = await Promise.all([
      stat(claudePath, { bigint: true }),
      stat(agentsPath, { bigint: true }),
    ]);
    if (sameFile(claudeStat, agentsStat)) return true;
  } catch {
    // Either side is missing; the link may still dangle towards AGENTS.md.
  }

  try {
    const [claudeReal, agentsReal] = await Promise.all([realpath(claudePath), realpath(agentsPath)]);
    if (claudeReal === agentsReal) return true;
  } catch {
    // Fall through to the link target.
  }

  let resolved: string;
  try {
    const link = await readlink(claudePath);
    resolved = path.resolve(rootReal, link);
  } catch {
    return false;
  }

  try {
    if ((await lstatIfExists(resolved)) !== undefined) {
      return resolved === agentsPath;
    }
  } catch {
    return false;
  }

  try {
    const parentReal = await realpath(path.dirname(resolved));
    return path.join(parentReal, path.basename(resolved)) === path.join(rootReal, "AGENTS.md");
  } catch {
    return false;
  }
}

async function symlinkedEntry(relativePath: string, target: string): Promise<Problem> {
  let directory = false;
  try {
    directory = (await stat(target)).isDirectory();
  } catch {
    directory = false;
  }

  return {
    level: "error",
    file: relativePath,
    message: directory
      ? `${relativePath} is a symbolic link, not a directory`
      : `${relativePath} is a symbolic link, not a regular file`,
    fix: directory
      ? "Remove the symbolic link or replace it with a real directory, then run metafab build again"
      : "Remove the symbolic link or replace it with a real file, then run metafab build again",
  };
}

interface DesiredFileTree {
  files: Set<string>;
  directories: Set<string>;
}

interface ScanContext {
  root: string;
  selected: boolean;
  desired: Map<string, DesiredFileTree>;
  removals: Set<string>;
  conflicts: Problem[];
  errors: Problem[];
}

function desiredFileTree(skill: DesiredSkill): DesiredFileTree {
  const files = new Set<string>();
  const directories = new Set<string>();

  for (const file of skill.files) {
    files.add(file.path);
    let directory = path.posix.dirname(file.path);
    while (directory !== "." && directory !== "") {
      directories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }

  return { files, directories };
}

function unownedEntry(relativePath: string, directory: boolean): Problem {
  return {
    level: "error",
    file: relativePath,
    message: directory
      ? `Unowned directory ${relativePath} is in the way`
      : `Unowned file ${relativePath} is in the way`,
    fix: "Move it into .factory/skills/, or run metafab init to adopt it",
  };
}

async function reconcileOwnedDirectory(
  target: string,
  installedPath: string,
  skillPath: string,
  desired: DesiredFileTree,
  removals: Set<string>,
  errors: Problem[],
): Promise<void> {
  const entries = (await readDirectoryIfExists(target, installedPath, errors)) ?? [];
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

  for (const entry of entries) {
    const childInstalled = `${installedPath}/${entry.name}`;
    const childSkill = skillPath === "" ? entry.name : `${skillPath}/${entry.name}`;

    if (desired.files.has(childSkill)) {
      if (!entry.isFile()) removals.add(childInstalled);
      continue;
    }

    if (desired.directories.has(childSkill)) {
      if (entry.isDirectory()) {
        await reconcileOwnedDirectory(
          path.join(target, entry.name),
          childInstalled,
          childSkill,
          desired,
          removals,
          errors,
        );
      } else {
        removals.add(childInstalled);
      }
      continue;
    }

    removals.add(childInstalled);
  }
}

async function scanDestination(context: ScanContext, directory: string): Promise<void> {
  const target = absolute(context.root, directory);
  const info = await lstatIfExists(target);
  if (info === undefined) return;

  if (!info.isDirectory()) {
    if (context.selected) {
      const symlink = info.isSymbolicLink();
      context.conflicts.push({
        level: "error",
        file: directory,
        message: symlink
          ? `${directory} is a symbolic link, not a directory`
          : `${directory} is a file, not a directory`,
        fix: symlink
          ? "Remove the symbolic link, then run metafab build again"
          : "Move the file or rename it, then run metafab build again",
      });
    }
    return;
  }

  const entries = (await readDirectoryIfExists(target, directory, context.errors)) ?? [];
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

  for (const entry of entries) {
    const relativePath = `${directory}/${entry.name}`;

    if (entry.isSymbolicLink()) {
      if (context.selected) {
        context.conflicts.push(
          await symlinkedEntry(relativePath, absolute(context.root, relativePath)),
        );
      }
      continue;
    }

    const ownedResult = entry.isDirectory()
      ? await isOwned(absolute(context.root, relativePath), relativePath)
      : false;

    if (typeof ownedResult !== "boolean") {
      context.errors.push(ownedResult);
      continue;
    }
    const owned = ownedResult;

    if (context.selected) {
      if (!owned) {
        context.conflicts.push(unownedEntry(relativePath, entry.isDirectory()));
        continue;
      }

      const desired = context.desired.get(entry.name);
      if (desired === undefined) {
        context.removals.add(relativePath);
        continue;
      }

      await reconcileOwnedDirectory(
        absolute(context.root, relativePath),
        relativePath,
        "",
        desired,
        context.removals,
        context.errors,
      );
      continue;
    }

    if (owned) context.removals.add(relativePath);
  }
}

async function deselectedSymlinkConflict(
  root: string,
  directory: string,
  linkPath: string,
): Promise<Problem | { error: Problem } | undefined> {
  const target = absolute(root, directory);
  let entries: DirEntry[];
  try {
    entries = await readdirTyped(target);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    return symlinkReadConflict(linkPath);
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relativePath = `${directory}/${entry.name}`;
    const owned = await isOwned(path.join(target, entry.name), relativePath);
    if (typeof owned !== "boolean") return { error: owned };
    if (!owned) continue;
    return {
      level: "error",
      file: linkPath,
      message: `${linkPath} is a symbolic link, and ${directory} behind it holds owned output that metafab build cannot remove`,
      fix: "Remove the owned output by hand or replace the symbolic link with a real directory, then run metafab build again",
    };
  }

  return undefined;
}

function hasWriteAtOrBeneath(writes: readonly string[], directory: string): boolean {
  const prefix = `${directory}/`;
  return writes.some((write) => write === directory || write.startsWith(prefix));
}

async function planEmptyDirectories(
  root: string,
  directory: string,
  removals: Set<string>,
  writes: readonly string[],
  errors: Problem[],
): Promise<void> {
  const target = absolute(root, directory);
  const info = await lstatIfExists(target);
  if (info === undefined || !info.isDirectory()) return;
  const entries = await readDirectoryIfExists(target, directory, errors);
  if (entries === undefined || entries.length === 0) return;

  const removedChildren = entries.filter((entry) =>
    removals.has(`${directory}/${entry.name}`),
  );
  if (removedChildren.length === 0) return;

  const remaining = entries.filter((entry) => !removals.has(`${directory}/${entry.name}`));
  if (remaining.length > 0) return;
  if (hasWriteAtOrBeneath(writes, directory)) return;

  removals.add(directory);

  const parent = path.posix.dirname(directory);
  if (parent === "." || parent === "") return;

  const parentTarget = absolute(root, parent);
  const parentInfo = await lstatIfExists(parentTarget);
  if (parentInfo === undefined || !parentInfo.isDirectory()) return;

  const parentEntries = await readDirectoryIfExists(parentTarget, parent, errors);
  if (parentEntries === undefined) return;
  const parentRemaining = parentEntries.filter(
    (entry) => !removals.has(`${parent}/${entry.name}`),
  );
  if (parentRemaining.length === 0 && !hasWriteAtOrBeneath(writes, parent)) {
    removals.add(parent);
  }
}

function sameContent(existing: Buffer, desired: Buffer): boolean {
  const existingText = textContent(existing);
  const desiredText = textContent(desired);
  if (existingText === undefined || desiredText === undefined) return existing.equals(desired);
  return toLF(existingText) === toLF(desiredText);
}

export interface FileMatch {
  exists: boolean;
  contentSame: boolean;
  modeSame: boolean;
  /** Installed permission bits, when the path is a regular file. */
  mode?: number;
  /** Content and mode both match, so `build` would leave the file alone. */
  same: boolean;
}

export async function fileMatches(root: string, write: BuildWrite): Promise<FileMatch> {
  const target = absolute(root, write.path);
  const info = await lstatIfExists(target);
  if (info === undefined) {
    return { exists: false, contentSame: false, modeSame: false, same: false };
  }

  if (!info.isFile()) {
    return { exists: true, contentSame: false, modeSame: false, same: false };
  }

  const existing = await readFile(target);
  const contentSame = sameContent(existing, write.content);
  const mode = info.mode & 0o777;
  // Windows has no permission bits to compare; content alone decides.
  const modeSame =
    process.platform === "win32" || write.mode === undefined || mode === (write.mode & 0o777);
  return { exists: true, contentSame, modeSame, mode, same: contentSame && modeSame };
}

export async function planBuild(
  factory: Factory,
  config: Config,
  cliVersion: string,
  options: PlanBuildOptions = {},
): Promise<BuildPlan> {
  const root = factory.root;
  // A caller that read `--env` has already resolved the selection; otherwise the
  // developer's process environment and Git config decide it.
  const selection =
    options.selection ??
    (await resolveSelection(factory.factoryYaml?.env ?? [], { root }));
  const plan: BuildPlan = {
    root,
    gitHooks: config.gitHooks,
    cliVersion,
    selection,
    writes: [],
    removals: [],
    conflicts: [],
    warnings: [...selection.warnings],
    errors: [],
  };

  for (const problem of [...factory.problems, ...config.problems]) {
    if (problem.level === "error") plan.errors.push(problem);
  }

  const selectedDestinations = destinations(config.agents);
  // One import cache per run, shared by every skill and the standing
  // instructions, so a partial is read once however many files import it.
  const imports = createImportCache(factory.dir);
  const factorySkills = await compileFactorySkills(factory, plan, imports);
  const builtin = await compileBuiltinSkill(config, cliVersion, plan.errors);

  const desiredPerDestination = new Map<string, DesiredSkill[]>();
  for (const destination of selectedDestinations) {
    const skills = [...factorySkills];
    if (builtin !== undefined) skills.push(builtin);
    desiredPerDestination.set(destination.directory, skills);
    for (const skill of skills) {
      plan.writes.push(...skillWrites(destination.directory, skill));
    }
  }

  const removals = new Set<string>();
  const untraversable = new Set<string>();
  for (const directory of SKILL_DESTINATIONS) {
    const desired = desiredPerDestination.get(directory);
    const selected = desired !== undefined;
    const chain = await inspectDestinationChain(root, directory);
    if (!chain.traversable) {
      untraversable.add(directory);
      if (chain.readError !== undefined) plan.errors.push(chain.readError);
      if (chain.problem !== undefined) {
        if (selected) {
          plan.conflicts.push(chain.problem);
        } else if (chain.symlink === true) {
          const result = await deselectedSymlinkConflict(root, directory, chain.problem.file);
          if (result !== undefined) {
            if ("error" in result) plan.errors.push(result.error);
            else plan.conflicts.push(result);
          }
        }
      }
      continue;
    }

    const context: ScanContext = {
      root,
      selected,
      desired: new Map((desired ?? []).map((skill) => [skill.name, desiredFileTree(skill)])),
      removals,
      conflicts: plan.conflicts,
      errors: plan.errors,
    };
    await scanDestination(context, directory);
  }

  for (const directory of SKILL_DESTINATIONS) {
    if (untraversable.has(directory)) continue;
    await planEmptyDirectories(
      root,
      directory,
      removals,
      plan.writes.map((write) => write.path),
      plan.errors,
    );
  }

  const agentsFile = "AGENTS.md";
  const agentsEntry = await readRootEntry(root, agentsFile);
  const agentsSelected = selectedDestinations.length > 0;
  // Rendered for every value, so the committed block is the same for everyone.
  const standing = agentsSelected ? await standingInstructions(factory, imports) : undefined;

  if (agentsEntry.problem !== undefined) {
    plan.errors.push(agentsEntry.problem);
  } else if (agentsEntry.readError === true) {
    plan.conflicts.push(symlinkReadConflict(agentsFile));
  } else {
    const agentsResult = agentsSelected
      ? planBlockFile(
          agentsEntry.text,
          AGENTS_MARKERS,
          agentsFile,
          renderAgentsBlockBody(factory, standing),
          true,
        )
      : planBlockFile(agentsEntry.text, AGENTS_MARKERS, agentsFile, undefined, true);
    addBlockPlan(plan, agentsFile, agentsEntry, agentsResult, removals);
  }

  if (agentsSelected) {
    const lineCount = agentsBlockLineCount(factory, standing);
    if (lineCount > AGENTS_BLOCK_LINE_LIMIT) {
      plan.warnings.push({
        level: "warning",
        file: agentsFile,
        message: `The generated AGENTS.md block is ${lineCount} lines; the limit is ${AGENTS_BLOCK_LINE_LIMIT}`,
        fix: "Move detail into .factory/AGENTS.md sections and keep the root block short",
      });
    }
  }

  const claudeFile = "CLAUDE.md";
  const claudeSelected = config.agents.includes("claude");
  const claudeEntry = await readRootEntry(root, claudeFile);
  const claudeFollowsAgents = await claudeLinksToRootAgents(root, claudeEntry);

  if (claudeEntry.problem !== undefined) {
    plan.errors.push(claudeEntry.problem);
  } else if (claudeEntry.readError === true) {
    plan.conflicts.push(symlinkReadConflict(claudeFile));
  } else if (!claudeFollowsAgents && claudeEntry.kind !== "absent") {
    const claudeExisting = claudeEntry.text ?? "";
    const found = findMarkerBlock(claudeExisting, CLAUDE_MARKERS);
    if (!found.ok) {
      const conflict = rootEntryConflict(claudeFile, claudeEntry.kind);
      if (conflict !== undefined) plan.conflicts.push(conflict);
      else plan.errors.push(markerProblem(claudeFile, found.problem));
    } else if (claudeSelected) {
      if (!importsAgents(claudeExisting, found.range)) {
        const without =
          found.range === undefined
            ? { ok: true as const, text: claudeExisting }
            : removeMarkerBlock(claudeExisting, CLAUDE_MARKERS);
        if (!without.ok) {
          plan.errors.push(markerProblem(claudeFile, without.problem));
        } else {
          const rest = toLF(without.text).replace(/^\n+/, "");
          const block = claudeBlock();
          const next = rest === "" ? `${block}\n` : `${block}\n\n${rest}`;
          if (next !== claudeExisting) {
            const conflict = rootEntryConflict(claudeFile, claudeEntry.kind);
            if (conflict !== undefined) {
              plan.conflicts.push(conflict);
            } else {
              plan.writes.push({ path: claudeFile, content: Buffer.from(next, "utf8") });
            }
          }
        }
      }
    } else if (found.range !== undefined) {
      const removed = removeMarkerBlock(claudeExisting, CLAUDE_MARKERS);
      if (!removed.ok) {
        plan.errors.push(markerProblem(claudeFile, removed.problem));
      } else if (removed.changed) {
        const conflict = rootEntryConflict(claudeFile, claudeEntry.kind);
        if (conflict !== undefined) {
          plan.conflicts.push(conflict);
        } else {
          plan.writes.push({ path: claudeFile, content: Buffer.from(removed.text, "utf8") });
        }
      }
    }
  }

  const gitignoreFile = ".gitignore";
  const gitignoreEntry = await readRootEntry(root, gitignoreFile);
  if (gitignoreEntry.problem !== undefined) {
    plan.errors.push(gitignoreEntry.problem);
  } else if (gitignoreEntry.readError === true) {
    plan.conflicts.push(symlinkReadConflict(gitignoreFile));
  } else {
    const gitignoreLines = gitignoreBlockBody(config.agents);
    const gitignoreBody = gitignoreLines.length === 0 ? undefined : gitignoreLines.join("\n");
    const gitignoreResult = planBlockFile(
      gitignoreEntry.text,
      GITIGNORE_MARKERS,
      gitignoreFile,
      gitignoreBody,
    );
    addBlockPlan(plan, gitignoreFile, gitignoreEntry, gitignoreResult, removals);
  }

  plan.removals = [...removals].sort();
  plan.errors = dedupeErrors(plan.errors);
  return plan;
}

function hookFailureWarning(error: unknown): Problem {
  const code = (error as NodeJS.ErrnoException).code ?? "error";
  return {
    level: "warning",
    file: ".factory/metafab.yaml",
    message: `Git hooks could not be synced: ${code}`,
    fix: "Check the permissions of the repository's hooks directory, then run metafab build again",
  };
}

export async function applyBuild(plan: BuildPlan): Promise<BuildReport> {
  const changed: BuildChange[] = [];
  if (plan.errors.length > 0 || plan.conflicts.length > 0) {
    return { changed, hooks: [], hookWarnings: [] };
  }

  const existingRemovals: string[] = [];
  for (const removal of plan.removals) {
    if ((await lstatIfExists(absolute(plan.root, removal))) !== undefined) {
      existingRemovals.push(removal);
    }
  }

  const deepestFirst = [...existingRemovals].sort((left, right) => right.length - left.length);
  for (const removal of deepestFirst) {
    await rm(absolute(plan.root, removal), { recursive: true, force: true });
  }

  const removed = new Set(existingRemovals);
  const writePaths = plan.writes.map((write) => write.path);
  const written = new Set(writePaths);
  for (const write of plan.writes) {
    const target = absolute(plan.root, write.path);
    const comparison = await fileMatches(plan.root, write);
    if (comparison.same) continue;

    await mkdir(path.dirname(target), { recursive: true });
    // Repair the mode before writing: a read-only installed file (0444) cannot
    // be truncated, and an executable one keeps its target mode.
    if (comparison.exists && write.mode !== undefined) {
      const info = await lstatIfExists(target);
      if (info?.isFile() === true) await chmod(target, write.mode);
    }
    await writeFile(target, write.content);
    if (write.mode !== undefined) await chmod(target, write.mode);
    changed.push({
      path: write.path,
      action: comparison.exists || removed.has(write.path) ? "updated" : "created",
    });
  }

  for (const removal of existingRemovals) {
    if (written.has(removal)) continue;
    if (writePaths.some((writePath) => writePath.startsWith(`${removal}/`))) {
      changed.push({ path: removal, action: "updated" });
      continue;
    }
    changed.push({ path: removal, action: "removed" });
  }

  changed.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );

  // Hooks follow the config like any other build output, but they are local, so
  // they are applied only here: `planBuild` and `check` never touch them. A
  // hook problem never fails the build.
  try {
    const sync = await syncGitHooks(plan.root, plan.gitHooks, plan.cliVersion);
    return { changed, hooks: sync.changed, hookWarnings: sync.warnings };
  } catch (error) {
    return { changed, hooks: [], hookWarnings: [hookFailureWarning(error)] };
  }
}
