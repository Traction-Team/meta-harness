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
    ["a plain block", "<<<<<<< HEAD\nleft\n=======\nright\n>>>>>>> branch\n", 3],
    [
      "a block with a base section",
      "<<<<<<< HEAD\nours\n||||||| base\nbase\n=======\ntheirs\n>>>>>>> branch\n",
      3,
    ],
    [
      "a block inside a fenced example",
      "```\n<<<<<<< HEAD\nleft\n=======\nright\n>>>>>>> branch\n```\n",
      4,
    ],
  ])("finds %s", async (_label, block, line) => {
    const target = await repo({ ".factory/notes.md": `# Notes\n\n${block}` });

    const problems = await scanConflictMarkers(target.root);

    expect(problems).toEqual([
      {
        level: "error",
        file: ".factory/notes.md",
        line,
        message: "Unresolved conflict marker",
        fix: "Resolve the conflict, then run metafab build",
      },
    ]);
  });

  test("reports a lone opening, closing or base marker line", async () => {
    const target = await repo({
      ".factory/opening.md": "<<<<<<< HEAD\nleft\n",
      ".factory/closing.md": "right\n>>>>>>> branch\n",
      ".factory/base.md": "ours\n||||||| base\nbase\n",
    });

    const problems = await scanConflictMarkers(target.root);

    expect(problems.map((problem) => [problem.file, problem.line])).toEqual([
      [".factory/base.md", 2],
      [".factory/closing.md", 2],
      [".factory/opening.md", 1],
    ]);
  });

  test("does not report a lone separator line", async () => {
    const target = await repo({
      // A setext heading underline, not a conflict.
      ".factory/notes.md": "Sub\n=======\n",
    });

    expect(await scanConflictMarkers(target.root)).toEqual([]);
  });

  test("reports a block whose closing marker was deleted", async () => {
    const target = await repo({
      ".factory/notes.md": "<<<<<<< HEAD\nours\n=======\ntheirs\n",
    });

    const problems = await scanConflictMarkers(target.root);

    expect(problems).toEqual([
      {
        level: "error",
        file: ".factory/notes.md",
        line: 1,
        message: "Unresolved conflict marker",
        fix: "Resolve the conflict, then run metafab build",
      },
    ]);
  });

  test("reports a block whose separator gained a trailing space", async () => {
    const target = await repo({
      ".factory/notes.md": "<<<<<<< HEAD\nleft\n======= \nright\n>>>>>>> branch\n",
    });

    const problems = await scanConflictMarkers(target.root);

    expect(problems.map((problem) => [problem.file, problem.line])).toEqual([
      [".factory/notes.md", 1],
    ]);
  });

  test("reports only the first marker line in each file", async () => {
    const target = await repo({
      ".factory/a.md":
        "one\n<<<<<<< HEAD\n=======\n>>>>>>> branch\n<<<<<<< HEAD\n=======\n>>>>>>> other\n",
      ".factory/nested/b.md": "one\ntwo\n<<<<<<< HEAD\n=======\n>>>>>>> branch\n",
    });

    const problems = await scanConflictMarkers(target.root);

    expect(problems.map((problem) => [problem.file, problem.line])).toEqual([
      [".factory/a.md", 2],
      [".factory/nested/b.md", 3],
    ]);
  });

  test("the first 8 KiB decide whether a file is binary", async () => {
    const block = "\n<<<<<<< HEAD\n=======\n>>>>>>> branch\n";
    const target = await repo({
      // A NUL inside the probe: skipped even though a marker follows it.
      ".factory/early.bin": Buffer.concat([
        Buffer.from([0x00]),
        Buffer.from("a".repeat(9000)),
        Buffer.from(block),
      ]),
      // A NUL after the probe: the file is text, so the marker is reported.
      ".factory/late.bin": Buffer.concat([
        Buffer.from("a".repeat(9000)),
        Buffer.from([0x00]),
        Buffer.from(block),
      ]),
    });

    const problems = await scanConflictMarkers(target.root);

    expect(problems.map((problem) => [problem.file, problem.line])).toEqual([
      [".factory/late.bin", 2],
    ]);
  });

  test("CRLF does not hide a block", async () => {
    const target = await repo({
      ".factory/crlf.md": "one\r\n<<<<<<< HEAD\r\n=======\r\n>>>>>>> branch\r\n",
    });

    const problems = await scanConflictMarkers(target.root);

    expect(problems).toHaveLength(1);
    expect(problems[0]?.file).toBe(".factory/crlf.md");
    expect(problems[0]?.line).toBe(2);
  });

  test("does not report a block without the trailing spaces", async () => {
    const target = await repo({
      ".factory/notes.md": "<<<<<<<HEAD\nleft\n=======\nright\n>>>>>>>branch\n",
    });

    expect(await scanConflictMarkers(target.root)).toEqual([]);
  });

  test("skips directories whose name starts with '.'", async () => {
    const target = await repo({
      ".factory/.git/MERGE_MSG": "<<<<<<< HEAD\nleft\n=======\nright\n>>>>>>> branch\n",
      ".factory/.hidden/notes.md": "<<<<<<< HEAD\nleft\n=======\nright\n>>>>>>> branch\n",
      ".factory/notes.md": "clean\n",
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

  test("skips directories whose name starts with '.'", async () => {
    const target = await repo({
      ".factory/.hidden/x.md.upstream": "theirs\n",
      ".factory/.git/COMMIT_EDITMSG": "=======\n",
    });

    expect(await scanUpstreamFiles(target.root)).toEqual([]);
  });
});
