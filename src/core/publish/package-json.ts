import { ExitCode, MetafabError } from "../../errors.js";
import type { PublishConfig } from "../config/types.js";
import type { Factory } from "../factory/index.js";

export const FAB_KEYWORD = "metafab";
export const FAB_FILES = [".factory", "README.md"] as const;

export interface FabPackageJson {
  name: string;
  version: string;
  description?: string;
  keywords: string[];
  files: string[];
  metafab: { format: 1 };
  license?: string;
}

function missingSetting(key: string): MetafabError {
  return new MetafabError(`The npm target requires "${key}".`, {
    exitCode: ExitCode.Failed,
    code: "publish-missing-setting",
    problems: [
      {
        level: "error",
        file: ".factory/metafab.yaml",
        message: `The npm target requires "${key}".`,
        fix: `Add "${key}" to the publish section`,
      },
    ],
  });
}

/** `metafab` first, then `publish.keywords`, without empty values or duplicates. */
export function keywordsFor(publish: PublishConfig): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const keyword of [FAB_KEYWORD, ...(publish.keywords ?? [])]) {
    const value = keyword.trim();
    if (value === "" || seen.has(value)) continue;
    seen.add(value);
    keywords.push(value);
  }

  return keywords;
}

/**
 * The npm `package.json` for a fab. `files` and `metafab.format` are fixed by
 * the fab layout, so they are not configurable.
 */
export function buildPackageJson(factory: Factory, publish: PublishConfig): FabPackageJson {
  if (publish.name === undefined) throw missingSetting("publish.name");
  if (publish.version === undefined) throw missingSetting("publish.version");

  const description = publish.description ?? factory.factoryYaml?.description;

  return {
    name: publish.name,
    version: publish.version,
    ...(description === undefined ? {} : { description }),
    keywords: keywordsFor(publish),
    files: [...FAB_FILES],
    metafab: { format: factory.factoryYaml?.format ?? 1 },
    ...(publish.license === undefined ? {} : { license: publish.license }),
  };
}
