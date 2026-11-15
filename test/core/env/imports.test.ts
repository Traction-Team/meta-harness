import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createImportCache, importTarget, resolveImport } from "../../../src/core/env/imports.js";
import type { ImportCache, ImportFailure } from "../../../src/core/env/imports.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

const WINDOWS = process.platform === "win32";
const ROOT = process.getuid?.() === 0;

const FRONTMATTER_FIX =
  "Move the directive below the closing ---; name and description stay the same in every environment";
const MISSING_FIX = "Add the file, or write the path of a file in .factory/";

const FROM = "workflows/a/SKILL.md";

let root: string;
let factoryDir: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "metafab-imports-"));
  factoryDir = path.join(root, ".factory");
  await mkdir(factoryDir, { recursive: true });
  vi.mocked(readFile).mockClear();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function cache(): ImportCache {
  return createImportCache(factoryDir);
}

async function write(relative: string, content: string | Uint8Array): Promise<string> {
  const target = path.join(factoryDir, ...relative.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
  return target;
}

async function resolved(
  from: string,
  argument: string,
  into: ImportCache = cache(),
): Promise<{ ok: true; real: string; loaded: { file: string; text: string; firstLine: number; problems: unknown[] } }> {
  const result = await resolveImport(from, argument, into);
  if (!result.ok) throw new Error(`expected a resolved import, got: ${result.message}`);
  return result;
}

function failure(result: { ok: boolean }): ImportFailure {
  if (result.ok) throw new Error("expected a failed import");
  return result as ImportFailure;
}

describe("importTarget", () => {
  test.each<[string, string, string]>([
    ["", "factory:import needs a path", "Write <!-- factory:import <path> -->"],
    ["   ", "factory:import needs a path", "Write <!-- factory:import <path> -->"],
    [
      "/abs.md",
      'Import path "/abs.md" must be relative to this file',
      "Write a path relative to this file, such as ../partials/x.md",
    ],
    [
      "C:/x.md",
      'Import path "C:/x.md" must be relative to this file',
      "Write a path relative to this file, such as ../partials/x.md",
    ],
    [
      "C:\\x.md",
      'Import path "C:\\x.md" must be relative to this file',
      "Write a path relative to this file, such as ../partials/x.md",
    ],
    [
      "\\\\server\\x.md",
      'Import path "\\\\server\\x.md" must be relative to this file',
      "Write a path relative to this file, such as ../partials/x.md",
    ],
    [
      "..\\partials\\x.md",
      'Import path "..\\partials\\x.md" must use /',
      "Write it with / instead of \\",
    ],
    [
      "x.txt",
      'Import path "x.txt" must name a .md file',
      "Import a .md file, such as ../partials/x.md",
    ],
    [
      "../../../x.md",
      'Import "../../../x.md" leaves .factory/',
      "Import a file inside .factory/",
    ],
  ])("rejects %j without touching the disk", (argument, message, fix) => {
    expect(importTarget(FROM, argument)).toEqual({ ok: false, message, fix });
  });

  test.each<[string, string]>([
    ["../../partials/x.md", "partials/x.md"],
    ["../../partials/my notes.md", "partials/my notes.md"],
    ["../../.drafts/x.md", ".drafts/x.md"],
    ["../../a//b.md", "a/b.md"],
    ["../.././x.md", "x.md"],
    ["../../X.MD", "X.MD"],
  ])("resolves %j to %j", (argument, target) => {
    expect(importTarget(FROM, argument)).toEqual({ ok: true, target });
  });

  test("a path in the factory root resolves from AGENTS.md", () => {
    expect(importTarget("AGENTS.md", "./x.md")).toEqual({ ok: true, target: "x.md" });
    expect(importTarget("AGENTS.md", "README.md")).toEqual({ ok: true, target: "README.md" });
  });
});

describe("resolveImport", () => {
  test("reads a partial's body, dropping its one trailing newline", async () => {
    const target = await write("partials/x.md", "One.\nTwo.\n");

    const result = await resolved(FROM, "../../partials/x.md");

    expect(result.loaded).toEqual({
      file: ".factory/partials/x.md",
      text: "One.\nTwo.",
      firstLine: 1,
      problems: [],
    });
    expect(result.real).toBe(await realpath(target));
  });

  test("removes the frontmatter and reports where the body starts", async () => {
    await write("partials/x.md", "---\nname: x\ndescription: y\n---\nBody.\n");

    const result = await resolved(FROM, "../../partials/x.md");

    expect(result.loaded.text).toBe("Body.");
    expect(result.loaded.firstLine).toBe(5);
  });

  test("removes a BOM, with and without frontmatter", async () => {
    await write("partials/bom.md", "\uFEFF---\nname: x\n---\nBody.\n");
    await write("partials/plain.md", "\uFEFFBody.\n");

    const withFrontmatter = await resolved(FROM, "../../partials/bom.md");
    const without = await resolved(FROM, "../../partials/plain.md");

    expect([withFrontmatter.loaded.text, withFrontmatter.loaded.firstLine]).toEqual(["Body.", 4]);
    expect([without.loaded.text, without.loaded.firstLine]).toEqual(["Body.", 1]);
  });

  test("writes CRLF as LF", async () => {
    await write("partials/x.md", "One.\r\nTwo.\r\n");

    const result = await resolved(FROM, "../../partials/x.md");

    expect(result.loaded.text).toBe("One.\nTwo.");
  });

  test("an empty body or a frontmatter-only file inserts nothing", async () => {
    await write("partials/empty.md", "");
    await write("partials/front.md", "---\nname: x\n---\n");

    expect((await resolved(FROM, "../../partials/empty.md")).loaded.text).toBe("");
    const front = await resolved(FROM, "../../partials/front.md");
    expect([front.loaded.text, front.loaded.firstLine]).toEqual(["", 4]);
  });

  test("a path that differs only in letter case names the actual spelling", async () => {
    await write("partials/x.md", "Body.\n");

    expect(failure(await resolveImport("AGENTS.md", "Partials/x.md", cache()))).toEqual({
      ok: false,
      message: 'Import "Partials/x.md" differs in letter case from "partials"',
      fix: 'Write "partials/x.md"',
    });
    expect(failure(await resolveImport("AGENTS.md", "partials/X.md", cache()))).toEqual({
      ok: false,
      message: 'Import "partials/X.md" differs in letter case from "x.md"',
      fix: 'Write "partials/x.md"',
    });
  });

  test("a missing file is not found", async () => {
    await write("partials/x.md", "Body.\n");

    expect(failure(await resolveImport("AGENTS.md", "partials/y.md", cache()))).toEqual({
      ok: false,
      message: 'Import "partials/y.md" does not exist',
      fix: MISSING_FIX,
    });
  });

  test("a directory named .md is an error", async () => {
    await mkdir(path.join(factoryDir, "notes.md"), { recursive: true });

    expect(failure(await resolveImport("AGENTS.md", "notes.md", cache()))).toEqual({
      ok: false,
      message: 'Import "notes.md" is a directory',
      fix: "Import a .md file inside it",
    });
  });

  test("a path that leaves .factory/ is refused before any read", async () => {
    await writeFile(path.join(root, "outside.md"), "Outside.\n");

    expect(failure(await resolveImport(FROM, "../../../outside.md", cache()))).toEqual({
      ok: false,
      message: 'Import "../../../outside.md" leaves .factory/',
      fix: "Import a file inside .factory/",
    });
    expect(vi.mocked(readFile)).not.toHaveBeenCalled();
  });

  test.skipIf(WINDOWS)("a file symlink out of .factory/ is refused unread", async () => {
    const outside = path.join(root, "outside.md");
    await writeFile(outside, "Outside.\n");
    await symlink(outside, path.join(factoryDir, "link.md"));

    expect(failure(await resolveImport("AGENTS.md", "link.md", cache()))).toEqual({
      ok: false,
      message: 'Import "link.md" resolves outside .factory/',
      fix: "Import a file inside .factory/",
    });
    expect(vi.mocked(readFile)).not.toHaveBeenCalledWith(outside);
  });

  test.skipIf(WINDOWS)("a symlinked parent inside .factory/ is followed", async () => {
    await write("partials/x.md", "Body.\n");
    await symlink(path.join(factoryDir, "partials"), path.join(factoryDir, "shared"));

    const result = await resolved(FROM, "../../shared/x.md");

    expect(result.loaded.file).toBe(".factory/partials/x.md");
    expect(result.loaded.text).toBe("Body.");
  });

  test.skipIf(WINDOWS)("a symlinked parent outside .factory/ is refused unread", async () => {
    const outside = path.join(root, "outside");
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(outside, "x.md"), "Outside.\n");
    await symlink(outside, path.join(factoryDir, "ext"));

    expect(failure(await resolveImport(FROM, "../../ext/x.md", cache()))).toEqual({
      ok: false,
      message: 'Import "../../ext/x.md" resolves outside .factory/',
      fix: "Import a file inside .factory/",
    });
    expect(vi.mocked(readFile)).not.toHaveBeenCalledWith(path.join(outside, "x.md"));
  });

  test.skipIf(WINDOWS || ROOT)("an unreadable file cannot be read", async () => {
    const target = await write("partials/x.md", "Body.\n");
    await chmod(target, 0o000);

    expect(failure(await resolveImport(FROM, "../../partials/x.md", cache()))).toEqual({
      ok: false,
      message: 'Import "../../partials/x.md" cannot be read',
      fix: "Check its permissions",
    });
  });

  test("a NUL byte is not a text file", async () => {
    await write("partials/x.md", Buffer.from("a\0b"));

    expect(failure(await resolveImport(FROM, "../../partials/x.md", cache()))).toEqual({
      ok: false,
      message: 'Import "../../partials/x.md" is not a UTF-8 text file',
      fix: "Replace it with a UTF-8 text file",
    });
  });

  test("unterminated frontmatter is an error", async () => {
    await write("partials/x.md", "---\nname: x\n");

    expect(failure(await resolveImport(FROM, "../../partials/x.md", cache()))).toEqual({
      ok: false,
      message: 'Import "../../partials/x.md" has unterminated frontmatter',
      fix: "Add a line that contains only --- after the frontmatter",
    });
  });

  test("a directive in the partial's frontmatter is a problem in the partial", async () => {
    await write("partials/x.md", "---\nname: x\n<!-- factory:when env.harness == amp -->\n---\nBody.\n");

    const result = await resolved(FROM, "../../partials/x.md");

    expect(result.loaded.problems).toEqual([
      {
        level: "error",
        file: ".factory/partials/x.md",
        line: 3,
        message: "Directives are not allowed in frontmatter",
        fix: FRONTMATTER_FIX,
      },
    ]);
    expect(result.loaded.text).toBe("Body.");
  });

  test.each<[string, string]>([
    ["partials/my notes.md", "partials/my notes.md"],
    [".drafts/x.md", ".drafts/x.md"],
    ["a//b.md", "a/b.md"],
    ["./x.md", "x.md"],
  ])("the spec allows %j", async (argument, target) => {
    await write(target, "Body.\n");

    expect((await resolved("AGENTS.md", argument)).loaded.text).toBe("Body.");
  });

  test("the cache reads a file once, whichever route reaches it", async () => {
    const target = await write("partials/x.md", "Body.\n");
    await symlink(path.join(factoryDir, "partials"), path.join(factoryDir, "shared"));
    const into = cache();

    const first = await resolved(FROM, "../../partials/x.md", into);
    const second = await resolved(FROM, "../../shared/x.md", into);

    expect(second.loaded.file).toBe(first.loaded.file);
    expect(second.loaded.text).toBe(first.loaded.text);
    expect(vi.mocked(readFile).mock.calls.filter(([file]) => String(file) === target)).toHaveLength(1);
  });

  test("a second cache reads the file again, so an edited partial is fresh", async () => {
    const target = await write("partials/x.md", "Body.\n");
    await resolved(FROM, "../../partials/x.md");

    await writeFile(target, "Edited.\n");
    const result = await resolved(FROM, "../../partials/x.md");

    expect(result.loaded.text).toBe("Edited.");
  });
});
