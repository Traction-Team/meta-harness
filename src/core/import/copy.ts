import { lstat, mkdir, readlink, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { copyFileWithMode, readdirTyped } from "../../util/fs.js";

/** Files the fab carries for its own repository, never for the receiver. */
export const FAB_ROOT_EXCLUDES: ReadonlySet<string> = new Set(["metafab.yaml", "README.md"]);

async function lstatIfExists(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function ensureDirectory(target: string): Promise<void> {
  const info = await lstatIfExists(target);
  if (info !== undefined && !info.isDirectory()) {
    await rm(target, { recursive: true, force: true });
  }
  await mkdir(target, { recursive: true });
}

/** Replaces whatever occupies `target` with a regular file copy. */
async function copyFile(source: string, target: string): Promise<void> {
  const info = await lstatIfExists(target);
  if (info !== undefined && !info.isFile()) {
    await rm(target, { recursive: true, force: true });
  }
  await copyFileWithMode(source, target);
}

/** Replaces whatever occupies `target` with a symbolic link to `linkTarget`. */
async function copyLink(linkTarget: string, target: string): Promise<void> {
  await rm(target, { recursive: true, force: true });
  await symlink(linkTarget, target);
}

/**
 * Copy a fetched fab's `.factory/` into the local `.factory/`, keeping modes.
 *
 * `metafab.yaml` and `.factory/README.md` belong to the fab's repository and are
 * never copied. The source tree was validated by the fetch, so links point
 * inside the factory and can be recreated as they are.
 */
export async function copyFactoryTree(sourceDir: string, destinationDir: string): Promise<string[]> {
  const copied: string[] = [];

  async function walk(current: string, relative: string): Promise<void> {
    const entries = await readdirTyped(current);
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

    for (const entry of entries) {
      if (relative === "" && FAB_ROOT_EXCLUDES.has(entry.name)) continue;

      const source = path.join(current, entry.name);
      const target = path.join(destinationDir, ...(relative === "" ? [entry.name] : [...relative.split("/"), entry.name]));
      const childRelative = relative === "" ? entry.name : `${relative}/${entry.name}`;

      if (entry.isSymbolicLink()) {
        await ensureDirectory(path.dirname(target));
        await copyLink(await readlink(source), target);
        copied.push(childRelative);
        continue;
      }

      if (entry.isDirectory()) {
        await ensureDirectory(target);
        await walk(source, childRelative);
        continue;
      }

      if (!entry.isFile()) continue;

      await ensureDirectory(path.dirname(target));
      await copyFile(source, target);
      copied.push(childRelative);
    }
  }

  await ensureDirectory(destinationDir);
  await walk(sourceDir, "");
  return copied.sort();
}
