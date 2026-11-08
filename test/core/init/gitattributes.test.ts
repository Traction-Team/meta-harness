import { readFile, symlink } from "node:fs/promises";
import { afterEach, describe, expect, test } from "vitest";
import { MetafabError } from "../../../src/errors.js";
import {
  GITATTRIBUTES_FILE,
  GITATTRIBUTES_LINES,
  addGitattributesLines,
  assertGitattributesWritable,
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

describe.skipIf(process.platform === "win32")("assertGitattributesWritable", () => {
  test("refuses a dangling link with the init message, fix and code", async () => {
    const repo = await repoWith();
    await symlink("../outside", repo.path(GITATTRIBUTES_FILE));

    try {
      await assertGitattributesWritable(repo.root, "init");
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      const refusal = error as MetafabError;
      expect(refusal.code).toBe("factory-unreadable");
      expect(refusal.exitCode).toBe(1);
      expect(refusal.message).toBe(
        ".gitattributes is a symbolic link, so metafab init will not write through it",
      );
      expect(refusal.problems?.[0]?.fix).toBe(
        "Replace it with a regular file, then run metafab init again",
      );
    }
  });

  test("names import in the message and the fix", async () => {
    const repo = await repoWith();
    await symlink("../outside", repo.path(GITATTRIBUTES_FILE));

    await expect(assertGitattributesWritable(repo.root, "import")).rejects.toThrow(
      ".gitattributes is a symbolic link, so metafab import will not write through it",
    );
  });

  test("refuses a link to a file that is missing a line", async () => {
    const repo = await repoWith({ "shared/attrs": `${GITATTRIBUTES_LINES[0]}\n` });
    await symlink("shared/attrs", repo.path(GITATTRIBUTES_FILE));

    await expect(assertGitattributesWritable(repo.root, "init")).rejects.toThrow(
      "will not write through it",
    );
    expect(await readFile(repo.path("shared", "attrs"), "utf8")).toBe(`${GITATTRIBUTES_LINES[0]}\n`);
  });

  test("leaves a link to a file that already has every line alone", async () => {
    const content = `${GITATTRIBUTES_LINES.join("\n")}\n`;
    const repo = await repoWith({ "shared/attrs": content });
    await symlink("shared/attrs", repo.path(GITATTRIBUTES_FILE));

    await expect(assertGitattributesWritable(repo.root, "init")).resolves.toBeUndefined();
  });

  test("leaves a regular file alone", async () => {
    const repo = await repoWith({ [GITATTRIBUTES_FILE]: "*.png binary\n" });

    await expect(assertGitattributesWritable(repo.root, "init")).resolves.toBeUndefined();
  });
});
