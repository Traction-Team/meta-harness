import { mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";

interface IncomingPath {
  relativePath: string;
  directory: boolean;
}

/**
 * Renames local entries so each incoming path uses the source's spelling.
 *
 * An unversioned update copies the source over the factory, so a local file
 * that differs only in case from the source file is replaced anyway. Writing it
 * without renaming would keep the local spelling on a case-insensitive
 * filesystem, so the path on disk would not match the source the fab records.
 * Each component is renamed from whatever local spelling matches it, which also
 * realigns a directory that differs only in case.
 *
 * Only incoming paths are visited: local-only paths keep their spelling. A
 * missing file is left for the copy to create.
 */
export async function alignFactorySpelling(
  factoryDir: string,
  incoming: { files: readonly string[]; directories: readonly string[] },
): Promise<void> {
  const paths: IncomingPath[] = [
    ...incoming.directories.map((relativePath) => ({ relativePath, directory: true })),
    ...incoming.files.map((relativePath) => ({ relativePath, directory: false })),
  ].sort(
    (left, right) =>
      left.relativePath.split("/").length - right.relativePath.split("/").length ||
      left.relativePath.localeCompare(right.relativePath),
  );

  for (const { relativePath, directory } of paths) {
    const parts = relativePath.split("/");
    let current = factoryDir;

    for (const [index, part] of parts.entries()) {
      const entries = await readdir(current);
      const match = entries.find((name) => name.toLowerCase() === part.toLowerCase());
      const last = index === parts.length - 1;

      if (match === undefined) {
        // The copy creates a missing file; a missing directory is created here
        // so the next component can be renamed into it.
        if (last && !directory) break;
        await mkdir(path.join(current, part), { recursive: true });
        current = path.join(current, part);
        continue;
      }

      if (match !== part) await rename(path.join(current, match), path.join(current, part));
      current = path.join(current, part);
    }
  }
}
