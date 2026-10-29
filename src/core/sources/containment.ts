import { realpath, stat } from "node:fs/promises";
import path from "node:path";

const FACTORY_DIRECTORY = ".factory";

/**
 * The directory a link must stay inside. The spelling of the stored path is not
 * what the filesystem matches on: on a case-insensitive filesystem
 * `.FACTORY/leak` lives in the same directory as `.factory/leak`, and a
 * symlinked parent can put a differently spelled path there too. Walk the
 * link's real ancestors and compare their identity with `.factory`.
 */
export async function containmentRootAbsolute(
  absoluteLinkPath: string,
  destination: string,
): Promise<string> {
  const destinationRoot = await realpath(destination).catch(() => path.resolve(destination));
  const factoryPath = path.join(destination, FACTORY_DIRECTORY);
  const factory = await stat(factoryPath).catch(() => undefined);
  if (factory === undefined) return destinationRoot;

  let current = path.dirname(absoluteLinkPath);
  for (;;) {
    const ancestor = await stat(current).catch(() => undefined);
    if (ancestor !== undefined && ancestor.dev === factory.dev && ancestor.ino === factory.ino) {
      return realpath(factoryPath).catch(() => factoryPath);
    }
    const parent = path.dirname(current);
    if (parent === current) return destinationRoot;
    current = parent;
  }
}

export function isInsideAbsolute(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
