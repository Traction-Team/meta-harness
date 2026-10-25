import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as tar from "tar";
import { describe, expect, test } from "vitest";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import { extractTarball } from "../../../src/core/sources/index.js";
import { pathExists } from "../../../src/util/fs.js";

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "metafab-sources-"));
}

async function makeTar(archive: string, cwd: string, entries: string[], preservePaths = false): Promise<void> {
  await tar.c({ file: archive, gzip: true, cwd, preservePaths }, entries);
}

async function expectInvalid(archive: string, destination: string): Promise<MetafabError> {
  try {
    await extractTarball(archive, destination);
  } catch (error) {
    expect(error).toBeInstanceOf(MetafabError);
    const failure = error as MetafabError;
    expect(failure.exitCode).toBe(ExitCode.InvalidFab);
    expect(failure.code).toBe("invalid-fab");
    return failure;
  }
  throw new Error("expected extraction to fail");
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

  test("rejects a symbolic link", async () => {
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
