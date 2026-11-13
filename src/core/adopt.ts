import { cp, lstat, mkdir, readFile, readlink, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { ExitCode, MetafabError } from "../errors.js";
import type { Problem } from "../errors.js";
import type { RequiredValue } from "../input.js";
import { readdirTyped } from "../util/fs.js";
import { parseFrontmatter } from "../util/frontmatter.js";
import type { FrontmatterResult } from "../util/frontmatter.js";
import { equalIgnoringEOL } from "../util/text.js";
import { BUILTIN_SKILL_NAMES } from "./build/plan.js";
import { compileSkill, isOwned, textContent } from "./build/skill.js";
import { setSkillLines } from "./factory/lines.js";
import {
  rule1RequiredFields,
  rule2NameMatchesDirectory,
  rule3NoNestedSkills,
  rule5NameFormat,
  rule6SkillGrammar,
  rule10ReservedPrefix,
} from "./factory/validate.js";
import type { Factory, Skill } from "./factory/types.js";

/** Repository-relative directory that receives adopted skills. */
export const FACTORY_SKILLS_DIRECTORY = ".factory/skills";

const FACTORY_DIRECTORY = ".factory";

/** The consent question from the specification. */
export const ADOPTION_QUESTION =
  "Metafab manages installed skill directories as generated output. Move existing repository skills into `.factory/skills/` and ignore the generated copies?";

export const ADOPTION_DESCRIPTION =
  "Move existing repository skills into .factory/skills/ and ignore the generated copies";

export interface AdoptionMove {
  /** Skill directory name, which becomes the name in `.factory/skills/`. */
  name: string;
  /** Repository-relative source directories: one, or both identical copies. */
  from: string[];
  /** Repository-relative destination directory. */
  to: string;
}

export interface AdoptionPlan {
  root: string;
  moves: AdoptionMove[];
  blockers: Problem[];
}

/** The part of a loaded factory that adoption needs. */
export type AdoptionFactory = Pick<Factory, "skills"> | undefined;

export interface AdoptionRequired extends RequiredValue {
  moves: AdoptionMove[];
}

interface Candidate {
  name: string;
  from: string;
}

type TreeEntry =
  | { kind: "directory" }
  | { kind: "file"; content: Buffer }
  | { kind: "symlink"; target: string };

function absolute(root: string, relativePath: string): string {
  return path.join(root, ...relativePath.split("/"));
}

function normalizeDirectory(directory: string): string {
  return directory.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function uniqueDirectories(destinations: readonly string[]): string[] {
  const unique: string[] = [];
  for (const destination of destinations) {
    const normalized = normalizeDirectory(destination);
    if (normalized !== "" && !unique.includes(normalized)) unique.push(normalized);
  }
  return unique;
}

async function lstatIfExists(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    throw error;
  }
}

/**
 * The real path of `target` when the path itself does not exist yet: the real
 * path of its deepest existing ancestor, with the missing segments joined back
 * on. The skill's new directory only exists after the move, so the loop check
 * needs this to compare where a link really points, not just what it spells.
 *
 * Returns undefined when no ancestor resolves, as with a symlink loop.
 */
async function realPathOf(target: string): Promise<string | undefined> {
  const missing: string[] = [];
  let current = target;

  for (;;) {
    try {
      return path.join(await realpath(current), ...missing.reverse());
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") return undefined;
    }

    const parent = path.dirname(current);
    if (parent === current) return undefined;
    missing.push(path.basename(current));
    current = parent;
  }
}

function loopProblem(linkPath: string): Problem {
  return {
    level: "error",
    file: linkPath,
    message: `Symlink ${linkPath} creates a loop after the move`,
    fix: "Point it at a file or a directory that does not contain the skill, or remove the symlink",
  };
}

function outsideProblem(linkPath: string): Problem {
  return {
    level: "error",
    file: linkPath,
    message: `Symlink ${linkPath} points outside .factory/ after the move`,
    fix: "Point it inside .factory/, or remove the symlink",
  };
}

function unreadable(relativePath: string): Problem {
  return {
    level: "error",
    file: relativePath,
    message: `Cannot read ${relativePath}`,
    fix: "Check its permissions",
  };
}

function notADirectory(directory: string, symlink: boolean): Problem {
  return {
    level: "error",
    file: directory,
    message: symlink
      ? `${directory} is a symbolic link, not a directory`
      : `${directory} is a file, not a directory`,
    fix: "Move it or replace it with a directory, then run metafab init again",
  };
}

function unownedFile(relativePath: string, directory: string): Problem {
  return {
    level: "error",
    file: relativePath,
    message: `Unowned file ${relativePath} is not part of a valid skill`,
    fix: `Move it out of ${directory}, or add it to a skill in .factory/skills/`,
  };
}

function unownedSymlink(relativePath: string): Problem {
  return {
    level: "error",
    file: relativePath,
    message: `Unowned entry ${relativePath} is a symbolic link, not part of a valid skill`,
    fix: "Remove the symbolic link or replace it with a real skill directory",
  };
}

function unownedDirectory(relativePath: string, directory: string): Problem {
  return {
    level: "error",
    file: relativePath,
    message: `Unowned directory ${relativePath} is not part of a valid skill`,
    fix: `Add a SKILL.md with name and description frontmatter, or move the directory out of ${directory}`,
  };
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

type ParsedFrontmatter = Extract<FrontmatterResult, { ok: true }>;

/**
 * A factory skill stub for a candidate skill, at the path it will occupy after
 * the move, so the factory's own rules validate it exactly as `build` will.
 * The frontmatter line numbers are copied the way `loadFactory` copies them, so
 * problems point at the field they name instead of the top of the file.
 */
function candidateSkill(name: string, parsed: ParsedFrontmatter): Skill {
  const skill: Skill = {
    name,
    relDir: `skills/${name}`,
    group: "skills",
    isWorkflow: false,
    frontmatter: parsed.value,
    frontmatterLines: { start: parsed.startLine, end: parsed.endLine },
  };

  const nameNode = parsed.document.get("name", true);
  const descriptionNode = parsed.document.get("description", true);
  setSkillLines(skill, {
    ...(nameNode === undefined ? {} : { name: parsed.lineOf(nameNode) }),
    ...(descriptionNode === undefined ? {} : { description: parsed.lineOf(descriptionNode) }),
  });

  return skill;
}

/** The factory validation rules that apply to one skill. */
function candidateSkillProblems(name: string, parsed: ParsedFrontmatter): Problem[] {
  const skill = candidateSkill(name, parsed);
  const problems = [...rule1RequiredFields(skill), ...rule6SkillGrammar(skill)];

  const declared = parsed.value.name;
  if (typeof declared === "string" && declared !== "") {
    problems.push(
      ...rule2NameMatchesDirectory(skill),
      ...rule5NameFormat(skill),
      ...rule10ReservedPrefix(skill),
    );
  }

  return problems;
}

/**
 * A symlink inside the skill that would not work after the move. Adoption moves
 * only the skill directory, so a link into `.factory/` is still valid (and
 * `build` accepts it), while one into the repository or another destination
 * would be left behind or change meaning, and `build` would fail on it after
 * the move.
 *
 * A target that contains the skill's new directory is refused separately: once
 * the skill is there the link points at itself or at an ancestor, which `build`
 * reports as a loop. The check runs on the spelled path and on the real path,
 * so a directory symlink inside `.factory/` or a filename that differs only in
 * case cannot hide the same place on disk.
 *
 * The containment check also runs on the real path: a link can spell a path
 * inside `.factory/` and still leave it through a symlinked directory there.
 * Only the moved location matters, so the real path is resolved through the
 * directories that exist before the move.
 */
async function linkProblem(
  root: string,
  relative: string,
  linkPath: string,
  to: string,
): Promise<Problem | undefined> {
  let target: string;
  try {
    target = await readlink(absolute(root, linkPath));
  } catch {
    return unreadable(linkPath);
  }

  const destinationLink = absolute(root, `${to}/${relative}`);
  const destinationTarget = path.resolve(path.dirname(destinationLink), target);
  if (!isInside(absolute(root, FACTORY_DIRECTORY), destinationTarget)) {
    return outsideProblem(linkPath);
  }

  // The lexical check above misses a target that reaches outside through a
  // directory symlink inside `.factory/`. Compare the real paths as well,
  // resolved through the directories that exist before the move.
  const realTarget = await realPathOf(destinationTarget);
  const realFactory = await realPathOf(absolute(root, FACTORY_DIRECTORY));
  if (
    realTarget !== undefined &&
    realFactory !== undefined &&
    !isInside(realFactory, realTarget)
  ) {
    return outsideProblem(linkPath);
  }

  const destinationSkill = absolute(root, to);
  if (isInside(destinationTarget, destinationSkill)) return loopProblem(linkPath);

  // A filename that differs only in case can reach the skill on a
  // case-insensitive filesystem.
  const realSkill = await realPathOf(destinationSkill);
  if (realTarget !== undefined && realSkill !== undefined && isInside(realTarget, realSkill)) {
    return loopProblem(linkPath);
  }

  return undefined;
}

/**
 * The first entry in the candidate tree that the move cannot carry: a symlink
 * that would leave `.factory/` or point back at the skill, or a nested skill
 * directory.
 *
 * `compileSkill` copies every directory it can read, dot directories included,
 * so links inside one are judged here too: a hidden directory that loops or
 * leaves `.factory/` fails the build after the move, whatever its name. The
 * nested-skill rule does not apply inside a dot directory, because factory
 * discovery skips those directories and `build` accepts the `SKILL.md` there.
 */
async function treeProblems(root: string, from: string, to: string): Promise<Problem | undefined> {
  const pending: { relative: string; hidden: boolean }[] = [{ relative: "", hidden: false }];

  while (pending.length > 0) {
    const { relative, hidden } = pending.shift()!;
    const current = relative === "" ? from : `${from}/${relative}`;

    let entries;
    try {
      entries = await readdirTyped(absolute(root, current));
    } catch {
      // `compileSkill` reports the unreadable directory itself.
      continue;
    }
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

    for (const entry of entries) {
      const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
      const childPath = `${from}/${child}`;

      if (entry.isSymbolicLink()) {
        const problem = await linkProblem(root, child, childPath, to);
        if (problem !== undefined) return problem;
        continue;
      }

      if (!entry.isDirectory()) continue;

      const hiding = entry.name.startsWith(".");
      if (!hidden && !hiding) {
        const nestedSkill = await lstatIfExists(absolute(root, `${childPath}/SKILL.md`));
        if (nestedSkill !== undefined && nestedSkill.isFile()) {
          return rule3NoNestedSkills(`${childPath}/SKILL.md`, 1, childPath, from)[0];
        }
      }

      pending.push({ relative: child, hidden: hidden || hiding });
    }
  }

  return undefined;
}

/**
 * Problems that `build` would report for the skill after the move. The walk is
 * `build`'s own `compileSkill`, so loop detection and file reads are the same
 * code: it runs on the source tree with the skill directory as the containment
 * root, because the directory moves as a unit, and a link that stays inside it
 * stays inside `.factory/skills/<name>/` too.
 *
 * A link whose target sits elsewhere in `.factory/` is accepted by
 * `treeProblems` and must pass here as well, so the factory directory joins the
 * roots a link may resolve into. So does the current directory of every other
 * skill adopted in the same run: a link into a sibling skill resolves into that
 * skill's current directory now, and into `.factory/skills/` after both moves.
 * Build never passes `linkRoots`.
 */
async function checkSkillTree(
  root: string,
  name: string,
  from: string,
  adoptedDirs: readonly string[],
): Promise<Problem | undefined> {
  const relocation = await treeProblems(root, from, `${FACTORY_SKILLS_DIRECTORY}/${name}`);
  if (relocation !== undefined) return relocation;

  const skillDir = absolute(root, from);
  const factoryDirectory = absolute(root, FACTORY_DIRECTORY);
  const factoryExists = (await lstatIfExists(factoryDirectory)) !== undefined;
  const compiled = await compileSkill(
    { dir: skillDir, name, sourcePath: from },
    {
      factoryDir: skillDir,
      linkRoots: [
        ...(factoryExists ? [factoryDirectory] : []),
        ...adoptedDirs.map((directory) => absolute(root, directory)),
      ],
    },
  );
  return compiled.problems[0];
}

async function checkSkill(
  root: string,
  name: string,
  from: string,
  directory: string,
): Promise<Problem | undefined> {
  const skillFile = `${from}/SKILL.md`;
  const info = await lstatIfExists(absolute(root, skillFile));

  if (info === undefined) return unownedDirectory(from, directory);
  if (!info.isFile()) {
    return {
      level: "error",
      file: skillFile,
      message: `${skillFile} is not a regular file`,
      fix: "Replace it with a SKILL.md file with name and description frontmatter",
    };
  }

  let source: string;
  try {
    source = await readFile(absolute(root, skillFile), "utf8");
  } catch {
    return {
      level: "error",
      file: skillFile,
      message: `Cannot read ${skillFile}`,
      fix: "Check its permissions",
    };
  }

  const parsed = parseFrontmatter(source);
  if (!parsed.ok) {
    const problem = parsed.problems[0]!;
    return {
      level: "error",
      file: skillFile,
      ...(problem.line === undefined ? {} : { line: problem.line }),
      message: `Unowned directory ${from} is not part of a valid skill: ${problem.message}`,
      fix: problem.fix ?? `Fix ${skillFile}, or move the directory out of ${directory}`,
    };
  }

  const problems = candidateSkillProblems(name, parsed);
  const problem = problems[0];
  if (problem !== undefined) return { ...problem, file: skillFile };

  return undefined;
}

async function scanDestination(
  root: string,
  directory: string,
  blockers: Problem[],
): Promise<Candidate[]> {
  const target = absolute(root, directory);
  const info = await lstatIfExists(target);
  if (info === undefined) return [];

  if (!info.isDirectory()) {
    blockers.push(notADirectory(directory, info.isSymbolicLink()));
    return [];
  }

  let entries;
  try {
    entries = await readdirTyped(target);
  } catch {
    blockers.push(unreadable(directory));
    return [];
  }
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

  const candidates: Candidate[] = [];
  for (const entry of entries) {
    const from = `${directory}/${entry.name}`;

    if (entry.isSymbolicLink()) {
      blockers.push(unownedSymlink(from));
      continue;
    }
    if (!entry.isDirectory()) {
      blockers.push(unownedFile(from, directory));
      continue;
    }
    if (await isOwned(absolute(root, from))) continue;

    if (BUILTIN_SKILL_NAMES.includes(entry.name)) {
      blockers.push(builtinClash(entry.name, from));
      continue;
    }

    const blocker = await checkSkill(root, entry.name, from, directory);
    if (blocker !== undefined) blockers.push(blocker);
    else candidates.push({ name: entry.name, from });
  }

  return candidates;
}

async function collectTree(root: string, directory: string): Promise<Map<string, TreeEntry>> {
  const entries = new Map<string, TreeEntry>();

  async function walk(relativePath: string, prefix: string): Promise<void> {
    const children = await readdirTyped(absolute(root, relativePath));
    children.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

    for (const child of children) {
      const childPath = `${relativePath}/${child.name}`;
      const key = prefix === "" ? child.name : `${prefix}/${child.name}`;

      if (child.isSymbolicLink()) {
        entries.set(key, {
          kind: "symlink",
          target: await readlink(absolute(root, childPath)),
        });
      } else if (child.isDirectory()) {
        entries.set(key, { kind: "directory" });
        await walk(childPath, key);
      } else if (child.isFile()) {
        entries.set(key, { kind: "file", content: await readFile(absolute(root, childPath)) });
      }
    }
  }

  await walk(directory, "");
  return entries;
}

function sameFileContent(left: Buffer, right: Buffer): boolean {
  const leftText = textContent(left);
  const rightText = textContent(right);
  if (leftText === undefined || rightText === undefined) return left.equals(right);
  return equalIgnoringEOL(leftText, rightText);
}

async function sameTree(root: string, left: string, right: string): Promise<boolean> {
  const leftTree = await collectTree(root, left);
  const rightTree = await collectTree(root, right);
  if (leftTree.size !== rightTree.size) return false;

  for (const [key, entry] of leftTree) {
    const other = rightTree.get(key);
    if (other === undefined || other.kind !== entry.kind) return false;

    if (entry.kind === "file" && other.kind === "file" && !sameFileContent(entry.content, other.content)) {
      return false;
    }
    if (entry.kind === "symlink" && other.kind === "symlink" && entry.target !== other.target) {
      return false;
    }
  }

  return true;
}

function differs(name: string, left: string, right: string): Problem {
  return {
    level: "error",
    file: right,
    message: `Skill "${name}" differs between ${left} and ${right}`,
    fix: "Make the two copies identical, or remove one by hand",
  };
}

function factoryClash(name: string, from: string): Problem {
  return {
    level: "error",
    file: from,
    message: `Skill "${name}" already exists in .factory/`,
    fix: "Rename the skill, or remove the existing factory skill",
  };
}

function builtinClash(name: string, from: string): Problem {
  return {
    level: "error",
    file: from,
    message: `Skill "${name}" clashes with the built-in "${name}" skill that metafab build installs`,
    fix: "Rename the skill, or remove it from the repository",
  };
}

function incomingClash(name: string, from: string): Problem {
  return {
    level: "error",
    file: from,
    message: `Skill "${name}" already exists in the incoming fab`,
    fix: "Rename the skill, or remove it from the fab",
  };
}

function sortProblems(problems: Problem[]): Problem[] {
  return problems.sort((left, right) => {
    const leftKey = `${left.file}\u0000${left.line ?? 0}\u0000${left.message}`;
    const rightKey = `${right.file}\u0000${right.line ?? 0}\u0000${right.message}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

/**
 * Problems with the directories that will receive moves. A symlinked directory
 * would move the skill outside the repository, so adoption refuses it.
 */
async function destinationProblems(root: string): Promise<Problem[]> {
  const problems: Problem[] = [];

  for (const directory of [FACTORY_DIRECTORY, FACTORY_SKILLS_DIRECTORY]) {
    const info = await lstatIfExists(absolute(root, directory));
    if (info === undefined) continue;
    if (info.isSymbolicLink() || !info.isDirectory()) {
      problems.push({
        level: "error",
        file: directory,
        message: info.isSymbolicLink()
          ? `${directory} is a symbolic link, not a directory`
          : `${directory} is a file, not a directory`,
        fix: "Replace it with a real directory, then run metafab init again",
      });
    }
  }

  return problems;
}

/** The error for a plan whose blockers stopped adoption, shared by every caller. */
export function adoptionBlockedError(plan: AdoptionPlan): MetafabError {
  const count = plan.blockers.length;
  return new MetafabError(
    `Adoption is blocked by ${count} ${count === 1 ? "entry" : "entries"}.`,
    {
      exitCode: ExitCode.NotOwned,
      code: "adoption-blocked",
      problems: [...plan.blockers],
    },
  );
}

/** Throws exit 5 when the plan has blockers, so no caller plans around them. */
export function assertAdoptionAllowed(plan: AdoptionPlan): void {
  if (plan.blockers.length > 0) throw adoptionBlockedError(plan);
}


/**
 * Every name an existing factory skill answers to: its directory name and the
 * `name` in its frontmatter. Validation compares the frontmatter names, so a
 * skill whose directory and declared name disagree blocks a candidate that
 * matches either one. Skills that discovery dropped — an unparseable SKILL.md
 * never reaches this list — contribute nothing and cannot crash planning.
 */
function factorySkillNames(factory: AdoptionFactory): Set<string> {
  const names = new Set<string>();

  for (const skill of factory?.skills ?? []) {
    if (typeof skill.name === "string" && skill.name !== "") names.add(skill.name);

    const frontmatter: unknown = skill.frontmatter;
    if (typeof frontmatter !== "object" || frontmatter === null) continue;
    const declared = (frontmatter as Record<string, unknown>).name;
    if (typeof declared === "string" && declared !== "") names.add(declared);
  }

  return names;
}

/**
 * Plans the move of repository skills that Metafab does not own from the selected
 * destinations into `.factory/skills/`. It reads only; `applyAdoption` writes.
 *
 * `factory` supplies the names that already exist in `.factory/`. Pass `undefined`
 * when the repository has no factory yet. `incoming` lists skill names from a fab
 * that `import` is about to copy.
 */
export async function planAdoption(
  root: string,
  destinations: readonly string[],
  factory: AdoptionFactory,
  incoming: Iterable<string> = [],
): Promise<AdoptionPlan> {
  const absoluteRoot = path.resolve(root);
  const plan: AdoptionPlan = { root: absoluteRoot, moves: [], blockers: [] };

  const candidates: Candidate[] = [];
  for (const directory of uniqueDirectories(destinations)) {
    candidates.push(...(await scanDestination(absoluteRoot, directory, plan.blockers)));
  }

  const byName = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const list = byName.get(candidate.name);
    if (list === undefined) byName.set(candidate.name, [candidate]);
    else list.push(candidate);
  }

  const factoryNames = factorySkillNames(factory);
  const incomingNames = new Set(incoming);

  for (const name of [...byName.keys()].sort()) {
    const sources = byName.get(name)!.map((candidate) => candidate.from).sort();
    const first = sources[0]!;

    const inFactory =
      factoryNames.has(name) ||
      (await lstatIfExists(absolute(absoluteRoot, `${FACTORY_SKILLS_DIRECTORY}/${name}`))) !== undefined;
    if (inFactory) {
      plan.blockers.push(factoryClash(name, first));
      continue;
    }
    if (incomingNames.has(name)) {
      plan.blockers.push(incomingClash(name, first));
      continue;
    }

    if (sources.length > 1) {
      let identical = true;
      for (const source of sources.slice(1)) {
        let same: boolean;
        try {
          same = await sameTree(absoluteRoot, first, source);
        } catch {
          plan.blockers.push(unreadable(source));
          identical = false;
          break;
        }
        if (!same) {
          plan.blockers.push(differs(name, first, source));
          identical = false;
          break;
        }
      }
      if (!identical) continue;
    }

    plan.moves.push({ name, from: sources, to: `${FACTORY_SKILLS_DIRECTORY}/${name}` });
  }

  // The tree check runs once the moves are known, because a link into a
  // sibling skill adopted in the same run has to pass: its target is valid
  // after both moves. Dropping a blocked move removes its directory from the
  // roots the rest may resolve into, so repeat until nothing more is blocked.
  for (;;) {
    const adoptedDirs = plan.moves.flatMap((move) => move.from);
    const blocked = new Map<AdoptionMove, Problem>();
    for (const move of plan.moves) {
      const primary = move.from[0]!;
      const problem = await checkSkillTree(absoluteRoot, move.name, primary, adoptedDirs);
      if (problem !== undefined) blocked.set(move, problem);
    }
    if (blocked.size === 0) break;
    plan.blockers.push(...blocked.values());
    plan.moves = plan.moves.filter((move) => !blocked.has(move));
  }

  if (plan.moves.length > 0) plan.blockers.push(...(await destinationProblems(absoluteRoot)));

  plan.blockers = sortProblems(plan.blockers);
  return plan;
}

async function moveDirectory(root: string, source: string, target: string): Promise<void> {
  try {
    await rename(source, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await cp(source, target, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
    await rm(source, { recursive: true, force: true });
  }
}

/**
 * Performs the moves in a plan. Each move renames the whole skill directory,
 * including supporting files and modes, then deletes identical duplicates.
 * A plan with blockers is never applied.
 */
export async function applyAdoption(plan: AdoptionPlan): Promise<void> {
  assertAdoptionAllowed(plan);

  const unsafe = await destinationProblems(plan.root);
  if (unsafe.length > 0) {
    throw new MetafabError("Adoption cannot write into the factory directory.", {
      exitCode: ExitCode.NotOwned,
      code: "adoption-blocked",
      problems: unsafe,
    });
  }

  for (const move of plan.moves) {
    const primary = move.from[0];
    if (primary === undefined) continue;

    const target = absolute(plan.root, move.to);
    if ((await lstatIfExists(target)) !== undefined) {
      throw new MetafabError(`Skill "${move.name}" already exists in .factory/.`, {
        exitCode: ExitCode.NotOwned,
        code: "adoption-blocked",
        problems: [factoryClash(move.name, primary)],
      });
    }

    await mkdir(path.dirname(target), { recursive: true });
    await moveDirectory(plan.root, absolute(plan.root, primary), target);

    for (const duplicate of move.from.slice(1)) {
      await rm(absolute(plan.root, duplicate), { recursive: true, force: true });
    }
  }
}

/**
 * Exit-2 payload for the adoption decision. It names `--adopt` as the flag and
 * lists every move, so an agent or CI job can adopt without a terminal.
 */
export function adoptionRequired(plan: AdoptionPlan): AdoptionRequired {
  return {
    name: "adopt",
    flag: "--adopt",
    description: ADOPTION_DESCRIPTION,
    moves: plan.moves.map((move) => ({ ...move, from: [...move.from] })),
  };
}

/** Human-readable list of the planned moves, one per line. */
export function describeAdoption(plan: AdoptionPlan): string {
  return plan.moves
    .map((move) => `${move.name}: ${move.from.join(", ")} -> ${move.to}`)
    .join("\n");
}
