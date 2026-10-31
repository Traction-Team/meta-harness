import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, test } from "vitest";
import {
  GITATTRIBUTES_FILE,
  GITATTRIBUTES_LINES,
  addGitattributesLines,
  ensureGitattributes,
} from "../../../src/core/init/gitattributes.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";

const SPEC_LINES = [
  ".factory/** text=auto eol=lf",
  ".claude/skills/** text=auto eol=lf",
  ".agents/skills/** text=auto eol=lf",
];

const repos: TempRepo[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

async function repoWith(files: Record<string, string> = {}): Promise<TempRepo> {
  const repo = await makeRepo(files);
  repos.push(repo);
  return repo;
}

describe("GITATTRIBUTES_LINES", () => {
  test("matches the specification exactly and in order", () => {
    expect([...GITATTRIBUTES_LINES]).toEqual(SPEC_LINES);
  });
});

describe("addGitattributesLines", () => {
  test("adds every line to an absent file", () => {
    const change = addGitattributesLines(undefined);

    expect(change.changed).toBe(true);
    expect(change.added).toEqual(SPEC_LINES);
    expect(change.text).toBe(`${SPEC_LINES.join("\n")}\n`);
  });

  test("adds only the missing lines and preserves existing content", () => {
    const existing = "# Keep this comment\n.factory/** text=auto eol=lf\n";

    const change = addGitattributesLines(existing);

    expect(change.changed).toBe(true);
    expect(change.added).toEqual(SPEC_LINES.slice(1));
    expect(change.text).toBe(
      "# Keep this comment\n.factory/** text=auto eol=lf\n.claude/skills/** text=auto eol=lf\n.agents/skills/** text=auto eol=lf\n",
    );
  });

  test("adds a newline before the first line when the file does not end with one", () => {
    const change = addGitattributesLines("*.png binary");

    expect(change.text).toBe(`*.png binary\n${SPEC_LINES.join("\n")}\n`);
  });

  test("changes nothing when every line is present", () => {
    const existing = `${SPEC_LINES.join("\n")}\n`;

    expect(addGitattributesLines(existing)).toEqual({
      changed: false,
      text: existing,
      added: [],
    });
  });

  test("is idempotent", () => {
    const first = addGitattributesLines("*.png binary");
    const second = addGitattributesLines(first.text);

    expect(second.changed).toBe(false);
    expect(second.text).toBe(first.text);
    expect(second.added).toEqual([]);
  });

  test("keeps CRLF line endings in existing content", () => {
    const existing = "*.png binary\r\n";

    const change = addGitattributesLines(existing);

    expect(change.text.startsWith("*.png binary\r\n")).toBe(true);
    expect(change.changed).toBe(true);
  });

  test("treats a commented-out line as missing", () => {
    const existing = "# .factory/** text=auto eol=lf\n";

    const change = addGitattributesLines(existing);

    expect(change.added).toEqual(SPEC_LINES);
  });
});

describe("ensureGitattributes", () => {
  test("creates the file when it is absent", async () => {
    const repo = await repoWith();

    const change = await ensureGitattributes(repo.root);

    expect(change.changed).toBe(true);
    expect(change.added).toEqual(SPEC_LINES);
    expect(await readFile(repo.path(GITATTRIBUTES_FILE), "utf8")).toBe(
      `${SPEC_LINES.join("\n")}\n`,
    );
  });

  test("reports no change on a second run", async () => {
    const repo = await repoWith();

    await ensureGitattributes(repo.root);
    const change = await ensureGitattributes(repo.root);

    expect(change.changed).toBe(false);
    expect(change.added).toEqual([]);
    expect(await readFile(repo.path(GITATTRIBUTES_FILE), "utf8")).toBe(
      `${SPEC_LINES.join("\n")}\n`,
    );
  });

  test("leaves an existing file that already has every line alone", async () => {
    const content = `${SPEC_LINES.join("\n")}\n# end\n`;
    const repo = await repoWith({ [GITATTRIBUTES_FILE]: content });

    const change = await ensureGitattributes(repo.root);

    expect(change.changed).toBe(false);
    expect(await readFile(repo.path(GITATTRIBUTES_FILE), "utf8")).toBe(content);
  });
});
