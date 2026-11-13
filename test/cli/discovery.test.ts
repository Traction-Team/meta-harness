import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { findFactory, repositoryScope, resolveNewFactoryRoot } from "../../src/core/discovery.js";
import type { GitRunner } from "../../src/core/discovery.js";
import { MetafabError } from "../../src/errors.js";
import { listFiles } from "../../src/util/fs.js";
import { runGit } from "../../src/util/git.js";
import { makeRepo, writeRepoFiles } from "../helpers/makeRepo.js";
import type { RepoFiles, TempRepo } from "../helpers/makeRepo.js";
import { runCli } from "../helpers/runCli.js";

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/** A temporary directory that is not a Git repository. */
async function container(prefix = "metafab-discovery-"): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function repoWith(files: RepoFiles = {}, git = true): Promise<TempRepo> {
  const repo = await makeRepo(files, { git });
  cleanups.push(() => repo.cleanup());
  return repo;
}

function factoryYaml(name = "demo"): string {
  return `format: 1\nname: ${name}\n`;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await runGit(["-c", "commit.gpgsign=false", ...args], { cwd });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

async function initRepo(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  await git(root, "init", "--quiet");
  await git(root, "config", "user.name", "Metafab Test");
  await git(root, "config", "user.email", "metafab@example.com");
  await git(root, "config", "commit.gpgsign", "false");
}

async function commitAll(root: string, message = "initial"): Promise<void> {
  await git(root, "add", "-A");
  await git(root, "commit", "--quiet", "--allow-empty", "-m", message);
}

async function snapshotTree(root: string): Promise<Record<string, string>> {
  const files = await listFiles(root, {
    ignore: (relativePath) => relativePath === ".git" || relativePath.startsWith(".git/"),
  });
  const entries: Record<string, string> = {};
  for (const file of files) {
    entries[file] = await readFile(path.join(root, ...file.split("/")), "utf8");
  }
  return entries;
}

function parseJson(result: { stdout: string }): Record<string, unknown> {
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function skill(name: string): string {
  return `---\nname: ${name}\ndescription: Use ${name} when the task needs it.\n---\n\n# ${name}\n`;
}

function fabFiles(): RepoFiles {
  return {
    ".factory/factory.yaml": factoryYaml("trial-fab"),
    ".factory/AGENTS.md": "# Trial fab\n",
    ".factory/skills/guide/SKILL.md": skill("guide"),
  };
}

const droidFiles: RepoFiles = {
  ".factory/settings.json": "{}",
  ".factory/skills/guide/SKILL.md": skill("guide"),
};

describe("repositoryScope", () => {
  test("stops at the Git top level", async () => {
    const repo = await repoWith({ "packages/app/file.txt": "" }, true);

    const scope = await repositoryScope(repo.path("packages/app"));

    expect(scope.via).toBe("git");
    expect(scope.topLevel).toBe(repo.root);
    expect(scope.searched).toEqual([repo.path("packages/app"), repo.path("packages"), repo.root]);
  });

  test("looks only in the current directory outside Git", async () => {
    const plain = await container();
    await mkdir(path.join(plain, "nested"), { recursive: true });

    const scope = await repositoryScope(path.join(plain, "nested"));

    expect(scope).toEqual({ searched: [path.join(plain, "nested")], via: "none" });
  });

  test("honours GIT_DIR: Git calls the current directory the top level", async () => {
    const repo = await repoWith({ ".factory/factory.yaml": factoryYaml(), "packages/app/file.txt": "" }, true);
    const gitDirRunner: GitRunner = (args, options) =>
      runGit(args, { ...options, env: { ...process.env, GIT_DIR: repo.path(".git") } });
    const current = repo.path("packages/app");

    const scope = await repositoryScope(current, gitDirRunner);

    expect(scope.via).toBe("git");
    expect(scope.topLevel).toBe(current);
    expect(scope.searched).toEqual([current]);
  });

  test("honours GIT_WORK_TREE: a work tree that does not contain the current directory is the repository", async () => {
    const repo = await repoWith(
      {
        ".factory/factory.yaml": factoryYaml("outer"),
        "sub/.factory/factory.yaml": factoryYaml("work-tree"),
        "sub/file.txt": "",
      },
      true,
    );
    const workTree = repo.path("sub");
    const workTreeRunner: GitRunner = (args, options) =>
      runGit(args, {
        ...options,
        env: { ...process.env, GIT_DIR: repo.path(".git"), GIT_WORK_TREE: workTree },
      });

    const scope = await repositoryScope(repo.root, workTreeRunner);
    const location = await findFactory(repo.root, { git: workTreeRunner });
    // Git prints the real path (on macOS `/var` is `/private/var`), and it is
    // the only spelling of a work tree that is not on the current path.
    const gitTop = await realpath(workTree);

    expect(scope).toEqual({ searched: [gitTop], topLevel: gitTop, via: "git" });
    expect(location.root).toBe(gitTop);
    expect(location.factoryDir).toBe(path.join(gitTop, ".factory"));
  });
});

describe("findFactory", () => {
  test("never looks above the repository top level", async () => {
    const outer = await container();
    await writeRepoFiles(outer, { ".factory/factory.yaml": factoryYaml("outer") });
    const repo = path.join(outer, "repo");
    await initRepo(repo);
    await writeRepoFiles(repo, { "packages/app/file.txt": "" });

    const error = await findFactory(path.join(repo, "packages/app")).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MetafabError);
    const failure = error as MetafabError;
    expect(failure.exitCode).toBe(1);
    expect(failure.code).toBe("factory-not-found");
    expect(failure.message).toBe(
      `No .factory directory found in ${path.join(repo, "packages/app")} or its parents up to the repository root ${repo}.`,
    );
    expect(failure.problems?.[0]?.message).toBe(
      `No factory found between ${path.join(repo, "packages/app")} and the repository root.`,
    );
    expect(failure.details).toEqual({
      cwd: path.join(repo, "packages/app"),
      repositoryRoot: repo,
    });
  });

  test("finds the nearest factory in a nested monorepo layout", async () => {
    const repo = await repoWith({ ".factory/factory.yaml": factoryYaml(), "packages/a/b/index.ts": "" }, true);

    const location = await findFactory(repo.path("packages/a/b"));

    expect(location.root).toBe(repo.root);
    expect(location.factoryDir).toBe(repo.path(".factory"));
  });

  test("prefers the nearest factory", async () => {
    const repo = await repoWith(
      {
        ".factory/factory.yaml": factoryYaml("outer"),
        "inner/.factory/factory.yaml": factoryYaml("inner"),
        "inner/deep/file.txt": "",
      },
      true,
    );

    const location = await findFactory(repo.path("inner/deep"));

    expect(location.root).toBe(repo.path("inner"));
    expect(location.factoryDir).toBe(repo.path("inner/.factory"));
  });

  test("fails with exit code 1 and an init fix when no factory exists inside Git", async () => {
    const repo = await repoWith({ "README.md": "" }, true);

    const error = await findFactory(repo.root).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MetafabError);
    const failure = error as MetafabError;
    expect(failure.exitCode).toBe(1);
    expect(failure.code).toBe("factory-not-found");
    expect(failure.problems?.[0]?.fix).toBe("Run metafab init");
  });

  test("outside Git, a factory in the parent is not found and the message says why", async () => {
    const outer = await container();
    await writeRepoFiles(outer, { ".factory/factory.yaml": factoryYaml("outer") });
    const nested = path.join(outer, "nested");
    await mkdir(nested, { recursive: true });

    const error = await findFactory(nested).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MetafabError);
    const failure = error as MetafabError;
    expect(failure.exitCode).toBe(1);
    expect(failure.code).toBe("factory-not-found");
    expect(failure.message).toBe(
      `No .factory directory found in ${nested}. Outside a Git repository, Metafab looks only in the current directory.`,
    );
    expect(failure.problems?.[0]?.fix).toBe(
      "Run metafab init, or run metafab in the directory that contains .factory/",
    );
    expect(failure.details).toEqual({ cwd: nested, repositoryRoot: null });
  });

  test("outside Git, a factory in the current directory is found", async () => {
    const outer = await container();
    await writeRepoFiles(outer, { ".factory/factory.yaml": factoryYaml("current") });

    const location = await findFactory(outer);

    expect(location.root).toBe(outer);
    expect(location.factoryDir).toBe(path.join(outer, ".factory"));
  });

  test("a repository nested in another repository stops at the inner top level", async () => {
    const outer = await repoWith({ ".factory/factory.yaml": factoryYaml("outer") }, true);
    const inner = outer.path("vendor/inner");
    await initRepo(inner);
    await writeRepoFiles(inner, { "deep/file.txt": "" });

    const error = await findFactory(path.join(inner, "deep")).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MetafabError);
    expect((error as MetafabError).code).toBe("factory-not-found");
    expect((error as MetafabError).details).toEqual({
      cwd: path.join(inner, "deep"),
      repositoryRoot: inner,
    });
    expect(await resolveNewFactoryRoot(path.join(inner, "deep"))).toBe(inner);
  });

  test("a submodule stops at its own top level", async () => {
    const base = await container();
    const source = path.join(base, "source");
    await initRepo(source);
    await writeRepoFiles(source, { "README.md": "submodule\n" });
    await commitAll(source);
    const bare = path.join(base, "source.git");
    await git(base, "clone", "--bare", "--quiet", source, bare);

    const outer = path.join(base, "outer");
    await initRepo(outer);
    await writeRepoFiles(outer, { ".factory/factory.yaml": factoryYaml("outer"), "README.md": "outer\n" });
    await commitAll(outer);
    await git(outer, "-c", "protocol.file.allow=always", "submodule", "add", "--quiet", bare, "sub");

    const error = await findFactory(path.join(outer, "sub")).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MetafabError);
    expect((error as MetafabError).code).toBe("factory-not-found");
    expect((error as MetafabError).details).toEqual({
      cwd: path.join(outer, "sub"),
      repositoryRoot: path.join(outer, "sub"),
    });
  });

  test("a linked worktree stops at the worktree's top level and finds its own factory", async () => {
    const base = await container();
    const main = path.join(base, "main");
    await initRepo(main);
    await writeRepoFiles(main, { ".factory/factory.yaml": factoryYaml("main"), "README.md": "main\n" });
    await commitAll(main);
    const worktree = path.join(base, "wt");
    await git(main, "worktree", "add", "--quiet", worktree, "-b", "wt");
    await writeRepoFiles(worktree, { ".factory/factory.yaml": factoryYaml("wt") });

    const location = await findFactory(worktree);

    expect(location.root).toBe(worktree);
    expect(location.factoryDir).toBe(path.join(worktree, ".factory"));
    expect(await readFile(path.join(location.factoryDir, "factory.yaml"), "utf8")).toContain("name: wt");
  });

  test("from inside .git/ it refuses a Git directory with no work tree", async () => {
    const repo = await repoWith({ "README.md": "" }, true);

    const error = await findFactory(repo.path(".git")).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MetafabError);
    const failure = error as MetafabError;
    expect(failure.exitCode).toBe(1);
    expect(failure.code).toBe("no-work-tree");
    expect(failure.message).toContain("is inside a Git directory that has no work tree.");
    expect(failure.problems?.[0]?.file).toBe(".");
    expect(failure.problems?.[0]?.fix).toBe("Run metafab from a checkout of the repository");
  });

  test("a bare repository is refused with no-work-tree", async () => {
    const base = await container();
    const bare = path.join(base, "bare.git");
    await git(base, "init", "--quiet", "--bare", bare);

    const error = await findFactory(bare).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MetafabError);
    expect((error as MetafabError).code).toBe("no-work-tree");
  });

  test.skipIf(process.platform === "win32")(
    "a current directory reached through a symbolic link resolves like the real path",
    async () => {
      const repo = await repoWith({ ".factory/factory.yaml": factoryYaml("real"), "packages/app/file.txt": "" }, true);
      const base = await container();
      const link = path.join(base, "link");
      await symlink(repo.path("packages/app"), link);

      const location = await findFactory(link);

      expect(await realpath(location.root)).toBe(await realpath(repo.root));
      expect(await realpath(location.factoryDir)).toBe(await realpath(repo.path(".factory")));
    },
  );
});

describe("findFactory when Git cannot answer", () => {
  const missingGit: GitRunner = async () => {
    throw new Error("spawn git ENOENT");
  };

  test("the .git fallback finds the factory at the directory tree's top level", async () => {
    const outer = await container();
    await mkdir(path.join(outer, "repo", ".git"), { recursive: true });
    await writeRepoFiles(outer, { "repo/.factory/factory.yaml": factoryYaml("fallback") });
    await mkdir(path.join(outer, "repo", "nested"), { recursive: true });

    const location = await findFactory(path.join(outer, "repo", "nested"), { git: missingGit });

    expect(location.root).toBe(path.join(outer, "repo"));
    expect(location.factoryDir).toBe(path.join(outer, "repo", ".factory"));
  });

  test("a .git file, as a linked worktree has, is a top level too", async () => {
    const outer = await container();
    await writeRepoFiles(outer, {
      "wt/.git": "gitdir: /elsewhere\n",
      "wt/.factory/factory.yaml": factoryYaml("worktree"),
    });
    const worktree = path.join(outer, "wt");

    const scope = await repositoryScope(worktree, missingGit);
    const location = await findFactory(worktree, { git: missingGit });

    expect(scope.via).toBe("dot-git");
    expect(location.root).toBe(worktree);
  });

  test("with no .git anywhere, only the current directory is searched", async () => {
    const outer = await container();
    await writeRepoFiles(outer, { ".factory/factory.yaml": factoryYaml("parent") });
    const nested = path.join(outer, "nested");
    await mkdir(nested, { recursive: true });

    const error = await findFactory(nested, { git: missingGit }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MetafabError);
    expect((error as MetafabError).message).toContain("Outside a Git repository");
    expect((error as MetafabError).details).toEqual({ cwd: nested, repositoryRoot: null });
  });

  test("Git refusing with dubious ownership uses the .git fallback", async () => {
    const repo = await repoWith({ ".factory/factory.yaml": factoryYaml(), "nested/file.txt": "" }, true);
    const refused: GitRunner = async () => ({
      exitCode: 128,
      stdout: "",
      stderr: "fatal: detected dubious ownership in repository at '/repo'\n",
    });

    const location = await findFactory(repo.path("nested"), { git: refused });

    expect(location.root).toBe(repo.root);
    const scope = await repositoryScope(repo.path("nested"), refused);
    expect(scope.via).toBe("dot-git");
  });
});

describe("resolveNewFactoryRoot", () => {
  test("uses the nearest factory when one exists", async () => {
    const repo = await repoWith({ ".factory/factory.yaml": factoryYaml(), "nested/file.txt": "" }, true);

    expect(await resolveNewFactoryRoot(repo.path("nested"))).toBe(repo.root);
  });

  test("uses the repository top level, spelled like the input path, when there is no factory", async () => {
    const repo = await repoWith({ "nested/file.txt": "" }, true);

    expect(await resolveNewFactoryRoot(repo.path("nested"))).toBe(repo.root);
  });

  test("returns the current directory when Git cannot be spawned and no .git exists", async () => {
    const outer = await container();
    const nested = path.join(outer, "nested");
    await mkdir(nested, { recursive: true });
    const missingGit: GitRunner = async () => {
      throw new Error("spawn git ENOENT");
    };

    expect(await resolveNewFactoryRoot(nested, { git: missingGit })).toBe(nested);
  });
});

describe("Droid's .factory/", () => {
  test("build, check, init and import refuse it and change nothing", async () => {
    const repo = await repoWith({ ...droidFiles, "README.md": "" }, true);
    const before = await snapshotTree(repo.root);
    const missingFab = repo.path("missing-fab");

    const runs = [
      await runCli(["build"], { cwd: repo.root }),
      await runCli(["check"], { cwd: repo.root }),
      await runCli(["init", "--agents", "claude", "--no-git-hooks"], { cwd: repo.root }),
      await runCli(["import", missingFab, "--agents", "claude"], { cwd: repo.root }),
    ];

    for (const result of runs) {
      expect(result.code).toBe(5);
      expect(result.stderr).toContain("belongs to Factory.ai Droid");
    }
    expect(await snapshotTree(repo.root)).toEqual(before);
  });

  test("a droids/ directory alone marks the folder as Droid's", async () => {
    const repo = await repoWith(
      { ".factory/droids/reviewer.md": "Review.\n", "README.md": "" },
      true,
    );

    const result = await runCli(["build"], { cwd: repo.root });

    expect(result.code).toBe(5);
    expect(result.stderr).toContain("droids");
    expect(result.stderr).toContain("no factory.yaml");
  });

  test("a .factory/ with factory.yaml and settings.json is Metafab's", async () => {
    const repo = await repoWith(
      { ".factory/factory.yaml": factoryYaml(), ".factory/settings.json": "{}", "README.md": "" },
      true,
    );

    const location = await findFactory(repo.root, { command: "build" });
    const result = await runCli(["build"], { cwd: repo.root });

    expect(location.root).toBe(repo.root);
    expect(result.code).toBe(0);
  });

  test("--json carries the code, the problem, and a fix that names the command", async () => {
    const repo = await repoWith({ ...droidFiles, "README.md": "" }, true);

    const build = parseJson(await runCli(["build", "--json"], { cwd: repo.root }));
    expect(build.code).toBe("droid-factory");
    expect(build.exitCode).toBe(5);
    const problems = build.problems as { file: string; message: string; fix: string }[];
    expect(problems[0]?.file).toBe(".factory");
    expect(problems[0]?.message).toContain("has settings.json and no factory.yaml");
    expect(problems[0]?.fix).toContain("run metafab build again");
    expect(problems[0]?.fix).not.toContain("metafab init");

    const init = parseJson(
      await runCli(["init", "--json", "--agents", "claude", "--no-git-hooks"], { cwd: repo.root }),
    );
    const initProblems = init.problems as { fix: string }[];
    expect(initProblems[0]?.fix).toContain("run metafab init again");
    expect(initProblems[0]?.fix).not.toContain("Run metafab init");
  });

  test("adding factory.yaml by hand ends the refusal", async () => {
    const base = await container();
    const root = path.join(base, "My App");
    await initRepo(root);
    await writeRepoFiles(root, {
      ".factory/settings.json": "{}",
      ".factory/droids/reviewer.md": "Review.\n",
    });

    const refused = await runCli(["build"], { cwd: root });
    expect(refused.code).toBe(5);
    expect(refused.stderr).toContain("name: my-app");

    await writeFile(path.join(root, ".factory", "factory.yaml"), "format: 1\nname: my-app\n");

    const check = await runCli(["check", "--json"], { cwd: root });
    const checkJson = parseJson(check);
    const problems = (checkJson.problems ?? []) as { message: string }[];
    expect(problems.filter((problem) => /factory\.yaml/i.test(problem.message))).toEqual([]);

    const build = await runCli(["build"], { cwd: root });
    expect(build.code).toBe(0);

    const init = await runCli(["init", "--agents", "claude", "--no-git-hooks"], { cwd: root });
    expect(init.code).toBe(0);

    expect(await readFile(path.join(root, ".factory", "settings.json"), "utf8")).toBe("{}");
    expect(await readFile(path.join(root, ".factory", "droids", "reviewer.md"), "utf8")).toBe("Review.\n");
  });
});

describe("the fab-trial case", () => {
  test("import in a repository below a Droid home folder creates the factory in the repository", async () => {
    const base = await container();
    const home = path.join(base, "home");
    await writeRepoFiles(home, {
      ".factory/settings.json": "{}",
      ".factory/skills/guide/SKILL.md": skill("guide"),
      ".claude/skills/home-skill/SKILL.md": skill("home-skill"),
    });
    const repo = path.join(home, "Dev", "fab-trial");
    await initRepo(repo);
    await writeRepoFiles(repo, { "README.md": "" });
    const fab = path.join(base, "fab");
    await writeRepoFiles(fab, fabFiles());
    const droidBefore = await snapshotTree(path.join(home, ".factory"));
    const homeSkillsBefore = await snapshotTree(path.join(home, ".claude"));

    const result = await runCli(["import", fab, "--agents", "claude"], { cwd: repo });

    expect(result.code).toBe(0);
    expect(await readFile(path.join(repo, ".factory", "factory.yaml"), "utf8")).toContain("name: trial-fab");
    expect(await readFile(path.join(repo, ".claude", "skills", "guide", "SKILL.md"), "utf8")).toContain("name: guide");
    // Nothing in the fake home changed: no Droid folder was adopted, and no
    // home-directory skill was listed.
    expect(await snapshotTree(path.join(home, ".factory"))).toEqual(droidBefore);
    expect(await snapshotTree(path.join(home, ".claude"))).toEqual(homeSkillsBefore);
  });
});
