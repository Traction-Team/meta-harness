import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import * as tar from "tar";
import { describe, expect, test } from "vitest";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import { extractTarball } from "../../../src/core/sources/index.js";
import type { ExtractTarballOptions } from "../../../src/core/sources/index.js";
import { pathExists } from "../../../src/util/fs.js";

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "metafab-sources-"));
}

async function makeTar(archive: string, cwd: string, entries: string[], preservePaths = false): Promise<void> {
  // `jobs: 1` keeps tar's packer from ending its gzip stream twice: with
  // parallel jobs, the pending-hard-link re-processing can call back into the
  // packer after it has already ended the compressor, and the second `end`
  // makes zlib emit an unhandled Z_STREAM_ERROR.
  await tar.c({ file: archive, gzip: true, cwd, preservePaths, jobs: 1 }, entries);
}

interface RawEntry {
  path: string;
  type: "File" | "SymbolicLink" | "Link";
  linkpath?: string;
  body?: string;
}

async function makeRawTar(archive: string, entries: RawEntry[]): Promise<void> {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const body = entry.body === undefined ? undefined : Buffer.from(entry.body);
    const header = new tar.Header({
      path: entry.path,
      type: entry.type,
      ...(entry.linkpath === undefined ? {} : { linkpath: entry.linkpath }),
      size: body?.byteLength ?? 0,
      mode: 0o644,
      mtime: new Date(0),
    });
    const block = Buffer.alloc(512);
    header.encode(block);
    blocks.push(block);
    if (body !== undefined) {
      blocks.push(body);
      const padding = (512 - (body.byteLength % 512)) % 512;
      if (padding > 0) blocks.push(Buffer.alloc(padding));
    }
  }
  blocks.push(Buffer.alloc(1024));
  await writeFile(archive, Buffer.concat(blocks));
}

function emptyEntry(entryPath: string): Buffer {
  const block = Buffer.alloc(512);
  new tar.Header({
    path: entryPath,
    type: "File",
    size: 0,
    mode: 0o644,
    mtime: new Date(0),
  }).encode(block);
  return block;
}

async function expectInvalid(
  archive: string,
  destination: string,
  options: ExtractTarballOptions = {},
): Promise<MetafabError> {
  try {
    await extractTarball(archive, destination, options);
  } catch (error) {
    expect(error).toBeInstanceOf(MetafabError);
    const failure = error as MetafabError;
    expect(failure.exitCode).toBe(ExitCode.InvalidFab);
    expect(failure.code).toBe("invalid-fab");
    return failure;
  }
  throw new Error("expected extraction to fail");
}

// A chain of links that resolves outside the root is always rejected. Windows
// collapses `b/..` lexically before it follows the symlink, so the chain cannot
// be recreated there and the archive is rejected because a link target is
// missing instead. The rejection is the security guarantee; the wording is only
// guaranteed where the chain can be built.
function expectLinkEscapeRejection(failure: MetafabError): void {
  const messages = (failure.problems ?? []).map((problem) => problem.message);
  expect(messages.length).toBeGreaterThan(0);
  if (messages.some((message) => message.includes("outside"))) return;
  expect(process.platform).toBe("win32");
  expect(
    messages.some(
      (message) =>
        message.includes("does not exist") || message.includes("links could not be created"),
    ),
  ).toBe(true);
}

describe("extractTarball", () => {
  test("strips the npm package prefix", async () => {
    const base = await tempDir();
    try {
      const staging = path.join(base, "staging");
      await mkdir(path.join(staging, "package", ".factory"), { recursive: true });
      await writeFile(path.join(staging, "package", "package.json"), '{"name":"fab"}');
      await writeFile(path.join(staging, "package", ".factory", "factory.yaml"), "format: 1\n");
      const archive = path.join(base, "fab.tgz");
      await makeTar(archive, staging, ["package"]);

      const destination = path.join(base, "out");
      await extractTarball(archive, destination, { stripPrefix: "package/" });

      expect(await readFile(path.join(destination, "package.json"), "utf8")).toBe('{"name":"fab"}');
      expect(await readFile(path.join(destination, ".factory", "factory.yaml"), "utf8")).toBe("format: 1\n");
      expect(await pathExists(path.join(destination, "package"))).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("strips a single top-level directory", async () => {
    const base = await tempDir();
    try {
      const staging = path.join(base, "staging");
      await mkdir(path.join(staging, "repo-main", ".factory"), { recursive: true });
      await writeFile(path.join(staging, "repo-main", "README.md"), "readme");
      await writeFile(path.join(staging, "repo-main", ".factory", "factory.yaml"), "format: 1\n");
      const archive = path.join(base, "fab.tar.gz");
      await makeTar(archive, staging, ["repo-main"]);

      const destination = path.join(base, "out");
      await extractTarball(archive, destination, { flattenSingleDirectory: true });

      expect(await readFile(path.join(destination, "README.md"), "utf8")).toBe("readme");
      expect(await readFile(path.join(destination, ".factory", "factory.yaml"), "utf8")).toBe("format: 1\n");
      expect(await pathExists(path.join(destination, "repo-main"))).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("strips a single top-level directory written with a ./ prefix", async () => {
    const base = await tempDir();
    try {
      const staging = path.join(base, "staging");
      await mkdir(path.join(staging, "fab-acme-1.0.0", ".factory"), { recursive: true });
      await writeFile(path.join(staging, "fab-acme-1.0.0", "README.md"), "readme");
      await writeFile(
        path.join(staging, "fab-acme-1.0.0", ".factory", "factory.yaml"),
        "format: 1\n",
      );
      const archive = path.join(base, "fab.tgz");
      await makeTar(archive, staging, ["./fab-acme-1.0.0"]);

      const destination = path.join(base, "out");
      await extractTarball(archive, destination, { flattenSingleDirectory: true });

      expect(await readFile(path.join(destination, "README.md"), "utf8")).toBe("readme");
      expect(await readFile(path.join(destination, ".factory", "factory.yaml"), "utf8")).toBe(
        "format: 1\n",
      );
      expect(await pathExists(path.join(destination, "fab-acme-1.0.0"))).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("keeps a top-level .factory directory", async () => {
    const base = await tempDir();
    try {
      const staging = path.join(base, "staging");
      await mkdir(path.join(staging, ".factory"), { recursive: true });
      await writeFile(path.join(staging, ".factory", "factory.yaml"), "format: 1\n");
      const archive = path.join(base, "fab.tar.gz");
      await makeTar(archive, staging, [".factory"]);

      const destination = path.join(base, "out");
      await extractTarball(archive, destination, { flattenSingleDirectory: true });

      expect(await readFile(path.join(destination, ".factory", "factory.yaml"), "utf8")).toBe("format: 1\n");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects a path that escapes the extraction root", async () => {
    const base = await tempDir();
    try {
      const staging = path.join(base, "staging");
      await mkdir(staging, { recursive: true });
      await writeFile(path.join(base, "evil.txt"), "evil");
      const archive = path.join(base, "evil.tar.gz");
      await makeTar(archive, staging, ["../evil.txt"], true);

      const destination = path.join(base, "nested", "out");
      const failure = await expectInvalid(archive, destination);

      expect(failure.problems?.[0]?.file).toContain("..");
      expect(await pathExists(path.join(base, "nested", "evil.txt"))).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects an absolute path", async () => {
    const base = await tempDir();
    try {
      const staging = path.join(base, "staging");
      await mkdir(staging, { recursive: true });
      const passwd = path.join(base, "passwd");
      await writeFile(passwd, "root:x:0:0");
      const archive = path.join(base, "evil.tar.gz");
      await makeTar(archive, staging, [passwd], true);

      const failure = await expectInvalid(archive, path.join(base, "out"));

      expect(failure.problems?.[0]?.message).toContain("absolute");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects a symbolic link that points outside", async () => {
    const base = await tempDir();
    try {
      const staging = path.join(base, "staging");
      await mkdir(staging, { recursive: true });
      await symlink("/", path.join(staging, "link"));
      const archive = path.join(base, "evil.tar.gz");
      await makeTar(archive, staging, ["link"]);

      const failure = await expectInvalid(archive, path.join(base, "out"));

      expect(failure.problems?.[0]?.message).toContain("links");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("allows a symbolic link whose target stays inside the root", async () => {
    const base = await tempDir();
    try {
      const staging = path.join(base, "staging");
      await mkdir(path.join(staging, ".factory", "skills", "base"), { recursive: true });
      await mkdir(path.join(staging, ".factory", "templates"), { recursive: true });
      await writeFile(path.join(staging, ".factory", "skills", "base", "AGENTS.md"), "base\n");
      await symlink("../skills/base", path.join(staging, ".factory", "templates", "base"));
      const archive = path.join(base, "fab.tar.gz");
      await makeTar(archive, staging, [".factory"]);

      const destination = path.join(base, "out");
      await extractTarball(archive, destination);

      expect(
        await readFile(path.join(destination, ".factory", "templates", "base", "AGENTS.md"), "utf8"),
      ).toBe("base\n");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("allows a hard link whose target stays inside the root", async () => {
    const base = await tempDir();
    try {
      const staging = path.join(base, "staging");
      await mkdir(path.join(staging, ".factory"), { recursive: true });
      await writeFile(path.join(staging, ".factory", "a.md"), "shared\n");
      await link(path.join(staging, ".factory", "a.md"), path.join(staging, ".factory", "b.md"));
      const archive = path.join(base, "fab.tar.gz");
      await makeTar(archive, staging, [".factory"]);

      const destination = path.join(base, "out");
      await extractTarball(archive, destination);

      expect(await readFile(path.join(destination, ".factory", "a.md"), "utf8")).toBe("shared\n");
      expect(await readFile(path.join(destination, ".factory", "b.md"), "utf8")).toBe("shared\n");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects a hard link that points outside", async () => {
    const base = await tempDir();
    try {
      const archive = path.join(base, "evil.tar");
      await makeRawTar(archive, [
        { path: ".factory/escaped.md", type: "Link", linkpath: "../outside.md" },
      ]);

      const failure = await expectInvalid(archive, path.join(base, "out"));

      expect(failure.problems?.[0]?.message).toContain("links that point outside");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects a chain of links that leaves the factory", async () => {
    const base = await tempDir();
    try {
      const archive = path.join(base, "evil.tar");
      await makeRawTar(archive, [
        { path: ".factory/b", type: "SymbolicLink", linkpath: "." },
        { path: ".factory/a", type: "SymbolicLink", linkpath: "b/../outside" },
        { path: "outside", type: "File", body: "outside\n" },
      ]);

      const failure = await expectInvalid(archive, path.join(base, "out"));

      expectLinkEscapeRejection(failure);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects a root-level chain of links that leaves the destination", async () => {
    const base = await tempDir();
    try {
      await mkdir(path.join(base, "nested"), { recursive: true });
      await writeFile(path.join(base, "nested", "outside"), "outside\n");
      const archive = path.join(base, "evil.tar");
      await makeRawTar(archive, [
        { path: "b", type: "SymbolicLink", linkpath: "." },
        { path: "a", type: "SymbolicLink", linkpath: "b/../outside" },
      ]);

      const failure = await expectInvalid(archive, path.join(base, "nested", "out"));

      expectLinkEscapeRejection(failure);
      // The file the chain aimed at is untouched.
      expect(await readFile(path.join(base, "nested", "outside"), "utf8")).toBe("outside\n");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects a hard link whose target does not exist", async () => {
    const base = await tempDir();
    try {
      const archive = path.join(base, "evil.tar");
      await makeRawTar(archive, [
        { path: ".factory/b.md", type: "Link", linkpath: ".factory/a.md" },
      ]);

      const failure = await expectInvalid(archive, path.join(base, "out"));

      expect(failure.problems?.some((problem) => problem.message.includes("does not exist"))).toBe(
        true,
      );
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("allows a directory link whose target entry comes later", async () => {
    const base = await tempDir();
    try {
      const archive = path.join(base, "fab.tar");
      await makeRawTar(archive, [
        { path: ".factory/link", type: "SymbolicLink", linkpath: "target" },
        { path: ".factory/target/notes.md", type: "File", body: "notes\n" },
      ]);

      const destination = path.join(base, "out");
      await extractTarball(archive, destination);

      expect(
        await readFile(path.join(destination, ".factory", "link", "notes.md"), "utf8"),
      ).toBe("notes\n");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects an entry written through a symbolic link", async () => {
    const base = await tempDir();
    try {
      const archive = path.join(base, "evil.tar");
      await makeRawTar(archive, [
        { path: ".factory/link", type: "SymbolicLink", linkpath: "." },
        { path: ".factory/link/evil.md", type: "File", body: "evil\n" },
      ]);

      const failure = await expectInvalid(archive, path.join(base, "out"));

      expect(failure.problems?.[0]?.message).toContain("written through a symbolic link");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("normalises mixed ./ prefixes when stripping a single directory", async () => {
    const base = await tempDir();
    try {
      const archive = path.join(base, "fab.tar");
      await makeRawTar(archive, [
        { path: "./fab/.factory/factory.yaml", type: "File", body: "format: 1\n" },
        { path: "fab/.factory/AGENTS.md", type: "File", body: "agents\n" },
      ]);

      const destination = path.join(base, "out");
      await extractTarball(archive, destination, { flattenSingleDirectory: true });

      expect(await readFile(path.join(destination, ".factory", "factory.yaml"), "utf8")).toBe(
        "format: 1\n",
      );
      expect(await readFile(path.join(destination, ".factory", "AGENTS.md"), "utf8")).toBe(
        "agents\n",
      );
      expect(await pathExists(path.join(destination, "fab"))).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects an entry spelled .FACTORY", async () => {
    const base = await tempDir();
    try {
      const archive = path.join(base, "evil.tar");
      await makeRawTar(archive, [
        { path: "secret", type: "File", body: "secret\n" },
        { path: ".FACTORY/AGENTS.md", type: "File", body: "agents\n" },
        { path: ".FACTORY/skills/base/SKILL.md", type: "File", body: "skill\n" },
        { path: ".FACTORY/leak", type: "SymbolicLink", linkpath: "../secret" },
      ]);

      const destination = path.join(base, "out");
      const failure = await expectInvalid(archive, destination);

      expect(
        failure.problems?.some((problem) => problem.message.includes("collide with .factory")),
      ).toBe(true);
      expect(await pathExists(path.join(destination, ".factory"))).toBe(false);
      expect(await pathExists(path.join(destination, ".FACTORY"))).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects a case-variant .factory that would expose the destination root", async () => {
    const base = await tempDir();
    try {
      const probe = path.join(base, "probe", ".factory");
      await mkdir(probe, { recursive: true });
      const caseInsensitive = await pathExists(path.join(base, "probe", ".FACTORY"));

      const archive = path.join(base, "evil.tar");
      await makeRawTar(archive, [
        { path: "secret", type: "File", body: "secret\n" },
        { path: ".FACTORY/AGENTS.md", type: "File", body: "agents\n" },
        { path: ".FACTORY/skills/base/SKILL.md", type: "File", body: "skill\n" },
        { path: ".FACTORY/leak", type: "SymbolicLink", linkpath: "../secret" },
      ]);

      const destination = path.join(base, "out");
      const failure = await expectInvalid(archive, destination);

      expect(
        failure.problems?.some((problem) => problem.message.includes("collide with .factory")),
      ).toBe(true);
      if (caseInsensitive) {
        // `.FACTORY/leak` physically lives in `.factory`, so it must not resolve
        // `../secret` under either spelling.
        expect(await pathExists(path.join(destination, ".factory", "leak"))).toBe(false);
        expect(await pathExists(path.join(destination, ".FACTORY", "leak"))).toBe(false);
      } else {
        // A case-sensitive filesystem keeps the two directories apart; only the
        // spelling rejection applies.
        expect(await pathExists(path.join(destination, ".factory"))).toBe(false);
      }
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects an archive with too many entries", async () => {
    const base = await tempDir();
    try {
      const archive = path.join(base, "evil.tar");
      await makeRawTar(archive, [
        { path: ".factory/a.md", type: "File", body: "a\n" },
        { path: ".factory/b.md", type: "File", body: "b\n" },
        { path: ".factory/c.md", type: "File", body: "c\n" },
      ]);

      const failure = await expectInvalid(archive, path.join(base, "out"), { maxEntries: 2 });

      expect(failure.problems?.some((problem) => problem.message.includes("more than 2 entries"))).toBe(
        true,
      );
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("counts directories and links against the entry cap", async () => {
    const base = await tempDir();
    try {
      const staging = path.join(base, "staging");
      await mkdir(path.join(staging, ".factory", "one"), { recursive: true });
      await writeFile(path.join(staging, ".factory", "factory.yaml"), "format: 1\n");
      await writeFile(path.join(staging, ".factory", "one", "notes.md"), "notes\n");
      await symlink("factory.yaml", path.join(staging, ".factory", "link.md"));
      const archive = path.join(base, "fab.tar");
      await makeTar(archive, staging, [".factory"]);

      // Two files, two directories and one link: five entries. A cap that
      // counted only files would let this through at four.
      const failure = await expectInvalid(archive, path.join(base, "out"), { maxEntries: 4 });

      expect(failure.problems?.some((problem) => problem.message.includes("more than 4 entries"))).toBe(
        true,
      );
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects an archive whose extracted files exceed the total size cap", async () => {
    const base = await tempDir();
    try {
      const archive = path.join(base, "evil.tar");
      await makeRawTar(archive, [
        { path: ".factory/a.bin", type: "File", body: "a".repeat(800) },
        { path: ".factory/b.bin", type: "File", body: "b".repeat(800) },
      ]);

      const failure = await expectInvalid(archive, path.join(base, "out"), {
        maxTotalSize: 1024,
      });

      expect(failure.problems?.some((problem) => problem.message.includes("in total"))).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects a truncated archive whose declared total size exceeds the cap", async () => {
    const base = await tempDir();
    try {
      // The body of the huge entry is missing on purpose: the cap has to be read
      // from the header alone.
      const header = Buffer.alloc(512);
      new tar.Header({
        path: ".factory/huge.bin",
        type: "File",
        size: 64 * 1024 * 1024,
        mode: 0o644,
        mtime: new Date(0),
      }).encode(header);
      const archive = path.join(base, "evil.tar");
      await writeFile(archive, Buffer.concat([header, Buffer.alloc(2048, 0)]));

      const failure = await expectInvalid(archive, path.join(base, "out"), {
        maxTotalSize: 1024,
      });

      expect(failure.problems?.some((problem) => problem.message.includes("in total"))).toBe(true);
      expect(failure.message).not.toContain("Cannot extract");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects a truncated archive whose entry count exceeds the cap", async () => {
    const base = await tempDir();
    try {
      const header = Buffer.alloc(512);
      new tar.Header({
        path: ".factory/next.bin",
        type: "File",
        size: 512 * 1024 * 1024,
        mode: 0o644,
        mtime: new Date(0),
      }).encode(header);
      const archive = path.join(base, "evil.tar");
      await writeFile(archive, Buffer.concat([emptyEntry(".factory/first.md"), header]));

      const failure = await expectInvalid(archive, path.join(base, "out"), { maxEntries: 1 });

      expect(failure.problems?.some((problem) => problem.message.includes("more than 1 entries"))).toBe(
        true,
      );
      expect(failure.message).not.toContain("Cannot extract");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects a zero-filled gzip without decompressing the whole archive", async () => {
    const base = await tempDir();
    try {
      const header = Buffer.alloc(512);
      new tar.Header({
        path: ".factory/zeros.bin",
        type: "File",
        size: 16 * 1024 * 1024,
        mode: 0o644,
        mtime: new Date(0),
      }).encode(header);
      const archive = path.join(base, "bomb.tgz");
      await writeFile(
        archive,
        gzipSync(Buffer.concat([header, Buffer.alloc(16 * 1024 * 1024)])),
      );

      const failure = await expectInvalid(archive, path.join(base, "out"), {
        maxTotalSize: 1024 * 1024,
      });

      expect(failure.problems?.some((problem) => problem.message.includes("in total"))).toBe(true);
      expect(failure.message).not.toContain("Cannot extract");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects a file larger than 1 MB", async () => {
    const base = await tempDir();
    try {
      const staging = path.join(base, "staging");
      await mkdir(staging, { recursive: true });
      await writeFile(path.join(staging, "big.bin"), Buffer.alloc(2 * 1024 * 1024));
      const archive = path.join(base, "evil.tar.gz");
      await makeTar(archive, staging, ["big.bin"]);

      const failure = await expectInvalid(archive, path.join(base, "out"));

      expect(failure.problems?.[0]?.file).toBe("big.bin");
      expect(failure.problems?.[0]?.message).toContain("larger than");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("rejects a malformed archive", async () => {
    const base = await tempDir();
    try {
      const archive = path.join(base, "broken.tar.gz");
      await writeFile(archive, "not a tarball");

      const failure = await expectInvalid(archive, path.join(base, "out"));

      expect(failure.message).toContain("Cannot extract");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
