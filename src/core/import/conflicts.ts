import path from "node:path";
import type { Problem } from "../../errors.js";
import { snapshotTree } from "./file-tree.js";
import type { FileEntry, FileTree } from "./file-tree.js";
import type { AdoptionMove } from "../adopt.js";

/** A file that an incoming fab path would replace, with the path to report. */
export interface LocalFile {
  entry: FileEntry;
  file: string;
}

function absolute(root: string, relativePath: string): string {
  return path.join(root, ...relativePath.split("/"));
}

function ancestors(relativePath: string): string[] {
  const parts = relativePath.split("/");
  const prefixes: string[] = [];
  for (let index = 1; index < parts.length; index += 1) {
    prefixes.push(parts.slice(0, index).join("/"));
  }
  return prefixes;
}

function replaced(file: string): Problem {
  return {
    level: "error",
    file,
    message: `The incoming fab would replace ${file}`,
    fix: "Keep the local file, or run metafab import --force to replace it",
  };
}

function blocked(file: string): Problem {
  return {
    level: "error",
    file,
    message: `The incoming fab would replace ${file} with a different kind of entry`,
    fix: "Move the local entry away, or run metafab import --force to replace it",
  };
}

function addTree(
  files: Map<string, LocalFile>,
  tree: FileTree,
  prefix: string,
  sourceDirectory: string,
): void {
  for (const [relativePath, entry] of Object.entries(tree)) {
    const key = prefix === "" ? relativePath : `${prefix}/${relativePath}`;
    if (files.has(key)) continue;
    files.set(key, { entry, file: `${sourceDirectory}/${relativePath}` });
  }
}

/**
 * The local files an import could replace: the factory, plus the files of each
 * skill adoption will move into it. Keys are factory-relative paths, so a
 * planned move of `release` maps `.claude/skills/release/SKILL.md` to
 * `skills/release/SKILL.md`, where the incoming fab writes.
 */
export async function localFilesForImport(
  root: string,
  factoryDir: string,
  moves: readonly AdoptionMove[],
  hasFactory: boolean,
): Promise<Map<string, LocalFile>> {
  const files = new Map<string, LocalFile>();

  if (hasFactory) addTree(files, await snapshotTree(factoryDir), "", ".factory");

  for (const move of moves) {
    const primary = move.from[0];
    if (primary === undefined) continue;
    let tree: FileTree;
    try {
      tree = await snapshotTree(absolute(root, primary));
    } catch {
      continue;
    }
    addTree(files, tree, `skills/${move.name}`, primary);
  }

  return files;
}

/**
 * Every incoming path that would replace a local file with different content,
 * compared without line-ending changes counting as a difference. A path that
 * would replace a file with a directory, or a directory with a file, is a
 * conflict too, so the copy can never fail on it.
 */
export async function findImportConflicts(
  incomingDir: string,
  local: ReadonlyMap<string, LocalFile>,
): Promise<Problem[]> {
  const incoming = await snapshotTree(incomingDir);
  const problems: Problem[] = [];

  for (const relativePath of Object.keys(incoming).sort()) {
    const existing = local.get(relativePath);
    if (existing !== undefined) {
      if (existing.entry.hash !== incoming[relativePath]!.hash) {
        problems.push(replaced(existing.file));
      }
      continue;
    }

    for (const prefix of ancestors(relativePath)) {
      const blocking = local.get(prefix);
      if (blocking !== undefined) {
        problems.push(blocked(blocking.file));
        break;
      }
    }

    const asDirectory = [...local.keys()].find((key) => key.startsWith(`${relativePath}/`));
    if (asDirectory !== undefined) {
      problems.push(blocked(local.get(asDirectory)!.file));
    }
  }

  return problems;
}
