import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as tar from "tar";
import { afterEach, describe, expect, test } from "vitest";
import { MetafabError } from "../../../src/errors.js";
import { runImport } from "../../../src/core/import/index.js";
import { makeRepo, writeRepoFiles } from "../../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";

const roots: string[] = [];
const repos: TempRepo[] = [];

afterEach(async () => {
  await Promise.all([
    ...roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    ...repos.splice(0).map((repo) => repo.cleanup()),
  ]);
});

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function skill(name: string, body: string): string {
  return `---\nname: ${name}\ndescription: Use ${name} when the task needs it.\n---\n\n# ${name}\n\n${body}\n`;
}

const FAB: RepoFiles = {
  ".factory/factory.yaml": "format: 1\nname: demo-fab\n",
  ".factory/skills/guide/SKILL.md": skill("guide", "Fab body."),
  ".factory/README.md": "# Not imported\n",
};

function httpsTarball(data: Buffer): typeof fetch {
  return async () => new Response(data, { status: 200 });
}

async function tarballOf(files: RepoFiles): Promise<Buffer> {
  const root = await tempRoot("metafab-import-https-fab-");
  await writeRepoFiles(root, files);
  const file = path.join(root, "fab.tgz");
  await tar.c({ gzip: true, file, cwd: root, portable: true }, [".factory"]);
  return readFile(file);
}

/** Point TMPDIR at a fresh directory so a forgotten mkdtemp stays for the assertion. */
async function withScratchTemp<T>(run: (scratch: string) => Promise<T>): Promise<T> {
  const scratch = await tempRoot("metafab-import-https-scratch-");
  const previous = { tmpdir: process.env.TMPDIR, temp: process.env.TEMP };
  process.env.TMPDIR = scratch;
  process.env.TEMP = scratch;
  try {
    return await run(scratch);
  } finally {
    if (previous.tmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous.tmpdir;
    if (previous.temp === undefined) delete process.env.TEMP;
    else process.env.TEMP = previous.temp;
  }
}

describe("import from an HTTPS tarball", () => {
  test("copies the fab and removes the temporary fetch directory", async () => {
    const data = await tarballOf(FAB);
    const repo = await makeRepo({}, { git: true });
    repos.push(repo);

    const report = await withScratchTemp(async (scratch) => {
      const result = await runImport({
        root: repo.root,
        source: "https://fab.example/demo-fab-1.0.0.tgz",
        agents: "claude",
        io: { tty: false },
        sourceOptions: { fetch: httpsTarball(data) },
      });
      expect(await readdir(scratch)).toEqual([]);
      return result;
    });

    expect(report.upstream).toEqual({
      kind: "unversioned",
      source: "https://fab.example/demo-fab-1.0.0.tgz",
    });
    expect(await readFile(repo.path(".factory", "factory.yaml"), "utf8")).toBe(
      "format: 1\nname: demo-fab\n",
    );
    expect(await readFile(repo.path(".factory", "metafab.yaml"), "utf8")).toContain(
      "https://fab.example/demo-fab-1.0.0.tgz",
    );
    expect(await readFile(repo.path(".factory", "skills", "guide", "SKILL.md"), "utf8")).toBe(
      skill("guide", "Fab body."),
    );
  });

  test("a conflict removes the temporary fetch directory", async () => {
    const data = await tarballOf(FAB);
    const repo = await makeRepo(
      { ".factory/skills/guide/SKILL.md": skill("guide", "Local body.") },
      { git: true },
    );
    repos.push(repo);

    const failure = await withScratchTemp(async (scratch) => {
      const thrown = await runImport({
        root: repo.root,
        source: "https://fab.example/demo-fab-1.0.0.tgz",
        agents: "claude",
        io: { tty: false },
        sourceOptions: { fetch: httpsTarball(data) },
      }).catch((error: unknown) => error);
      expect(await readdir(scratch)).toEqual([]);
      return thrown;
    });

    expect(failure).toBeInstanceOf(MetafabError);
    expect((failure as MetafabError).exitCode).toBe(5);
  });
});
