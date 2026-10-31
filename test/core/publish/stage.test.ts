import { stat } from "node:fs/promises";
import { afterEach, describe, expect, test } from "vitest";
import { MetafabError } from "../../../src/errors.js";
import { exclusionMatcher, stageFab } from "../../../src/core/publish/index.js";
import type { StagedFab } from "../../../src/core/publish/index.js";
import { listFiles } from "../../../src/util/fs.js";
import { loadRepo, makePublishRepo } from "./fixtures.js";
import type { PublishRepoOptions } from "./fixtures.js";
import type { TempRepo } from "../../helpers/makeRepo.js";

const repos: TempRepo[] = [];
const staged: StagedFab[] = [];

afterEach(async () => {
  await Promise.all(staged.splice(0).map((fab) => fab.cleanup()));
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

async function repo(options: PublishRepoOptions = {}): Promise<TempRepo> {
  const created = await makePublishRepo(options);
  repos.push(created);
  return created;
}

async function stage(
  options: PublishRepoOptions = {},
  exclude: string[] = [],
): Promise<{ target: TempRepo; fab: StagedFab; files: string[] }> {
  const target = await repo(options);
  const { factory } = await loadRepo(target);
  const fab = await stageFab(factory, { exclude });
  staged.push(fab);
  return { target, fab, files: await listFiles(fab.root) };
}

const EXTRA_WORKFLOW = {
  ".factory/workflows/extra/SKILL.md":
    "---\nname: extra\ndescription: Extra. Use when testing.\n---\n\n# Extra\n",
};

describe("exclusionMatcher", () => {
  test("matches a file and every path below an excluded directory", () => {
    const matches = exclusionMatcher(["skills/our-api/**", "workflows/old"]);

    expect(matches("skills/our-api/SKILL.md")).toBe(true);
    expect(matches("skills/our-api-other/SKILL.md")).toBe(false);
    expect(matches("workflows/old")).toBe(true);
    expect(matches("workflows/old/SKILL.md")).toBe(true);
  });

  test("matches dot files when the glob asks for them", () => {
    const matches = exclusionMatcher(["skills/git/.*"]);

    expect(matches("skills/git/.notes")).toBe(true);
    expect(matches("skills/git/SKILL.md")).toBe(false);
  });
});

describe("stageFab", () => {
  test("never stages metafab.yaml or the factory README", async () => {
    const { files } = await stage({
      files: { ".factory/skills/git/README.md": "# A README inside a skill\n" },
    });

    expect(files).not.toContain(".factory/metafab.yaml");
    expect(files).not.toContain(".factory/README.md");
    expect(files).toContain(".factory/skills/git/README.md");
    expect(files).toContain(".factory/AGENTS.md");
  });

  test("keeps file modes", async () => {
    const { fab } = await stage();

    const info = await stat(fab.factoryDir + "/scripts/release.sh");
    expect(info.mode & 0o777).toBe(0o755);
  });

  test("leaves out publish.exclude globs, including dot files", async () => {
    const { files } = await stage(
      {
        files: {
          ".factory/skills/git/.notes": "private notes\n",
          ...EXTRA_WORKFLOW,
        },
      },
      ["skills/git", "workflows/extra/**"],
    );

    expect(files).toContain(".factory/workflows/plan/SKILL.md");
    expect(files).not.toContain(".factory/skills/git/SKILL.md");
    expect(files).not.toContain(".factory/skills/git/.notes");
    expect(files).not.toContain(".factory/workflows/extra/SKILL.md");
  });

  test("fails when an excluded workflow is still in the pipeline", async () => {
    const target = await repo();
    const { factory } = await loadRepo(target);

    const error = (await stageFab(factory, { exclude: ["workflows/build/**"] }).catch(
      (failure: unknown) => failure,
    )) as MetafabError;

    expect(error).toBeInstanceOf(MetafabError);
    expect(error.code).toBe("publish-excluded-workflow");
    expect(error.problems).toEqual([
      {
        level: "error",
        file: ".factory/factory.yaml",
        line: 6,
        message: 'Pipeline names excluded workflow "build"',
        fix: 'Remove "workflows/build" from publish.exclude or the workflow from the pipeline',
      },
    ]);
  });

  test("an excluded workflow outside the pipeline is allowed", async () => {
    const { files } = await stage({ files: EXTRA_WORKFLOW }, ["workflows/extra/**"]);

    expect(files).not.toContain(".factory/workflows/extra/SKILL.md");
    expect(files).toContain(".factory/workflows/plan/SKILL.md");
  });
});
