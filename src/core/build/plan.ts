import { chmod, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "../config/types.js";
import { CLAUDE_SKILLS_DIRECTORY, AGENTS_SKILLS_DIRECTORY } from "../config/destinations.js";
import { destinations } from "../config/destinations.js";
import type { Problem } from "../../errors.js";
import type { Factory } from "../factory/types.js";
import { isBinary, toLF } from "../../util/text.js";
import { isDirectory, pathExists } from "../../util/fs.js";
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
import { builtinComment, compileSkill, isOwned } from "./skill.js";
import type { CompiledSkill } from "./skill.js";

export interface BuildWrite {
  path: string;
  content: Buffer;
  mode?: number;
}

export interface BuildPlan {
  root: string;
  writes: BuildWrite[];
  removals: string[];
  conflicts: Problem[];
  warnings: Problem[];
  errors: Problem[];
}

export interface BuildChange {
  path: string;
  action: "created" | "updated" | "removed";
}

export interface BuildReport {
  changed: BuildChange[];
}

const SKILL_DESTINATIONS = [CLAUDE_SKILLS_DIRECTORY, AGENTS_SKILLS_DIRECTORY];

const BUILTIN_SKILL_DIR = fileURLToPath(
  new URL("../../../resources/metafab-skill", import.meta.url),
);

const IMPORT_AGENTS = /^@(\.\/)?AGENTS\.md\s*$/;

function absolute(root: string, relativePath: string): string {
  return path.join(root, ...relativePath.split("/"));
}

async function readTextIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
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
  files: { path: string; content: Buffer; mode?: number }[];
}

function skillWrites(destination: string, skill: DesiredSkill): BuildWrite[] {
  return skill.files.map((file) => ({
    path: `${destination}/${skill.name}/${file.path}`,
    content: file.content,
    ...(file.mode === undefined ? {} : { mode: file.mode }),
  }));
}

async function compileFactorySkills(factory: Factory, errors: Problem[]): Promise<DesiredSkill[]> {
  const desired: DesiredSkill[] = [];

  for (const skill of factory.skills) {
    const compiled: CompiledSkill = await compileSkill(
      {
        dir: path.join(factory.dir, ...skill.relDir.split("/")),
        name: skill.name,
        sourcePath: `.factory/${skill.relDir}`,
      },
      { factoryDir: factory.dir },
    );

    if (compiled.problems.length > 0) errors.push(...compiled.problems);
    desired.push({
      name: compiled.name,
      files: compiled.files.map((file) => ({
        path: file.path,
        content: file.content,
        ...(file.mode === undefined ? {} : { mode: file.mode }),
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
    { dir: BUILTIN_SKILL_DIR, name: "metafab", sourcePath: "resources/metafab-skill" },
    { factoryDir: BUILTIN_SKILL_DIR, comment: builtinComment(cliVersion) },
  );

  if (compiled.problems.length > 0) errors.push(...compiled.problems);

  return {
    name: "metafab",
    files: compiled.files.map((file) => ({
      path: file.path,
      content: file.content,
      ...(file.mode === undefined ? {} : { mode: file.mode }),
    })),
  };
}

async function readDirectoryIfExists(
  directory: string,
): Promise<import("node:fs").Dirent[] | undefined> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

interface ScanContext {
  root: string;
  selected: boolean;
  desired: Set<string>;
  removals: Set<string>;
  conflicts: Problem[];
}

async function scanDestination(context: ScanContext, directory: string): Promise<void> {
  const target = absolute(context.root, directory);
  if (!(await pathExists(target))) return;

  if (!(await isDirectory(target))) {
    context.conflicts.push({
      level: "error",
      file: directory,
      message: `${directory} is not a directory`,
      fix: "Move the file or rename it, then run metafab build again",
    });
    return;
  }

  const entries = (await readDirectoryIfExists(target)) ?? [];
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

  for (const entry of entries) {
    const relativePath = `${directory}/${entry.name}`;
    const owned = entry.isDirectory() && (await isOwned(absolute(context.root, relativePath)));

    if (context.selected) {
      if (entry.isDirectory() && context.desired.has(entry.name)) {
        if (!owned) {
          context.conflicts.push({
            level: "error",
            file: relativePath,
            message: `Unowned directory ${relativePath} is in the way`,
            fix: "Move it into .factory/skills/ or rename it",
          });
        }
        continue;
      }

      if (owned) {
        context.removals.add(relativePath);
        continue;
      }

      context.conflicts.push({
        level: "error",
        file: relativePath,
        message: entry.isDirectory()
          ? `Unowned directory ${relativePath} is in the way`
          : `Unowned file ${relativePath} is in the way`,
        fix: "Move it into .factory/skills/ or rename it",
      });
      continue;
    }

    if (owned) context.removals.add(relativePath);
  }
}

async function planEmptyDirectories(
  root: string,
  directory: string,
  removals: Set<string>,
): Promise<void> {
  const target = absolute(root, directory);
  const entries = await readDirectoryIfExists(target);
  if (entries === undefined || entries.length === 0) return;

  const removedChildren = entries.filter((entry) =>
    removals.has(`${directory}/${entry.name}`),
  );
  if (removedChildren.length === 0) return;

  const remaining = entries.filter((entry) => !removals.has(`${directory}/${entry.name}`));
  if (remaining.length > 0) return;

  removals.add(directory);

  const parent = path.posix.dirname(directory);
  if (parent === "." || parent === "") return;

  const parentTarget = absolute(root, parent);
  if (!(await isDirectory(parentTarget))) return;

  const parentEntries = await readDirectoryIfExists(parentTarget);
  if (parentEntries === undefined) return;
  const parentRemaining = parentEntries.filter(
    (entry) => !removals.has(`${parent}/${entry.name}`),
  );
  if (parentRemaining.length === 0) removals.add(parent);
}

function sameContent(existing: Buffer, desired: Buffer): boolean {
  if (isBinary(existing) || isBinary(desired)) return existing.equals(desired);
  return toLF(existing.toString("utf8")) === toLF(desired.toString("utf8"));
}

async function fileMatches(
  root: string,
  write: BuildWrite,
): Promise<{ exists: boolean; same: boolean }> {
  const target = absolute(root, write.path);
  let info;
  try {
    info = await stat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false, same: false };
    throw error;
  }

  if (!info.isFile()) return { exists: true, same: false };

  const existing = await readFile(target);
  const contentSame = sameContent(existing, write.content);
  const modeSame = write.mode === undefined || (info.mode & 0o777) === write.mode;
  return { exists: true, same: contentSame && modeSame };
}

export async function planBuild(
  factory: Factory,
  config: Config,
  cliVersion: string,
): Promise<BuildPlan> {
  const root = factory.root;
  const plan: BuildPlan = {
    root,
    writes: [],
    removals: [],
    conflicts: [],
    warnings: [],
    errors: [],
  };

  for (const problem of [...factory.problems, ...config.problems]) {
    if (problem.level === "error") plan.errors.push(problem);
  }

  const selectedDestinations = destinations(config.agents);
  const factorySkills = await compileFactorySkills(factory, plan.errors);
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
  for (const directory of SKILL_DESTINATIONS) {
    const desired = desiredPerDestination.get(directory);
    const context: ScanContext = {
      root,
      selected: desired !== undefined,
      desired: new Set((desired ?? []).map((skill) => skill.name)),
      removals,
      conflicts: plan.conflicts,
    };
    await scanDestination(context, directory);
  }

  for (const directory of SKILL_DESTINATIONS) {
    await planEmptyDirectories(root, directory, removals);
  }

  const agentsFile = "AGENTS.md";
  const agentsExisting = await readTextIfExists(absolute(root, agentsFile));
  const agentsSelected = selectedDestinations.length > 0;

  if (agentsSelected) {
    const block = renderAgentsBlockBody(factory);
    const result = planBlockFile(agentsExisting, AGENTS_MARKERS, agentsFile, block, true);
    if (result.error !== undefined) plan.errors.push(result.error);
    if (result.text !== undefined) {
      plan.writes.push({ path: agentsFile, content: Buffer.from(result.text, "utf8") });
    }
    if (result.removeFile === true) removals.add(agentsFile);

    const lineCount = agentsBlockLineCount(factory);
    if (lineCount > AGENTS_BLOCK_LINE_LIMIT) {
      plan.warnings.push({
        level: "warning",
        file: agentsFile,
        message: `The generated AGENTS.md block is ${lineCount} lines; the limit is ${AGENTS_BLOCK_LINE_LIMIT}`,
        fix: "Move detail into .factory/AGENTS.md sections and keep the root block short",
      });
    }
  } else {
    const result = planBlockFile(agentsExisting, AGENTS_MARKERS, agentsFile, undefined, true);
    if (result.error !== undefined) plan.errors.push(result.error);
    if (result.text !== undefined) {
      plan.writes.push({ path: agentsFile, content: Buffer.from(result.text, "utf8") });
    }
    if (result.removeFile === true) removals.add(agentsFile);
  }

  const claudeFile = "CLAUDE.md";
  const claudeSelected = config.agents.includes("claude");
  const claudeExisting = await readTextIfExists(absolute(root, claudeFile));

  if (claudeExisting !== undefined) {
    const found = findMarkerBlock(claudeExisting, CLAUDE_MARKERS);
    if (!found.ok) {
      plan.errors.push(markerProblem(claudeFile, found.problem));
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
            plan.writes.push({ path: claudeFile, content: Buffer.from(next, "utf8") });
          }
        }
      }
    } else if (found.range !== undefined) {
      const removed = removeMarkerBlock(claudeExisting, CLAUDE_MARKERS);
      if (!removed.ok) {
        plan.errors.push(markerProblem(claudeFile, removed.problem));
      } else if (removed.changed) {
        plan.writes.push({ path: claudeFile, content: Buffer.from(removed.text, "utf8") });
      }
    }
  }

  const gitignoreFile = ".gitignore";
  const gitignoreExisting = await readTextIfExists(absolute(root, gitignoreFile));
  const gitignoreLines = gitignoreBlockBody(config.agents);
  const gitignoreBody = gitignoreLines.length === 0 ? undefined : gitignoreLines.join("\n");
  const gitignoreResult = planBlockFile(
    gitignoreExisting,
    GITIGNORE_MARKERS,
    gitignoreFile,
    gitignoreBody,
  );
  if (gitignoreResult.error !== undefined) plan.errors.push(gitignoreResult.error);
  if (gitignoreResult.text !== undefined) {
    plan.writes.push({ path: gitignoreFile, content: Buffer.from(gitignoreResult.text, "utf8") });
  }
  if (gitignoreResult.removeFile === true) removals.add(gitignoreFile);

  plan.removals = [...removals].sort();
  return plan;
}

export async function applyBuild(plan: BuildPlan): Promise<BuildReport> {
  const changed: BuildChange[] = [];
  if (plan.errors.length > 0 || plan.conflicts.length > 0) return { changed };

  const existingRemovals: string[] = [];
  for (const removal of plan.removals) {
    if (await pathExists(absolute(plan.root, removal))) existingRemovals.push(removal);
  }

  const deepestFirst = [...existingRemovals].sort((left, right) => right.length - left.length);
  for (const removal of deepestFirst) {
    await rm(absolute(plan.root, removal), { recursive: true, force: true });
  }

  for (const write of plan.writes) {
    const target = absolute(plan.root, write.path);
    const comparison = await fileMatches(plan.root, write);
    if (comparison.same) continue;

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, write.content);
    if (write.mode !== undefined) await chmod(target, write.mode);
    changed.push({ path: write.path, action: comparison.exists ? "updated" : "created" });
  }

  for (const removal of existingRemovals) {
    changed.push({ path: removal, action: "removed" });
  }

  changed.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  return { changed };
}
