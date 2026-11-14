import { chmod, copyFile, lstat, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

/** A directory entry whose type is always known. */
export interface DirEntry {
  readonly name: string;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

/**
 * Lists `directory` with `readdir(directory, { withFileTypes: true })`. An
 * entry the filesystem reported with no type (every Dirent predicate false,
 * DT_UNKNOWN) is typed from `lstat` instead. An entry that vanished before the
 * `lstat` (ENOENT) is dropped. Any other `lstat` error (EACCES, EIO, ...) is
 * thrown unchanged, exactly like an error from `readdir` itself, so the
 * caller's existing handling for an unreadable directory applies: it never
 * silently skips an entry it could not classify.
 */
export async function readdirTyped(directory: string): Promise<DirEntry[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const typed: DirEntry[] = [];

  for (const entry of entries) {
    if (entry.isFile() || entry.isDirectory() || entry.isSymbolicLink()) {
      typed.push(entry);
      continue;
    }

    let info;
    try {
      info = await lstat(path.join(directory, entry.name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }

    typed.push({
      name: entry.name,
      isFile: () => info.isFile(),
      isDirectory: () => info.isDirectory(),
      isSymbolicLink: () => info.isSymbolicLink(),
    });
  }

  return typed;
}

export interface ListOptions {
  ignore?: (relativePath: string, isDirectory: boolean) => boolean;
}

export interface TreeDifference {
  path: string;
  kind: "missing" | "extra" | "content" | "mode";
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function normalizeProblemPath(file: string, root: string = process.cwd()): string {
  const relative = path.isAbsolute(file) ? path.relative(root, file) : file;
  return relative.split("\\").join("/").replace(/^\.\//, "");
}

function fromPosixPath(value: string): string {
  return value.split("/").join(path.sep);
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

export async function listFiles(root: string, options: ListOptions = {}): Promise<string[]> {
  const files: string[] = [];

  async function walk(directory: string, prefix: string): Promise<void> {
    const entries = await readdirTyped(directory);
    for (const entry of entries) {
      const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (options.ignore?.(relativePath, entry.isDirectory()) === true) continue;

      if (entry.isDirectory()) {
        await walk(path.join(directory, entry.name), relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }

  await walk(root, "");
  files.sort();
  return files;
}

export async function copyFileWithMode(source: string, destination: string): Promise<void> {
  const sourceStat = await stat(source);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  await chmod(destination, sourceStat.mode & 0o777);
}

export async function copyTree(source: string, destination: string, options: ListOptions = {}): Promise<void> {
  const files = await listFiles(source, options);
  for (const relativePath of files) {
    await copyFileWithMode(path.join(source, fromPosixPath(relativePath)), path.join(destination, fromPosixPath(relativePath)));
  }
}

export async function compareTrees(expected: string, actual: string, options: ListOptions = {}): Promise<TreeDifference[]> {
  const expectedFiles = await listFiles(expected, options);
  const actualFiles = await listFiles(actual, options);
  const expectedSet = new Set(expectedFiles);
  const actualSet = new Set(actualFiles);
  const paths = [...new Set([...expectedFiles, ...actualFiles])].sort();
  const differences: TreeDifference[] = [];

  for (const relativePath of paths) {
    if (!actualSet.has(relativePath)) {
      differences.push({ path: relativePath, kind: "missing" });
      continue;
    }
    if (!expectedSet.has(relativePath)) {
      differences.push({ path: relativePath, kind: "extra" });
      continue;
    }

    const expectedPath = path.join(expected, fromPosixPath(relativePath));
    const actualPath = path.join(actual, fromPosixPath(relativePath));
    const [expectedStat, actualStat] = await Promise.all([stat(expectedPath), stat(actualPath)]);
    const [expectedData, actualData] = await Promise.all([readFile(expectedPath), readFile(actualPath)]);
    if (!expectedData.equals(actualData)) {
      differences.push({ path: relativePath, kind: "content" });
    } else if ((expectedStat.mode & 0o777) !== (actualStat.mode & 0o777)) {
      differences.push({ path: relativePath, kind: "mode" });
    }
  }

  return differences;
}
