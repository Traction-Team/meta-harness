import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import {
  cacheLayout,
  fetchFab,
  getOrCreate,
  parseSource,
  resolve,
} from "../../../src/core/sources/index.js";
import type { GitSourceSpec, Resolved } from "../../../src/core/sources/index.js";
import { toPosixPath } from "../../../src/util/fs.js";
import { startRegistry } from "../../helpers/registry/index.js";
import type { Registry } from "../../helpers/registry/index.js";
import { createGitFixture } from "./git-fixture.js";
import type { GitFixture } from "./git-fixture.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    mkdir: vi.fn(actual.mkdir),
    rename: vi.fn(actual.rename),
    copyFile: vi.fn(actual.copyFile),
  };
});

const FIXTURES = fileURLToPath(new URL("../../fixtures/fabs/", import.meta.url));
const VALID_FACTORY = path.join(FIXTURES, "valid-fab", ".factory");
const WRITE_CODES = ["EACCES", "ENOSPC"] as const;

let actualFs: typeof import("node:fs/promises");
let fixture: GitFixture;
let registry: Registry;
let cache: string;

interface InjectedFailure {
  match: (...paths: string[]) => boolean;
  code: string;
}

let mkdirFailure: InjectedFailure | undefined;
let renameFailure: InjectedFailure | undefined;
let copyFileFailure: InjectedFailure | undefined;

function fsError(code: string, syscall: string, target: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: ${syscall} '${target}'`), {
    code,
    syscall,
    path: target,
  });
}

beforeAll(async () => {
  actualFs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  fixture = await createGitFixture();
  registry = await startRegistry();
  await registry.publishFab({ name: "fab-fs", version: "1.0.0", factoryDir: VALID_FACTORY });
}, 180_000);

afterAll(async () => {
  await registry?.stop();
  await fixture?.cleanup();
}, 180_000);

beforeEach(async () => {
  mkdirFailure = undefined;
  renameFailure = undefined;
  copyFileFailure = undefined;

  vi.mocked(mkdir).mockImplementation(((target: string, options?: unknown) => {
    if (mkdirFailure?.match(String(target)) === true) {
      return Promise.reject(fsError(mkdirFailure.code, "mkdir", String(target)));
    }
    return (actualFs.mkdir as (target: string, options?: unknown) => Promise<unknown>)(
      target,
      options,
    );
  }) as never);

  vi.mocked(rename).mockImplementation(((from: string, to: string) => {
    if (renameFailure?.match(String(from), String(to)) === true) {
      return Promise.reject(fsError(renameFailure.code, "rename", String(from)));
    }
    return (actualFs.rename as (from: string, to: string) => Promise<void>)(from, to);
  }) as never);

  vi.mocked(copyFile).mockImplementation(((from: string, to: string) => {
    if (copyFileFailure?.match(String(from), String(to)) === true) {
      return Promise.reject(fsError(copyFileFailure.code, "copyfile", String(to)));
    }
    return (actualFs.copyFile as (from: string, to: string) => Promise<void>)(from, to);
  }) as never);

  cache = await mkdtemp(path.join(tmpdir(), "metafab-fs-errors-"));
});

afterAll(async () => {
  vi.mocked(mkdir).mockReset();
  vi.mocked(rename).mockReset();
  vi.mocked(copyFile).mockReset();
});

function gitSpec(): GitSourceSpec {
  return { kind: "git", url: fixture.repo, source: `file://${fixture.repo}` };
}

function gitResolve(): Promise<Resolved> {
  return resolve(gitSpec(), { cache });
}

function npmOptions(): { cache: string; env: NodeJS.ProcessEnv; registry: string } {
  return { cache, env: registry.env, registry: registry.url };
}

/**
 * One `fetch-failed` problem, naming the POSIX form of the path, and nothing
 * that reads like a stack trace. `checkFile` receives the problem's file.
 */
async function expectCacheWriteFailure(
  code: string,
  run: () => Promise<unknown>,
  checkFile: (file: string) => void,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(MetafabError);
    const failure = error as MetafabError;
    expect(failure.exitCode).toBe(ExitCode.FetchFailed);
    expect(failure.code).toBe("fetch-failed");
    const problems = failure.problems ?? [];
    expect(problems).toHaveLength(1);
    const problem = problems[0];
    if (problem === undefined) throw new Error("expected one problem");
    expect(problem.level).toBe("error");
    expect(problem.message).toContain("Cannot write the Metafab cache");
    expect(problem.message).toContain(code);
    expect(problem.fix).toContain("METAFAB_CACHE");
    expect(problem.file).not.toContain("\\");
    checkFile(problem.file);
    return;
  }
  throw new Error("expected the fetch to fail");
}

function fabsTemporaryPath(target: string): boolean {
  const parent = path.join(cache, "fabs") + path.sep;
  return target.startsWith(parent) && path.basename(target).includes(".tmp-");
}

describe("cache write failures", () => {
  for (const code of WRITE_CODES) {
    test(`mkdir of the mirror directory is exit 3 (${code})`, async () => {
      const mirror = cacheLayout(cache).gitMirror(fixture.repo);
      mkdirFailure = { match: (target) => target === path.dirname(mirror), code };

      await expectCacheWriteFailure(
        code,
        () => gitResolve(),
        (file) => expect(file).toBe(toPosixPath(path.dirname(mirror))),
      );
    });

    test(`mkdir of the fabric staging directory during a Git fetch is exit 3 (${code})`, async () => {
      const resolved = await gitResolve();
      mkdirFailure = { match: fabsTemporaryPath, code };

      await expectCacheWriteFailure(
        code,
        () => fetchFab(resolved, { cache }),
        (file) => {
          expect(file.startsWith(toPosixPath(path.join(cache, "fabs")))).toBe(true);
          expect(file).toMatch(/\.tmp-[^/]+$/);
        },
      );
    });

    test(`a getOrCreate rename is exit 3 (${code})`, async () => {
      const target = path.join(cache, "fabs", "entry");
      renameFailure = { match: (from) => from.includes(".tmp-"), code };
      const value = (dir: string) => readFile(path.join(dir, "value"), "utf8");

      await expectCacheWriteFailure(
        code,
        () =>
          getOrCreate(target, {
            root: cache,
            validate: value,
            create: async (staging) => {
              await mkdir(staging, { recursive: true });
              await writeFile(path.join(staging, "value"), "good");
            },
          }),
        (file) => expect(file).toBe(toPosixPath(target)),
      );
    });

    test(`the getOrCreate rename that discards a corrupt entry is exit 3 (${code})`, async () => {
      const target = path.join(cache, "fabs", "corrupt");
      await mkdir(target, { recursive: true });
      renameFailure = { match: (from, to) => from === target && to.includes(".old-"), code };

      await expectCacheWriteFailure(
        code,
        () =>
          getOrCreate(target, {
            root: cache,
            validate: async (): Promise<string> => {
              throw new Error("corrupt entry");
            },
            create: async () => undefined,
          }),
        (file) => expect(file).toBe(toPosixPath(target)),
      );
    });

    test(`the first replaceMirror rename is exit 3 (${code})`, async () => {
      await gitResolve();
      const mirror = cacheLayout(cache).gitMirror(fixture.repo);
      // A malformed ref makes the fetch fail while the mirror is still usable,
      // so a replacement clone is built and swapped in.
      await writeFile(path.join(mirror, "refs", "heads", "broken"), "not-a-sha\n");
      renameFailure = {
        match: (from, to) => from === mirror && to.includes(".old-"),
        code,
      };

      await expectCacheWriteFailure(
        code,
        () => gitResolve(),
        (file) => expect(file).toBe(toPosixPath(mirror)),
      );
    });

    test(`the second replaceMirror rename is exit 3 (${code})`, async () => {
      await gitResolve();
      const mirror = cacheLayout(cache).gitMirror(fixture.repo);
      await writeFile(path.join(mirror, "refs", "heads", "broken"), "not-a-sha\n");
      renameFailure = {
        match: (from, to) => from.includes(".tmp-") && to === mirror,
        code,
      };

      await expectCacheWriteFailure(
        code,
        () => gitResolve(),
        (file) => expect(file).toBe(toPosixPath(mirror)),
      );
    });

    test(`mkdir of the fabric staging directory during an npm fetch is exit 3 (${code})`, async () => {
      const resolved = await resolve(parseSource("fab-fs@1.0.0"), npmOptions());
      mkdirFailure = { match: fabsTemporaryPath, code };

      await expectCacheWriteFailure(
        code,
        () => fetchFab(resolved, npmOptions()),
        (file) => {
          expect(file.startsWith(toPosixPath(path.join(cache, "fabs")))).toBe(true);
          expect(file).toMatch(/\.tmp-[^/]+$/);
        },
      );
    });

    test(`mkdir of the npm tarball directory is exit 3 (${code})`, async () => {
      const resolved = await resolve(parseSource("fab-fs@1.0.0"), npmOptions());
      const tarballDirectory = path.dirname(cacheLayout(cache).npmTarball("fab-fs", "1.0.0"));
      mkdirFailure = { match: (target) => target === tarballDirectory, code };

      await expectCacheWriteFailure(
        code,
        () => fetchFab(resolved, npmOptions()),
        (file) => expect(file).toBe(toPosixPath(tarballDirectory)),
      );
    });

    test(`the npm tarball copy into the cache is exit 3 (${code})`, async () => {
      const resolved = await resolve(parseSource("fab-fs@1.0.0"), npmOptions());
      copyFileFailure = { match: (_from, to) => to.includes(".tmp-"), code };
      const tarball = cacheLayout(cache).npmTarball("fab-fs", "1.0.0");

      await expectCacheWriteFailure(
        code,
        () => fetchFab(resolved, npmOptions()),
        // The copy writes the staging file, which `getOrCreate` removes, so the
        // problem names the cache path the tarball belongs at.
        (file) => expect(file).toBe(toPosixPath(tarball)),
      );
    });
  }
});
