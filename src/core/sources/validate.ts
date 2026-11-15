import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { isDirectory } from "../../util/fs.js";
import { parseYaml } from "../../util/yaml.js";
import { loadFactory } from "../factory/index.js";
import { sourceProblemFile } from "./problems.js";
import { redact } from "./redact.js";
import type { ValidateFabOptions, ValidatedFab } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidFab(sourceLabel: string, problems: Problem[]): MetafabError {
  return new MetafabError(`Invalid fab from ${redact(sourceLabel)}`, {
    exitCode: ExitCode.InvalidFab,
    code: "invalid-fab",
    problems,
  });
}

function invalidFormat(sourceLabel: string, file: string, value: unknown): MetafabError {
  return invalidFab(sourceLabel, [
    {
      level: "error",
      file: sourceProblemFile(sourceLabel, file),
      line: 1,
      message: `Unknown factory format ${JSON.stringify(value)}`,
      fix: "Use format 1 or 2, or upgrade @seasb/metafab",
    },
  ]);
}

/** A factory format Metafab 2 reads. Anything else is an unknown format. */
function fabFormat(value: unknown): 1 | 2 | undefined {
  return value === 1 || value === 2 ? value : undefined;
}

function packageFormat(packageJson: unknown): { present: boolean; value?: unknown } {
  if (!isRecord(packageJson)) return { present: false };
  const metafab = packageJson.metafab;
  if (!isRecord(metafab) || !("format" in metafab)) return { present: false };
  return { present: true, value: metafab.format };
}

async function factoryYamlFormat(root: string): Promise<{ present: boolean; value?: unknown }> {
  let text: string;
  try {
    text = await readFile(path.join(root, ".factory", "factory.yaml"), "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { present: false };
    throw error;
  }

  const parsed = parseYaml(text);
  if (!parsed.ok) return { present: false };
  if (!("format" in parsed.value)) return { present: false };
  return { present: true, value: parsed.value.format };
}

async function detectFormat(root: string, sourceLabel: string, packageJson: unknown): Promise<1 | 2> {
  const fromPackage = packageFormat(packageJson);
  if (fromPackage.present) {
    const format = fabFormat(fromPackage.value);
    if (format === undefined) {
      throw invalidFormat(sourceLabel, "package.json", fromPackage.value);
    }
    return format;
  }

  const fromFactory = await factoryYamlFormat(root);
  if (fromFactory.present) {
    const format = fabFormat(fromFactory.value);
    if (format === undefined) {
      throw invalidFormat(sourceLabel, ".factory/factory.yaml", fromFactory.value);
    }
    return format;
  }

  return 1;
}

/**
 * Remove the files that never travel in a fab payload. This mutates `root`, so
 * it is for the temporary or cache copy that a fetcher owns. `validateFab`
 * never changes the tree it reads: a caller can validate a repository by
 * mistake and keep it intact.
 */
export async function dropPayloadFiles(root: string): Promise<void> {
  const factoryDir = path.join(path.resolve(root), ".factory");
  await rm(path.join(factoryDir, "metafab.yaml"), { force: true });
  await rm(path.join(factoryDir, "README.md"), { force: true });
}

export async function validateFab(root: string, options: ValidateFabOptions): Promise<ValidatedFab> {
  const sourceLabel = options.sourceLabel;
  const absoluteRoot = path.resolve(root);
  const factoryDir = path.join(absoluteRoot, ".factory");

  if (!(await isDirectory(factoryDir))) {
    throw invalidFab(sourceLabel, [
      {
        level: "error",
        file: sourceProblemFile(sourceLabel, ".factory"),
        line: 1,
        message: "A fab must contain a .factory directory",
        fix: "Add .factory/ to the fab",
      },
    ]);
  }

  const format = await detectFormat(absoluteRoot, sourceLabel, options.packageJson);

  const factory = await loadFactory(absoluteRoot);
  const problems = factory.problems.map((problem) => ({
    ...problem,
    file: sourceProblemFile(sourceLabel, problem.file),
  }));

  if (problems.some((problem) => problem.level === "error")) {
    throw invalidFab(sourceLabel, problems);
  }

  return { factoryDir, format };
}
