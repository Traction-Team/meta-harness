import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { copyTree } from "../../util/fs.js";
import { loadFactory } from "../factory/index.js";
import type { Factory } from "../factory/index.js";
import { exclusionMatcher } from "./exclude.js";
import type { StageOptions, StagedFab } from "./types.js";

/** Files the fab format forbids inside `.factory/`; see Sharing: Fab layout. */
const ALWAYS_EXCLUDED = new Set(["metafab.yaml", "README.md"]);

function stagingError(message: string, code: string, problems: Problem[]): MetafabError {
  return new MetafabError(message, {
    exitCode: ExitCode.Failed,
    code,
    problems,
  });
}

/**
 * A workflow that `publish.exclude` removes while the pipeline still names it
 * leaves a fab whose `factory.yaml` points at nothing, so staging stops before
 * it copies a file.
 */
function excludedWorkflowProblems(
  factory: Factory,
  isExcluded: (relativePath: string) => boolean,
): Problem[] {
  const problems: Problem[] = [];

  for (const entry of factory.factoryYaml?.pipeline ?? []) {
    const workflow = factory.skills.find(
      (skill) => skill.isWorkflow && skill.name === entry.workflow,
    );
    if (workflow === undefined) continue;
    if (!isExcluded(`${workflow.relDir}/SKILL.md`)) continue;

    problems.push({
      level: "error",
      file: ".factory/factory.yaml",
      line: entry.line,
      message: `Pipeline names excluded workflow "${entry.workflow}"`,
      fix: `Remove "${workflow.relDir}" from publish.exclude or the workflow from the pipeline`,
    });
  }

  return problems;
}

/**
 * Copies `.factory/` into a temporary directory for publishing, keeping file
 * modes, without `metafab.yaml`, without `.factory/README.md` and without every
 * `publish.exclude` glob. The copy is validated again, because an exclude can
 * break a reference.
 */
export async function stageFab(factory: Factory, options: StageOptions = {}): Promise<StagedFab> {
  const isExcluded = exclusionMatcher(options.exclude ?? []);

  const problems = excludedWorkflowProblems(factory, isExcluded);
  if (problems.length > 0) {
    throw stagingError(
      "The fab would lose a workflow that the pipeline names.",
      "publish-excluded-workflow",
      problems,
    );
  }

  const root = await mkdtemp(path.join(tmpdir(), "metafab-publish-"));
  const factoryDir = path.join(root, ".factory");

  try {
    await mkdir(factoryDir, { recursive: true });
    await copyTree(factory.dir, factoryDir, {
      ignore: (relativePath, isDirectory) =>
        !isDirectory && (ALWAYS_EXCLUDED.has(relativePath) || isExcluded(relativePath)),
    });

    const staged = await loadFactory(root);
    const errors = staged.problems.filter((problem) => problem.level === "error");
    if (errors.length > 0) {
      throw stagingError(
        "The fab is invalid after publish.exclude.",
        "publish-invalid-fab",
        errors,
      );
    }
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }

  return {
    root,
    factoryDir,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
