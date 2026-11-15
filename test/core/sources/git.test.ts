import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { chmod, cp, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import {
  cacheLayout,
  fabKey,
  fetchFab,
  parseSource,
  resolve,
} from "../../../src/core/sources/index.js";
import type { GitRef, GitSourceSpec } from "../../../src/core/sources/index.js";
import { pathExists } from "../../../src/util/fs.js";
import {
  createGitFixture,
  createUntaggedGitFixture,
  installReferenceTransactionHook,
  isolatedGitEnvironment,
  runGitIn,
} from "./git-fixture.js";
import type { GitFixture } from "./git-fixture.js";

const FIXTURES = fileURLToPath(new URL("../../fixtures/fabs/", import.meta.url));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rm: vi.fn(actual.rm), rename: vi.fn(actual.rename) };
});

let actualFs: typeof import("node:fs/promises");

let fixture: GitFixture;
let cache: string;

function gitSpec(
  url: string,
  options: { ref?: GitRef; source?: string } = {},
): GitSourceSpec {
  return {
    kind: "git",
    url,
    source: options.source ?? `file://${url}`,
    ...(options.ref === undefined ? {} : { ref: options.ref }),
  };
}

function options(): { cache: string } {
  return { cache };
}

async function resolveGit(spec: GitSourceSpec): Promise<Awaited<ReturnType<typeof resolve>>> {
  return resolve(spec, options());
}

beforeAll(async () => {
  actualFs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  fixture = await createGitFixture();
}, 60_000);

afterAll(async () => {
  await fixture?.cleanup();
}, 120_000);

beforeEach(async () => {
  vi.mocked(rm).mockImplementation(actualFs.rm as never);
  vi.mocked(rename).mockImplementation(actualFs.rename as never);
  cache = await mkdtemp(path.join(tmpdir(), "metafab-git-cache-"));
});

afterEach(async () => {
  await rm(cache, { recursive: true, force: true });
});

describe("git sources", { timeout: 60_000 }, () => {
  test("selects the newest version tag when no ref is given", async () => {
    const spec = gitSpec(fixture.repo);
    const resolved = await resolveGit(spec);

    expect(resolved).toMatchObject({
      kind: "git",
      commit: fixture.commits.v200,
      version: "2.0.0",
      requested: "^2.0.0",
      versioned: true,
    });

    const fetched = await fetchFab(resolved, options());

    expect(fetched.upstream).toEqual({
      kind: "git",
      source: `file://${fixture.repo}`,
      requested: "^2.0.0",
      version: "2.0.0",
      commit: fixture.commits.v200,
    });
    expect(fetched.versioned).toBe(true);
    expect(await pathExists(path.join(fetched.factoryDir, "AGENTS.md"))).toBe(true);
    expect(await pathExists(path.join(fetched.factoryDir, "factory.yaml"))).toBe(true);
    expect(await pathExists(path.join(fetched.factoryDir, "metafab.yaml"))).toBe(false);
    expect(await pathExists(path.join(fetched.factoryDir, "README.md"))).toBe(false);
    expect(fetched.factoryDir.startsWith(path.join(cache, "fabs"))).toBe(true);
    expect(await pathExists(cacheLayout(cache).gitMirror(fixture.repo))).toBe(true);
  });

  test("has no cleanup hook because the factory stays in the cache", async () => {
    const fetched = await fetchFab(await resolveGit(gitSpec(fixture.repo)), options());

    expect(fetched.cleanup).toBeUndefined();
  });

  test("resolves a semver range through the parsed github form", async () => {
    const parsed = parseSource("github:seasb/fab-mark4#semver:^1.0.0", {
      cwd: process.cwd(),
    });
    expect(parsed.kind).toBe("git");
    if (parsed.kind !== "git") throw new Error("expected a git source");

    const resolved = await resolveGit({ ...parsed, url: fixture.repo });

    expect(resolved).toMatchObject({
      kind: "git",
      commit: fixture.commits.v110,
      version: "1.1.0",
      requested: "^1.0.0",
    });
    if (resolved.kind === "git") expect(resolved.spec.source).toBe("github:seasb/fab-mark4");
  });

  test("resolves an explicit version tag", async () => {
    const resolved = await resolveGit(gitSpec(fixture.repo, { ref: { type: "name", name: "v1.0.0" } }));

    expect(resolved).toMatchObject({
      kind: "git",
      commit: fixture.commits.v100,
      version: "1.0.0",
      requested: "v1.0.0",
    });
  });

  test("resolves a branch to its head", async () => {
    const resolved = await resolveGit(gitSpec(fixture.repo, { ref: { type: "name", name: "feature" } }));

    expect(resolved).toMatchObject({
      kind: "git",
      commit: fixture.commits.feature,
      requested: "feature",
    });
    if (resolved.kind === "git") expect(resolved.version).toBeUndefined();
  });

  test("resolves an abbreviated commit", async () => {
    const short = fixture.commits.v100.slice(0, 7);
    const resolved = await resolveGit(gitSpec(fixture.repo, { ref: { type: "name", name: short } }));

    expect(resolved).toMatchObject({
      kind: "git",
      commit: fixture.commits.v100,
      version: "1.0.0",
      requested: short,
    });
  });

  test("resolves an --to override", async () => {
    const resolved = await resolve(gitSpec(fixture.repo), { ...options(), to: "v1.0.0" });

    expect(resolved).toMatchObject({
      kind: "git",
      commit: fixture.commits.v100,
      version: "1.0.0",
      requested: "v1.0.0",
    });
  });

  test("records no requested ref for a repository without version tags", async () => {
    const untagged = await createUntaggedGitFixture();
    try {
      const spec = gitSpec(untagged.repo);
      const resolved = await resolveGit(spec);

      expect(resolved).toMatchObject({ kind: "git", commit: untagged.head, versioned: true });
      if (resolved.kind === "git") {
        expect(resolved.requested).toBeUndefined();
        expect(resolved.version).toBeUndefined();
      }

      const fetched = await fetchFab(resolved, options());
      expect(fetched.upstream).toEqual({
        kind: "git",
        source: `file://${untagged.repo}`,
        commit: untagged.head,
      });
    } finally {
      await untagged.cleanup();
    }
  });

  test("fails with exit 3 when a ref does not exist", async () => {
    const source = `file://${fixture.repo}`;
    try {
      await resolveGit(gitSpec(fixture.repo, { ref: { type: "name", name: "does-not-exist" } }));
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      const failure = error as MetafabError;
      expect(failure.exitCode).toBe(ExitCode.FetchFailed);
      expect(failure.code).toBe("fetch-not-found");
      expect(failure.message).toContain("does-not-exist");
      expect(failure.problems).toEqual([
        {
          level: "error",
          file: source.replace(/\\/g, "/"),
          message: failure.message,
          fix: `Check that the tag, branch or commit exists in the repository (git ls-remote ${source}), or import the source without a ref`,
        },
      ]);
      return;
    }
    throw new Error("expected resolution to fail");
  });

  test("fails with exit 3 when no version tag matches a range", async () => {
    await expect(
      resolveGit(gitSpec(fixture.repo, { ref: { type: "range", range: "^9.0.0" } })),
    ).rejects.toMatchObject({ exitCode: ExitCode.FetchFailed, code: "fetch-not-found" });
  });

  test("fails with exit 3 when the repository cannot be reached", async () => {
    const missing = path.join(fixture.root, "no-such-repository.git");
    await expect(resolveGit(gitSpec(missing))).rejects.toMatchObject({
      exitCode: ExitCode.FetchFailed,
      code: "fetch-failed",
    });
  });

  test("fails with exit 4 when the commit has no .factory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "metafab-git-empty-"));
    const work = path.join(root, "work");
    const repo = path.join(root, "repo.git");
    try {
      await runGitIn(root, ["init", "-q", "-b", "main", work]);
      await runGitIn(work, ["config", "user.name", "Metafab Test"]);
      await runGitIn(work, ["config", "user.email", "metafab@example.com"]);
      await writeFile(path.join(work, "README.md"), "# no factory here\n");
      await runGitIn(work, ["add", "-A"]);
      await runGitIn(work, ["commit", "-qm", "no factory"]);
      await runGitIn(root, ["clone", "-q", "--bare", work, repo]);

      const resolved = await resolveGit(gitSpec(repo));
      await expect(fetchFab(resolved, options())).rejects.toMatchObject({
        exitCode: ExitCode.InvalidFab,
        code: "invalid-fab",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("reuses the cached mirror with a fetch instead of cloning again", async () => {
    const spec = gitSpec(fixture.repo);
    const first = await resolveGit(spec);
    expect(first).toMatchObject({ kind: "git", version: "2.0.0" });

    const mirror = cacheLayout(cache).gitMirror(fixture.repo);
    const marker = path.join(mirror, "mirror-marker");
    await writeFile(marker, "kept");

    await writeFile(path.join(fixture.work, ".factory", "AGENTS.md"), "# Agents at 3.0.0\n");
    await runGitIn(fixture.work, ["commit", "-qam", "third release"]);
    await runGitIn(fixture.work, ["tag", "v3.0.0"]);
    await runGitIn(fixture.work, ["push", "-q", fixture.repo, "main", "v3.0.0"]);

    const second = await resolveGit(spec);

    expect(second).toMatchObject({ kind: "git", version: "3.0.0" });
    expect(await pathExists(marker)).toBe(true);
  });

  test("re-clones when the cached mirror cannot be fetched", async () => {
    const spec = gitSpec(fixture.repo);
    const first = await resolveGit(spec);
    expect(first.kind).toBe("git");

    const mirror = cacheLayout(cache).gitMirror(fixture.repo);
    await rm(path.join(mirror, "config"));

    const second = await resolveGit(spec);

    expect(second).toMatchObject({ kind: "git" });
    if (first.kind === "git" && second.kind === "git") {
      expect(second.version).toBe(first.version);
    }
    expect(await pathExists(path.join(mirror, "config"))).toBe(true);
  });

  test("keeps a valid cached mirror when the fetch and its replacement clone both fail", async () => {
    const missing = path.join(fixture.root, "gone.git");
    const mirror = cacheLayout(cache).gitMirror(missing);
    const marker = path.join(mirror, "mirror-marker");
    await mkdir(mirror, { recursive: true });
    await runGitIn(mirror, ["init", "-q", "--bare"]);
    await runGitIn(mirror, ["remote", "add", "origin", missing]);
    await writeFile(marker, "kept");

    await expect(resolveGit(gitSpec(missing))).rejects.toMatchObject({
      exitCode: ExitCode.FetchFailed,
      code: "fetch-failed",
    });
    expect(await pathExists(marker)).toBe(true);
    expect(await pathExists(mirror)).toBe(true);
  });

  test("replaces a mirror only after a fresh clone from a failed fetch succeeds", async () => {
    const spec = gitSpec(fixture.repo);
    const first = await resolveGit(spec);
    expect(first.kind).toBe("git");

    const mirror = cacheLayout(cache).gitMirror(fixture.repo);
    const marker = path.join(mirror, "mirror-marker");
    await writeFile(marker, "old");
    // A malformed ref makes the fetch fail while the mirror is still a usable
    // bare repository, so the replacement clone has to succeed and swap in.
    await writeFile(path.join(mirror, "refs", "heads", "broken"), "not-a-sha\n");

    const second = await resolveGit(spec);

    expect(second).toMatchObject({ kind: "git" });
    expect(await pathExists(marker)).toBe(false);
    expect(await runGitIn(mirror, ["config", "--get", "remote.origin.url"])).toBe(fixture.repo);
  });

  test("still fails with exit 3 when a broken mirror cannot be re-cloned", async () => {
    const missing = path.join(fixture.root, "gone.git");
    const mirror = cacheLayout(cache).gitMirror(missing);
    await mkdir(mirror, { recursive: true });
    await runGitIn(mirror, ["init", "-q", "--bare"]);

    await expect(resolveGit(gitSpec(missing))).rejects.toMatchObject({
      exitCode: ExitCode.FetchFailed,
      code: "fetch-failed",
    });
  });

  test("drops credentials from the recorded source and the mirror config", async () => {
    await runGitIn(fixture.repo, ["update-server-info"]);
    const server = createServer(async (request, response) => {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      try {
        const body = await readFile(path.join(fixture.root, pathname));
        const text = pathname.endsWith("/info/refs") || pathname.endsWith("/HEAD");
        response.writeHead(200, { "content-type": text ? "text/plain" : "application/octet-stream" });
        response.end(body);
      } catch {
        response.writeHead(404);
        response.end("not found");
      }
    });
    await new Promise<void>((resolveListening) => server.listen(0, "127.0.0.1", resolveListening));
    const { port } = server.address() as AddressInfo;
    const clean = `http://127.0.0.1:${port}/repo.git`;
    const authed = `http://oauth2:glpat-secret@127.0.0.1:${port}/repo.git`;

    try {
      const spec: GitSourceSpec = {
        kind: "git",
        url: authed,
        source: "git+https://oauth2:glpat-secret@example.com/fab.git?token=signed",
      };
      const resolved = await resolveGit(spec);
      const fetched = await fetchFab(resolved, options());

      expect(fetched.upstream.source).toBe("git+https://example.com/fab.git");
      expect(JSON.stringify(fetched.upstream)).not.toContain("glpat-secret");

      const mirror = cacheLayout(cache).gitMirror(clean);
      expect(cacheLayout(cache).gitMirror(authed)).toBe(mirror);
      expect(await runGitIn(mirror, ["config", "--get", "remote.origin.url"])).toBe(clean);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
  });

  test("records a POSIX file source whose path holds an @ unchanged", async () => {
    // Regression guard for the whole recording path. The authority of a
    // three-slash or `localhost` file URL ends at the first `/`, before the
    // `@`, so `stripSourceCredentials` never saw this `@` as userinfo.
    const root = await mkdtemp(path.join(tmpdir(), "metafab-git-at-"));
    const repo = path.join(root, "bob@corp", "fab.git");
    await mkdir(path.dirname(repo), { recursive: true });
    try {
      await runGitIn(root, ["clone", "-q", "--bare", fixture.repo, repo]);
      const source = `git+file://${repo}`;
      const parsed = parseSource(source, { cwd: process.cwd() });
      if (parsed.kind !== "git") throw new Error("expected a git source");

      const fetched = await fetchFab(await resolveGit(parsed), options());

      expect(fetched.upstream.source).toBe(source);
      expect(fetched.upstream.source).toContain("@corp");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("records a Windows drive file source whose path holds an @ unchanged", async () => {
    // The two-slash drive form is the one where the authority is really the
    // start of a path and stripping cut everything from the drive colon to the
    // `@`. Its repository cannot exist here, so fetch from the fixture's POSIX
    // URL and record the drive form: only `spec.source` reaches the recorded
    // upstream and the fab key.
    const spec = gitSpec(fixture.repo);
    const resolved = await resolveGit(spec);
    const driveSource = "git+file://C:\\Users\\bob@corp\\fab.git";

    const fetched = await fetchFab(
      { ...resolved, spec: { ...resolved.spec, source: driveSource } },
      options(),
    );

    expect(fetched.upstream.source).toBe(driveSource);
    expect(fetched.upstream.source).toContain("@corp");
    expect(parseSource(fetched.upstream.source, { cwd: process.cwd() }).kind).toBe("git");
  });

  test("redacts credentials in Git errors", async () => {
    const token = "secret-token-value";
    const spec = gitSpec(`https://${token}@127.0.0.1:1/fab.git`, {
      source: `git+https://${token}@127.0.0.1:1/fab.git`,
    });

    try {
      await resolveGit(spec);
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      const failure = error as MetafabError;
      expect(failure.message).not.toContain(token);
      expect(failure.message).toContain("***@");
      return;
    }
    throw new Error("expected resolution to fail");
  });

  test("rejects a file larger than 1 MB in a Git fab", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "metafab-git-big-"));
    const work = path.join(root, "work");
    const repo = path.join(root, "repo.git");
    try {
      await runGitIn(root, ["init", "-q", "-b", "main", work]);
      await runGitIn(work, ["config", "user.name", "Metafab Test"]);
      await runGitIn(work, ["config", "user.email", "metafab@example.com"]);
      await mkdir(path.join(work, ".factory"), { recursive: true });
      await writeFile(path.join(work, ".factory", "factory.yaml"), "format: 1\n");
      await writeFile(path.join(work, ".factory", "large.bin"), Buffer.alloc(2 * 1024 * 1024));
      await runGitIn(work, ["add", "-A"]);
      await runGitIn(work, ["commit", "-qm", "large factory"]);
      await runGitIn(root, ["clone", "-q", "--bare", work, repo]);

      const resolved = await resolveGit(gitSpec(repo));
      await expect(fetchFab(resolved, options())).rejects.toMatchObject({
        exitCode: ExitCode.InvalidFab,
        code: "invalid-fab",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("accepts a format 2 fab", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "metafab-git-format-2-"));
    const work = path.join(root, "work");
    const repo = path.join(root, "repo.git");
    try {
      await runGitIn(root, ["init", "-q", "-b", "main", work]);
      await runGitIn(work, ["config", "user.name", "Metafab Test"]);
      await runGitIn(work, ["config", "user.email", "metafab@example.com"]);
      await mkdir(path.join(work, ".factory"), { recursive: true });
      await writeFile(
        path.join(work, ".factory", "factory.yaml"),
        "format: 2\nname: sample\nenv:\n  harness:\n    values: [amp, claude]\n",
      );
      await runGitIn(work, ["add", "-A"]);
      await runGitIn(work, ["commit", "-qm", "format 2 factory"]);
      await runGitIn(root, ["clone", "-q", "--bare", work, repo]);

      const resolved = await resolveGit(gitSpec(repo));
      const fetched = await fetchFab(resolved, options());

      expect(await pathExists(path.join(fetched.factoryDir, "factory.yaml"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("refuses an unknown factory format with the upgrade fix", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "metafab-git-format-3-"));
    const work = path.join(root, "work");
    const repo = path.join(root, "repo.git");
    try {
      await runGitIn(root, ["init", "-q", "-b", "main", work]);
      await runGitIn(work, ["config", "user.name", "Metafab Test"]);
      await runGitIn(work, ["config", "user.email", "metafab@example.com"]);
      await mkdir(path.join(work, ".factory"), { recursive: true });
      await writeFile(path.join(work, ".factory", "factory.yaml"), "format: 3\nname: sample\n");
      await runGitIn(work, ["add", "-A"]);
      await runGitIn(work, ["commit", "-qm", "format 3 factory"]);
      await runGitIn(root, ["clone", "-q", "--bare", work, repo]);

      const resolved = await resolveGit(gitSpec(repo));
      await expect(fetchFab(resolved, options())).rejects.toMatchObject({
        exitCode: ExitCode.InvalidFab,
        code: "invalid-fab",
        problems: [
          {
            message: "Unknown factory format 3",
            fix: "Use format 1 or 2, or upgrade @seasb/metafab",
          },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fetches fab content byte for byte whatever core.autocrlf says", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "metafab-git-eol-"));
    const work = path.join(root, "work");
    const repo = path.join(root, "repo.git");
    const plain = Buffer.from("plain\n", "utf8");
    const latin = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]);
    try {
      await runGitIn(root, ["init", "-q", "-b", "main", work]);
      // The fixture stores exactly the bytes this test expects, so the line
      // endings the host's Git is set up to write cannot reach the commit.
      await runGitIn(work, ["config", "core.autocrlf", "false"]);
      await runGitIn(work, ["config", "user.name", "Metafab Test"]);
      await runGitIn(work, ["config", "user.email", "metafab@example.com"]);
      await cp(path.join(FIXTURES, "valid-fab", ".factory"), path.join(work, ".factory"), {
        recursive: true,
      });
      await writeFile(path.join(work, ".factory", "plain.md"), plain);
      await writeFile(path.join(work, ".factory", "latin.txt"), latin);
      await runGitIn(work, ["add", "-A"]);
      await runGitIn(work, ["commit", "-qm", "line endings"]);
      await runGitIn(work, ["tag", "v1.0.0"]);
      await runGitIn(root, ["clone", "-q", "--bare", work, repo]);

      // The Windows default setup, on every platform: a fetch that goes through
      // a checkout or `git archive` would turn each LF into CRLF.
      const gitconfig = path.join(root, "gitconfig");
      await writeFile(gitconfig, "[core]\n\tautocrlf = true\n");
      const env = { ...process.env, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: "1" };

      const resolved = await resolve(gitSpec(repo), { cache, env });
      const fetched = await fetchFab(resolved, { cache, env });

      expect(await readFile(path.join(fetched.factoryDir, "plain.md"))).toEqual(plain);
      expect(await readFile(path.join(fetched.factoryDir, "latin.txt"))).toEqual(latin);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fetches fab content byte for byte whatever the fab's .gitattributes say", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "metafab-git-attributes-"));
    const work = path.join(root, "work");
    const repo = path.join(root, "repo.git");
    const lf = Buffer.from("plain\n", "utf8");
    const crlf = Buffer.from("one\r\ntwo\r\n", "utf8");
    try {
      // The commit happens under an empty Git configuration, so the host's
      // global settings cannot change the stored blob bytes.
      const env = await isolatedGitEnvironment(root);
      await runGitIn(root, ["init", "-q", "-b", "main", work], env);
      await runGitIn(work, ["config", "core.autocrlf", "false"], env);
      await runGitIn(work, ["config", "user.name", "Metafab Test"], env);
      await runGitIn(work, ["config", "user.email", "metafab@example.com"], env);
      await cp(path.join(FIXTURES, "valid-fab", ".factory"), path.join(work, ".factory"), {
        recursive: true,
      });
      await writeFile(path.join(work, ".factory", "plain.md"), lf);
      await writeFile(path.join(work, ".factory", "crlf.txt"), crlf);
      await runGitIn(work, ["add", "-A"], env);
      await runGitIn(work, ["commit", "-qm", "line endings"], env);
      // The rules arrive after the blobs are committed, so the blobs keep the
      // exact bytes a fab can contain; `git archive` still applies the rules
      // when it exports the tree.
      await writeFile(
        path.join(work, ".factory", ".gitattributes"),
        "*.md text eol=crlf\n*.txt text=auto eol=lf\n",
      );
      await runGitIn(work, ["add", "-A"], env);
      await runGitIn(work, ["commit", "-qm", "line ending rules"], env);
      await runGitIn(work, ["tag", "v1.0.0"], env);
      await runGitIn(root, ["clone", "-q", "--bare", work, repo], env);

      const resolved = await resolveGit(gitSpec(repo));
      const fetched = await fetchFab(resolved, options());

      expect(await readFile(path.join(fetched.factoryDir, "plain.md"))).toEqual(lf);
      expect(await readFile(path.join(fetched.factoryDir, "crlf.txt"))).toEqual(crlf);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fetches fab files that export-subst or export-ignore would rewrite or drop", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "metafab-git-export-"));
    const work = path.join(root, "work");
    const repo = path.join(root, "repo.git");
    const stamp = Buffer.from("commit $Format:%H$\n", "utf8");
    const kept = Buffer.from("keep me\n", "utf8");
    try {
      const env = await isolatedGitEnvironment(root);
      await runGitIn(root, ["init", "-q", "-b", "main", work], env);
      await runGitIn(work, ["config", "core.autocrlf", "false"], env);
      await runGitIn(work, ["config", "user.name", "Metafab Test"], env);
      await runGitIn(work, ["config", "user.email", "metafab@example.com"], env);
      await cp(path.join(FIXTURES, "valid-fab", ".factory"), path.join(work, ".factory"), {
        recursive: true,
      });
      await writeFile(path.join(work, ".factory", "stamp.txt"), stamp);
      await writeFile(path.join(work, ".factory", "skip.txt"), kept);
      await writeFile(
        path.join(work, ".factory", ".gitattributes"),
        "stamp.txt export-subst\nskip.txt export-ignore\n",
      );
      await runGitIn(work, ["add", "-A"], env);
      await runGitIn(work, ["commit", "-qm", "export attributes"], env);
      await runGitIn(work, ["tag", "v1.0.0"], env);
      await runGitIn(root, ["clone", "-q", "--bare", work, repo], env);

      const resolved = await resolveGit(gitSpec(repo));
      const fetched = await fetchFab(resolved, options());

      expect(await readFile(path.join(fetched.factoryDir, "stamp.txt"))).toEqual(stamp);
      expect(await readFile(path.join(fetched.factoryDir, "skip.txt"))).toEqual(kept);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("leaves the mirror attribute rules untouched when they are already in place", async () => {
    const first = await resolve(gitSpec(fixture.repo), { ...options(), to: "v1.0.0" });
    await fetchFab(first, options());

    const attributes = path.join(
      cacheLayout(cache).gitMirror(fixture.repo),
      "info",
      "attributes",
    );
    expect(await readFile(attributes, "utf8")).toContain("-export-ignore");
    const before = await stat(attributes);

    // A second fetch through the same mirror must not rewrite the file. On
    // Windows a read-only or open attribute file would otherwise fail the
    // whole fetch with EPERM.
    const second = await resolve(gitSpec(fixture.repo), { ...options(), to: "v2.0.0" });
    await fetchFab(second, options());

    const after = await stat(attributes);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  test("fails with exit 3 when the mirror cannot hold the verbatim attribute rules", async () => {
    const resolved = await resolveGit(gitSpec(fixture.repo));
    const mirror = cacheLayout(cache).gitMirror(fixture.repo);
    await rm(path.join(mirror, "info"), { recursive: true, force: true });
    await writeFile(path.join(mirror, "info"), "not a directory\n");

    await expect(fetchFab(resolved, options())).rejects.toMatchObject({
      exitCode: ExitCode.FetchFailed,
      code: "fetch-failed",
    });
  });

  test("does not reuse a fab cached before the fetch format changed", async () => {
    const resolved = await resolveGit(gitSpec(fixture.repo));
    if (resolved.kind !== "git") throw new Error("expected a git source");
    const legacy = cacheLayout(cache).fabDir(fabKey(`file://${fixture.repo}`, resolved.commit));
    await mkdir(legacy, { recursive: true });
    await writeFile(path.join(legacy, "from-an-older-fetch"), "stale");

    const fetched = await fetchFab(resolved, options());

    expect(fetched.factoryDir).not.toBe(legacy);
    expect(await pathExists(path.join(legacy, "from-an-older-fetch"))).toBe(true);
  });

  // Windows has no POSIX mode bits, so both fetches report the same fixed mode.
  test.skipIf(process.platform === "win32")(
    "fetches the same file modes whatever tar.umask says",
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), "metafab-git-umask-"));
      const work = path.join(root, "work");
      const repo = path.join(root, "repo.git");
      const script = Buffer.from("#!/bin/sh\necho hi\n", "utf8");
      const plain = Buffer.from("plain\n", "utf8");
      const defaultCache = await mkdtemp(path.join(tmpdir(), "metafab-git-umask-default-"));
      const restrictiveCache = await mkdtemp(path.join(tmpdir(), "metafab-git-umask-restrictive-"));
      try {
        const env = await isolatedGitEnvironment(root);
        await runGitIn(root, ["init", "-q", "-b", "main", work], env);
        await runGitIn(work, ["config", "core.autocrlf", "false"], env);
        await runGitIn(work, ["config", "user.name", "Metafab Test"], env);
        await runGitIn(work, ["config", "user.email", "metafab@example.com"], env);
        await cp(path.join(FIXTURES, "valid-fab", ".factory"), path.join(work, ".factory"), {
          recursive: true,
        });
        await writeFile(path.join(work, ".factory", "run.sh"), script);
        await chmod(path.join(work, ".factory", "run.sh"), 0o755);
        await writeFile(path.join(work, ".factory", "plain.md"), plain);
        await runGitIn(work, ["add", "-A"], env);
        await runGitIn(work, ["commit", "-qm", "file modes"], env);
        await runGitIn(work, ["tag", "v1.0.0"], env);
        await runGitIn(root, ["clone", "-q", "--bare", work, repo], env);

        const defaults = await fetchFab(await resolveGit(gitSpec(repo)), { cache: defaultCache });

        // The host's umask, applied to `git archive` through `tar.umask=0077`.
        // Without the pinned setting every entry is recorded as 0600, so this
        // fetch would land a fab whose modes depend on the machine.
        const gitconfig = path.join(root, "restrictive-gitconfig");
        await writeFile(gitconfig, "[tar]\n\tumask = 0077\n");
        const restrictiveEnv = {
          ...process.env,
          GIT_CONFIG_GLOBAL: gitconfig,
          GIT_CONFIG_NOSYSTEM: "1",
        };
        const resolved = await resolve(gitSpec(repo), { cache: restrictiveCache, env: restrictiveEnv });
        const restrictive = await fetchFab(resolved, { cache: restrictiveCache, env: restrictiveEnv });

        for (const relativePath of ["run.sh", "plain.md", "factory.yaml", "AGENTS.md"]) {
          expect(
            (await stat(path.join(restrictive.factoryDir, relativePath))).mode & 0o777,
          ).toBe((await stat(path.join(defaults.factoryDir, relativePath))).mode & 0o777);
        }
        // The executable bit survives in both, as a fab's scripts need it.
        expect((await stat(path.join(restrictive.factoryDir, "run.sh"))).mode & 0o111).not.toBe(0);
      } finally {
        await rm(defaultCache, { recursive: true, force: true });
        await rm(restrictiveCache, { recursive: true, force: true });
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  test("does not reuse a fab cached under the attribute-only fetch format", async () => {
    const resolved = await resolveGit(gitSpec(fixture.repo));
    if (resolved.kind !== "git") throw new Error("expected a git source");
    // The format segment the fetch used before the export settings entered the
    // key: only the attribute rules were hashed.
    const attributeOnlyFormat = `git-verbatim-${createHash("sha256")
      .update(
        "* -text -eol -filter -ident -working-tree-encoding -export-subst -export-ignore\n",
      )
      .digest("hex")
      .slice(0, 12)}`;
    const previous = cacheLayout(cache).fabDir(
      fabKey(attributeOnlyFormat, `file://${fixture.repo}`, resolved.commit),
    );
    await mkdir(previous, { recursive: true });
    await writeFile(path.join(previous, "from-an-older-fetch"), "stale");

    const fetched = await fetchFab(resolved, options());

    expect(fetched.factoryDir).not.toBe(previous);
    expect(await pathExists(path.join(previous, "from-an-older-fetch"))).toBe(true);
  });

  test("sweeps a stale temporary clone and keeps a fresh one until it is old", async () => {
    const mirror = cacheLayout(cache).gitMirror(fixture.repo);
    await mkdir(path.dirname(mirror), { recursive: true });
    const stale = `${mirror}.tmp-old`;
    const fresh = `${mirror}.tmp-new`;
    await mkdir(stale, { recursive: true });
    await writeFile(path.join(stale, "junk"), "partial clone");
    await mkdir(fresh, { recursive: true });
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await utimes(stale, old, old);

    const resolved = await resolveGit(gitSpec(fixture.repo));

    expect(resolved.kind).toBe("git");
    expect(await pathExists(stale)).toBe(false);
    expect(await pathExists(fresh)).toBe(true);

    await utimes(fresh, old, old);
    await resolveGit(gitSpec(fixture.repo));
    expect(await pathExists(fresh)).toBe(false);
  });

  test("returns the new mirror when the old backup cannot be removed", async () => {
    const spec = gitSpec(fixture.repo);
    await resolveGit(spec);
    const mirror = cacheLayout(cache).gitMirror(fixture.repo);
    const marker = path.join(mirror, "mirror-marker");
    await writeFile(marker, "old");
    // A malformed ref makes the fetch fail so a replacement clone swaps in.
    await writeFile(path.join(mirror, "refs", "heads", "broken"), "not-a-sha\n");

    vi.mocked(rm).mockImplementation(((target: string, options?: unknown) => {
      if (String(target).includes(".old-")) {
        return Promise.reject(
          Object.assign(new Error("EBUSY: resource busy, rm"), { code: "EBUSY" }),
        );
      }
      return (actualFs.rm as (target: string, options?: unknown) => Promise<void>)(
        target,
        options,
      );
    }) as never);

    try {
      const resolved = await resolveGit(spec);

      expect(resolved.kind).toBe("git");
      expect(await pathExists(marker)).toBe(false);
      expect(await pathExists(path.join(mirror, "config"))).toBe(true);
    } finally {
      vi.mocked(rm).mockImplementation(actualFs.rm as never);
    }
  });

  test("two cold resolves in parallel both succeed on one mirror", async () => {
    const spec = gitSpec(fixture.repo);

    const [first, second] = await Promise.all([resolveGit(spec), resolveGit(spec)]);

    expect(first.kind).toBe("git");
    expect(second.kind).toBe("git");
    if (first.kind === "git" && second.kind === "git") {
      expect(first.commit).toBe(second.commit);
    }
    const mirror = cacheLayout(cache).gitMirror(fixture.repo);
    expect(await pathExists(path.join(mirror, "config"))).toBe(true);
    const siblings = (await readdir(path.dirname(mirror))).filter(
      (entry) => entry !== path.basename(mirror),
    );
    expect(siblings).toEqual([]);
  });

  test("two replacements of one mirror that overlap both succeed", async () => {
    const spec = gitSpec(fixture.repo);
    await resolveGit(spec);
    const mirror = cacheLayout(cache).gitMirror(fixture.repo);
    // A malformed ref makes the fetch fail while the mirror is still a usable
    // bare repository, so both commands build a replacement clone.
    await writeFile(path.join(mirror, "refs", "heads", "broken"), "not-a-sha\n");

    // Both commands reach the rename that moves the old mirror aside; the
    // first waits there, which keeps the mirror corrupt while the second
    // fetches, so the second also takes the replacement path. One of the two
    // renames then loses, with ENOENT, exactly as two real commands would.
    let swaps = 0;
    let release!: () => void;
    const bothSwapping = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(rename).mockImplementation(((from: string, to: string) => {
      if (String(from) === mirror && String(to).includes(".old-")) {
        swaps += 1;
        if (swaps === 2) release();
        return bothSwapping.then(() => actualFs.rename(from, to));
      }
      return actualFs.rename(from, to);
    }) as never);

    const [first, second] = await Promise.all([resolveGit(spec), resolveGit(spec)]);

    expect(first.kind).toBe("git");
    expect(second.kind).toBe("git");
    expect(swaps).toBe(2);
    expect(await pathExists(path.join(mirror, "config"))).toBe(true);
    const siblings = (await readdir(path.dirname(mirror))).filter(
      (entry) => entry !== path.basename(mirror),
    );
    expect(siblings).toEqual([]);
  });

  test("does not run git hooks from the environment", async () => {
    const { env, marker } = await installReferenceTransactionHook(fixture);
    const spec = gitSpec(fixture.repo);

    const resolved = await resolve(spec, { cache, env });
    await fetchFab(resolved, { cache, env });

    expect(await pathExists(marker)).toBe(false);
  });
});
