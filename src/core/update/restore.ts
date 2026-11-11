import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * What `.factory/` held before an update wrote: every file's bytes and full
 * permission mode, every link's target, and every directory, empty ones
 * included, with the exact spelling of each name.
 */
export interface FactoryCapture {
  /** Make `.factory/` match the capture again, then leave the capture in place. */
  restore(): Promise<void>;
  /** Remove the captured bytes. Safe to call more than once. */
  discard(): Promise<void>;
}

interface CapturedNode {
  kind: "directory" | "file" | "link";
  /** The full permission mode of a file, including setuid, setgid and sticky. */
  mode?: number;
  /** Where the captured bytes of a file are kept. */
  source?: string;
  /** The target of a link. */
  target?: string;
  /** The children of a directory, keyed by their exact spelling. */
  children?: Map<string, CapturedNode>;
}

async function lstatIfExists(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * Records every entry under `dir`, in the order the filesystem lists it, and
 * copies each file's bytes into `staging`.
 *
 * A socket or other special entry is not factory content an update writes, so
 * it is not recorded; restore never creates one, and removes one only when it
 * sits on a recorded path.
 */
async function captureDirectory(
  dir: string,
  staging: string,
  counter: { next: number },
): Promise<Map<string, CapturedNode>> {
  const children = new Map<string, CapturedNode>();

  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    const info = await lstat(target);

    if (info.isSymbolicLink()) {
      children.set(entry.name, { kind: "link", target: await readlink(target) });
    } else if (info.isDirectory()) {
      children.set(entry.name, {
        kind: "directory",
        children: await captureDirectory(target, staging, counter),
      });
    } else if (info.isFile()) {
      const source = path.join(staging, String(counter.next));
      counter.next += 1;
      await writeFile(source, await readFile(target));
      children.set(entry.name, { kind: "file", mode: info.mode & 0o7777, source });
    }
  }

  return children;
}

/** Creates `target` as a directory, removing a file or link in its way. */
async function ensureDirectory(target: string): Promise<void> {
  const info = await lstatIfExists(target);
  if (info !== undefined) {
    if (info.isDirectory()) return;
    await rm(target, { recursive: true, force: true });
  }
  await mkdir(target, { recursive: true });
}

async function sameBytes(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([readFile(left), readFile(right)]);
  return a.equals(b);
}

/** Rewrites a file whose bytes or mode differ, recreating it when absent. */
async function restoreFile(target: string, node: CapturedNode): Promise<void> {
  const info = await lstatIfExists(target);
  if (info !== undefined) {
    if (info.isFile()) {
      if ((info.mode & 0o7777) === node.mode && (await sameBytes(target, node.source!))) return;
    } else {
      await rm(target, { recursive: true, force: true });
    }
  }

  await writeFile(target, await readFile(node.source!), { mode: node.mode });
  await chmod(target, node.mode!);
}

/** Recreates a link, or repoints one whose target differs. */
async function restoreLink(target: string, node: CapturedNode): Promise<void> {
  const info = await lstatIfExists(target);
  if (info !== undefined) {
    if (info.isSymbolicLink() && (await readlink(target)) === node.target) return;
    await rm(target, { recursive: true, force: true });
  }
  await symlink(node.target!, target);
}

/**
 * Classifies an entry with lstat, as capture does. A `Dirent` may report an
 * unknown type on some filesystems, which would make a real file or link look
 * special, so its type is not trusted here.
 */
async function classifyEntry(
  target: string,
): Promise<"directory" | "file" | "link" | "special" | undefined> {
  const info = await lstatIfExists(target);
  if (info === undefined) return undefined;
  if (info.isSymbolicLink()) return "link";
  if (info.isDirectory()) return "directory";
  if (info.isFile()) return "file";
  return "special";
}

/**
 * Makes `currentDir` hold exactly the recorded children.
 *
 * Extras are deleted, a name whose spelling differs only in case is renamed
 * back, and every recorded child is recreated or repaired: a missing file, link
 * or directory is created, including an empty directory, and a file whose bytes
 * or mode differ is rewritten. A special entry was never recorded, so it is
 * left in place rather than mistaken for something an update wrote, unless it
 * sits on a recorded path, which is restored over it.
 */
async function restoreDirectory(
  currentDir: string,
  record: ReadonlyMap<string, CapturedNode>,
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const present = new Set(entries.map((entry) => entry.name));
  const recorded = new Set(record.keys());
  const special = new Set<string>();
  for (const entry of entries) {
    if ((await classifyEntry(path.join(currentDir, entry.name))) === "special") {
      special.add(entry.name);
    }
  }

  // A case-only difference is one logical entry, so rename it back instead of
  // deleting and recreating it. Only an unambiguous candidate is renamed; the
  // rest are extras and are deleted below.
  for (const name of recorded) {
    if (present.has(name)) continue;
    const matches = entries.filter(
      (entry) =>
        present.has(entry.name) &&
        !recorded.has(entry.name) &&
        !special.has(entry.name) &&
        entry.name.toLowerCase() === name.toLowerCase(),
    );
    if (matches.length !== 1) continue;
    const currentName = matches[0]!.name;
    await rename(path.join(currentDir, currentName), path.join(currentDir, name));
    present.delete(currentName);
    present.add(name);
  }

  for (const entry of entries) {
    const name = entry.name;
    if (!present.has(name) || recorded.has(name)) continue;
    if (special.has(name)) continue;
    await rm(path.join(currentDir, name), { recursive: true, force: true });
  }

  for (const [name, node] of record) {
    const target = path.join(currentDir, name);
    if (node.kind === "directory") {
      await ensureDirectory(target);
      await restoreDirectory(target, node.children!);
    } else if (node.kind === "file") {
      await restoreFile(target, node);
    } else {
      await restoreLink(target, node);
    }
  }
}

/**
 * Records `.factory/` so an update that fails partway can put it back.
 *
 * Call it just before the first write. `restore` makes the directory match the
 * record exactly, so a half-applied merge never leaves upstream content behind
 * while the old version stays recorded. Not `snapshotFactory`: `import/file-tree.ts`
 * already exports that name with another meaning.
 */
export async function captureFactory(factoryDir: string): Promise<FactoryCapture> {
  const staging = await mkdtemp(path.join(tmpdir(), "metafab-restore-"));
  let record: Map<string, CapturedNode>;

  try {
    record = await captureDirectory(factoryDir, staging, { next: 0 });
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }

  let discarded = false;
  return {
    async restore() {
      await mkdir(factoryDir, { recursive: true });
      await restoreDirectory(factoryDir, record);
    },
    async discard() {
      if (discarded) return;
      discarded = true;
      // Failing to remove a temporary directory must not change the result of
      // the update, so the cleanup never throws.
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
