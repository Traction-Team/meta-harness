import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import {
  cacheLayout,
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
  runGitIn,
} from "./git-fixture.js";
import type { GitFixture } from "./git-fixture.js";

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
  fixture = await createGitFixture();
}, 60_000);

afterAll(async () => {
  await fixture?.cleanup();
});

beforeEach(async () => {
  cache = await mkdtemp(path.join(tmpdir(), "metafab-git-cache-"));
});

afterEach(async () => {
  await rm(cache, { recursive: true, force: true });
});

describe("git sources", () => {
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
    try {
      await resolveGit(gitSpec(fixture.repo, { ref: { type: "name", name: "does-not-exist" } }));
    } catch (error) {
      expect(error).toBeInstanceOf(MetafabError);
      const failure = error as MetafabError;
      expect(failure.exitCode).toBe(ExitCode.FetchFailed);
      expect(failure.code).toBe("fetch-failed");
      expect(failure.message).toContain("does-not-exist");
      return;
    }
    throw new Error("expected resolution to fail");
  });

  test("fails with exit 3 when no version tag matches a range", async () => {
    await expect(
      resolveGit(gitSpec(fixture.repo, { ref: { type: "range", range: "^9.0.0" } })),
    ).rejects.toMatchObject({ exitCode: ExitCode.FetchFailed, code: "fetch-failed" });
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

  test("does not run git hooks from the environment", async () => {
    const { env, marker } = await installReferenceTransactionHook(fixture);
    const spec = gitSpec(fixture.repo);

    const resolved = await resolve(spec, { cache, env });
    await fetchFab(resolved, { cache, env });

    expect(await pathExists(marker)).toBe(false);
  });
});
