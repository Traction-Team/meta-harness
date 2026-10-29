import { afterEach, describe, expect, test } from "vitest";
import { scanConflictMarkers, scanUpstreamFiles } from "../../../src/core/check/index.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";

const repos: TempRepo[] = [];

function track(repo: TempRepo): TempRepo {
  repos.push(repo);
  return repo;
}

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

function repo(files: RepoFiles): Promise<TempRepo> {
  return makeRepo(files).then(track);
}

describe("conflict marker scanner", () => {
  test.each([
    ["<<<<<<< HEAD", "<<<<<<< HEAD"],
    [">>>>>>> branch", ">>>>>>> branch"],
    ["=======", "======="],
    ["||||||| base", "||||||| base"],
  ])("finds a %s marker", async (_label, marker) => {
    const target = await repo({
      ".factory/notes.md": `# Notes\n\n${marker}\ncontent\n`,
    });

    const problems = await scanConflictMarkers(target.root);

    expect(problems).toEqual([
      {
        level: "error",
        file: ".factory/notes.md",
        line: 3,
        message: "Unresolved conflict marker",
        fix: "Resolve the conflict, then run metafab build",
      },
    ]);
  });

  test("reports only the first marker line in each file", async () => {
    const target = await repo({
      ".factory/a.md": "one\n<<<<<<< HEAD\n=======\n>>>>>>> branch\n",
      ".factory/nested/b.md": "one\ntwo\n=======\n",
    });

    const problems = await scanConflictMarkers(target.root);

    expect(problems.map((problem) => [problem.file, problem.line])).toEqual([
      [".factory/a.md", 2],
      [".factory/nested/b.md", 3],
    ]);
  });

  test("skips binary files and CRLF does not hide a marker", async () => {
    const target = await repo({
      ".factory/data.bin": Buffer.from([0x00, 0x3c, 0x3c, 0x3c, 0x3c, 0x3c, 0x3c, 0x3c, 0x20]),
      ".factory/crlf.md": "one\r\n=======\r\n",
    });

    const problems = await scanConflictMarkers(target.root);

    expect(problems).toHaveLength(1);
    expect(problems[0]?.file).toBe(".factory/crlf.md");
    expect(problems[0]?.line).toBe(2);
  });

  test("does not report a marker without the trailing space", async () => {
    const target = await repo({
      ".factory/notes.md": "<<<<<<<HEAD\n>>>>>>>branch\n",
    });

    expect(await scanConflictMarkers(target.root)).toEqual([]);
  });
});

describe(".upstream scanner", () => {
  test("reports every .upstream file with line 1", async () => {
    const target = await repo({
      ".factory/skills/demo/SKILL.md.upstream": "theirs\n",
      ".factory/AGENTS.md.upstream": "theirs\n",
      ".factory/skills/demo/SKILL.md": "ours\n",
    });

    const problems = await scanUpstreamFiles(target.root);

    expect(problems.map((problem) => problem.file)).toEqual([
      ".factory/AGENTS.md.upstream",
      ".factory/skills/demo/SKILL.md.upstream",
    ]);
    for (const problem of problems) {
      expect(problem).toEqual({
        level: "error",
        file: problem.file,
        line: 1,
        message: "Unresolved .upstream conflict file",
        fix: "Merge or delete the file, then run metafab build",
      });
    }
  });

  test("ignores other files", async () => {
    const target = await repo({ ".factory/notes.md": "upstream\n" });

    expect(await scanUpstreamFiles(target.root)).toEqual([]);
  });
});
