import { chmod } from "node:fs/promises";
import { afterEach, describe, expect, test } from "vitest";
import { scanFactoryFiles } from "../../../src/core/check/index.js";
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

function markerProblem(file: string, line: number) {
  return {
    level: "error",
    file,
    line,
    message: "Unresolved conflict marker",
    fix: "Resolve the conflict, then run metafab build",
  };
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

    const problems = await scanFactoryFiles(target.root);

    expect(problems).toEqual([markerProblem(".factory/notes.md", line)]);
  });

  test("reports a lone opening, closing or base marker line", async () => {
    const target = await repo({
      ".factory/opening.md": "<<<<<<< HEAD\nleft\n",
      ".factory/closing.md": "right\n>>>>>>> branch\n",
      ".factory/base.md": "ours\n||||||| base\nbase\n",
    });

    const problems = await scanFactoryFiles(target.root);

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

    expect(await scanFactoryFiles(target.root)).toEqual([]);
  });

  test("reports a block whose closing marker was deleted", async () => {
    const target = await repo({
      ".factory/notes.md": "<<<<<<< HEAD\nours\n=======\ntheirs\n",
    });

    const problems = await scanFactoryFiles(target.root);

    expect(problems).toEqual([markerProblem(".factory/notes.md", 1)]);
  });

  test("reports a block whose separator gained a trailing space", async () => {
    const target = await repo({
      ".factory/notes.md": "<<<<<<< HEAD\nleft\n======= \nright\n>>>>>>> branch\n",
    });

    const problems = await scanFactoryFiles(target.root);

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

    const problems = await scanFactoryFiles(target.root);

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

    const problems = await scanFactoryFiles(target.root);

    expect(problems.map((problem) => [problem.file, problem.line])).toEqual([
      [".factory/late.bin", 2],
    ]);
  });

  test("finds a marker after a UTF-8 BOM on line 1", async () => {
    const target = await repo({
      ".factory/notes.md": Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from("<<<<<<< HEAD\nleft\n"),
      ]),
    });

    const problems = await scanFactoryFiles(target.root);

    expect(problems).toEqual([markerProblem(".factory/notes.md", 1)]);
  });

  test("finds a marker in a file that is not UTF-8", async () => {
    const target = await repo({
      // Byte 0xE9 is é in ISO-8859-1, and it is not valid UTF-8, so a strict
      // UTF-8 decode would fail on the first line.
      ".factory/latin1.md": Buffer.from("café\n<<<<<<< ours\n", "latin1"),
    });

    const problems = await scanFactoryFiles(target.root);

    expect(problems).toEqual([markerProblem(".factory/latin1.md", 2)]);
  });

  test("finds a marker in a UTF-16LE file with a BOM", async () => {
    const target = await repo({
      ".factory/utf16le.md": Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from("one\n<<<<<<< HEAD\nleft\n", "utf16le"),
      ]),
    });

    const problems = await scanFactoryFiles(target.root);

    expect(problems).toEqual([markerProblem(".factory/utf16le.md", 2)]);
  });

  test("finds a marker in a UTF-16BE file with a BOM", async () => {
    const bigEndian = Buffer.from("one\n<<<<<<< HEAD\nleft\n", "utf16le");
    bigEndian.swap16();

    const target = await repo({
      ".factory/utf16be.md": Buffer.concat([Buffer.from([0xfe, 0xff]), bigEndian]),
    });

    const problems = await scanFactoryFiles(target.root);

    expect(problems).toEqual([markerProblem(".factory/utf16be.md", 2)]);
  });

  test("passes a UTF-16LE file with a BOM and no marker", async () => {
    const target = await repo({
      ".factory/utf16le.md": Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from("one\ntwo\n", "utf16le"),
      ]),
    });

    expect(await scanFactoryFiles(target.root)).toEqual([]);
  });

  test("skips a UTF-16LE file without a BOM as binary", async () => {
    const target = await repo({
      ".factory/utf16le.md": Buffer.from("<<<<<<< HEAD\nleft\n", "utf16le"),
    });

    expect(await scanFactoryFiles(target.root)).toEqual([]);
  });

  test("CRLF does not hide a block", async () => {
    const target = await repo({
      ".factory/crlf.md": "one\r\n<<<<<<< HEAD\r\n=======\r\n>>>>>>> branch\r\n",
    });

    const problems = await scanFactoryFiles(target.root);

    expect(problems).toHaveLength(1);
    expect(problems[0]?.file).toBe(".factory/crlf.md");
    expect(problems[0]?.line).toBe(2);
  });

  test("does not report a block without the trailing spaces", async () => {
    const target = await repo({
      ".factory/notes.md": "<<<<<<<HEAD\nleft\n=======\nright\n>>>>>>>branch\n",
    });

    expect(await scanFactoryFiles(target.root)).toEqual([]);
  });

  test("skips directories whose name starts with '.'", async () => {
    const target = await repo({
      ".factory/.git/MERGE_MSG": "<<<<<<< HEAD\nleft\n=======\nright\n>>>>>>> branch\n",
      ".factory/.hidden/notes.md": "<<<<<<< HEAD\nleft\n=======\nright\n>>>>>>> branch\n",
      ".factory/notes.md": "clean\n",
    });

    expect(await scanFactoryFiles(target.root)).toEqual([]);
  });
});

describe(".upstream scanner", () => {
  test("reports every .upstream file with line 1", async () => {
    const target = await repo({
      ".factory/skills/demo/SKILL.md.upstream": "theirs\n",
      ".factory/AGENTS.md.upstream": "theirs\n",
      ".factory/skills/demo/SKILL.md": "ours\n",
    });

    const problems = await scanFactoryFiles(target.root);

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

    expect(await scanFactoryFiles(target.root)).toEqual([]);
  });

  test("skips directories whose name starts with '.'", async () => {
    const target = await repo({
      ".factory/.hidden/x.md.upstream": "theirs\n",
      ".factory/.git/COMMIT_EDITMSG": "=======\n",
    });

    expect(await scanFactoryFiles(target.root)).toEqual([]);
  });
});

describe("single scan", () => {
  test("reports markers before .upstream files from one walk", async () => {
    const target = await repo({
      ".factory/notes.md.upstream": "theirs\n",
      ".factory/notes.md": "<<<<<<< HEAD\nleft\n",
    });

    const problems = await scanFactoryFiles(target.root);

    expect(problems.map((problem) => problem.message)).toEqual([
      "Unresolved conflict marker",
      "Unresolved .upstream conflict file",
    ]);
  });

  const unreadableSkip = process.platform === "win32" || process.getuid?.() === 0;

  test.skipIf(unreadableSkip)(
    "reports one Cannot read problem for an unreadable directory and still reports .upstream files",
    async () => {
      const target = await repo({
        ".factory/locked/notes.md": "<<<<<<< HEAD\nleft\n",
        ".factory/notes.md.upstream": "theirs\n",
      });
      const locked = target.path(".factory", "locked");
      await chmod(locked, 0o000);

      try {
        const problems = await scanFactoryFiles(target.root);

        expect(problems).toEqual([
          {
            level: "error",
            file: ".factory/locked",
            line: 1,
            message: "Cannot read .factory/locked",
            fix: "Check its permissions",
          },
          {
            level: "error",
            file: ".factory/notes.md.upstream",
            line: 1,
            message: "Unresolved .upstream conflict file",
            fix: "Merge or delete the file, then run metafab build",
          },
        ]);
      } finally {
        await chmod(locked, 0o755);
      }
    },
  );
});
