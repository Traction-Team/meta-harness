import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { buildCli } from "../../cli/build.js";
import type { BuiltCli } from "../../cli/build.js";
import { HOOK_NAMES, hookScript, syncGitHooks } from "../../../src/core/hooks/index.js";
import { isolateGitConfig, makeTestRepo } from "./helpers.js";
import type { MakeTestRepoOptions, TestRepo } from "./helpers.js";

const execFileAsync = promisify(execFile);

const OLD_HOOKS = fileURLToPath(new URL("./fixtures/hooks-1.0.0", import.meta.url));

let built: BuiltCli;
let isolation: Awaited<ReturnType<typeof isolateGitConfig>> | undefined;
const repos: TestRepo[] = [];
/** The stub on `PATH` a test installed, restored after it however it ends. */
let activePathStub: PathEntry | undefined;

beforeEach(async () => {
  isolation = await isolateGitConfig();
});

afterEach(async () => {
  if (activePathStub !== undefined) {
    restorePath(activePathStub);
    activePathStub = undefined;
  }
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
  isolation?.restore();
  isolation = undefined;
});

async function repo(options: MakeTestRepoOptions = {}): Promise<TestRepo> {
  const created = await makeTestRepo(options);
  repos.push(created);
  return created;
}

async function logLines(log: string): Promise<string[]> {
  try {
    const text = await readFile(log, "utf8");
    return text.split("\n").filter((line) => line !== "");
  } catch {
    return [];
  }
}

interface PathEntry {
  bin: string;
  originalPath: string | undefined;
}

interface Stub extends PathEntry {
  log: string;
}

/** Writes an executable stub at `file`, with `__LOG__` replaced by the log path. */
async function writeStub(file: string, log: string, script: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, script.replace("__LOG__", log), "utf8");
  await chmod(file, 0o755);
}

async function installStub(git: TestRepo, script: string): Promise<Stub> {
  const bin = path.join(git.container, "bin");
  const log = path.join(git.container, "build.log");
  await writeStub(path.join(bin, "metafab"), log, script);
  return { bin, log, originalPath: process.env.PATH };
}

/** A `metafab` that logs `<label>:<cwd>`, and exits 1 when asked to fail. */
function loggingScript(label: string, exitCode = 0): string {
  const lines = ["#!/bin/sh", `printf '%s\\n' "${label}:$PWD" >> '__LOG__'`];
  if (exitCode !== 0) lines.push(`exit ${exitCode}`);
  return `${lines.join("\n")}\n`;
}

/** A stub in a factory's own `node_modules/.bin`, such as the main checkout's. */
async function installFactoryStub(
  git: TestRepo,
  factoryRelDir: string,
  script: string,
): Promise<void> {
  await writeStub(
    git.path(factoryRelDir, "node_modules", ".bin", "metafab"),
    path.join(git.container, "build.log"),
    script,
  );
}

/** The stub log's `<label>:<cwd>` lines, with each directory realpathed. */
async function stubRuns(log: string): Promise<string[]> {
  return Promise.all(
    (await logLines(log)).map(async (line) => {
      const colon = line.indexOf(":");
      return `${line.slice(0, colon)}:${await realpath(line.slice(colon + 1))}`;
    }),
  );
}

interface HooksRepoOptions extends MakeTestRepoOptions {
  /** The factory directory inside the repository, such as `packages/app`. */
  factory?: string;
}

/**
 * A repository with `git-hooks: true`, one commit and the three hooks, and a
 * `metafab` on `PATH` that logs `path:<cwd>`. Every stub a test installs shares
 * that log, so the order the hook tried them in is visible.
 */
async function hooksRepo(
  options: HooksRepoOptions = {},
): Promise<{ git: TestRepo; stub: Stub }> {
  const git = await repo(options);
  const factory = options.factory ?? "";
  await git.write(
    path.posix.join(factory, ".factory/metafab.yaml"),
    "agents: all\ngit-hooks: true\n",
  );
  await git.writeAndCommit("README.md", "one\n", "factory");
  await syncGitHooks(git.path(factory), true, "2.0.0");

  const stub = await installStub(git, loggingScript("path"));
  usePath(stub);
  activePathStub = stub;
  return { git, stub };
}

function usePath(stub: PathEntry): void {
  process.env.PATH = `${stub.bin}${path.delimiter}${stub.originalPath ?? ""}`;
}

function restorePath(stub: PathEntry): void {
  if (stub.originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = stub.originalPath;
}

/** A `metafab` on `PATH` that runs the CLI built from this checkout. */
async function installCli(git: TestRepo): Promise<PathEntry> {
  const bin = path.join(git.container, "cli-bin");
  await mkdir(bin, { recursive: true });
  const entry = path.join(bin, "metafab");
  await writeFile(entry, `#!/bin/sh\nexec "${process.execPath}" "${built.cliPath}" "$@"\n`, "utf8");
  await chmod(entry, 0o755);
  return { bin, originalPath: process.env.PATH };
}

const LOGGING_STUB = `#!/bin/sh
printf '%s\\n' "$PWD" >> '__LOG__'
`;

const FAILING_STUB = `#!/bin/sh
echo "stub build failed" >&2
exit 1
`;

async function clear(log: string): Promise<void> {
  await writeFile(log, "", "utf8");
}

// Windows coverage is the `hooks` job in .github/workflows/ci.yml; lift this
// skip once a Windows run of this file passes.
describe.skipIf(process.platform === "win32")("Git hooks end to end", () => {
  // A private compile of this checkout for this file, so no other test file's
  // build and no stale `dist/` decides whether the spawned CLI runs.
  beforeAll(async () => {
    built = await buildCli();
  }, 180_000);

  afterAll(async () => {
    await built?.cleanup();
  });

  test(
    "post-checkout finds a factory below the repository root",
    { timeout: 60_000 },
    async () => {
      const git = await repo();
      const skill = "---\nname: demo\ndescription: Demo. Use when testing.\n---\n\n# Demo\n";
      await git.write(
        "packages/app/.factory/factory.yaml",
        "format: 1\nname: demo\n",
      );
      await git.write(
        "packages/app/.factory/metafab.yaml",
        "agents: [claude]\nmetafab-skill: false\ngit-hooks: true\n",
      );
      await git.write("packages/app/.factory/skills/demo/SKILL.md", skill);
      await git.writeAndCommit("README.md", "one\n", "initial");

      const cli = await installCli(git);
      usePath(cli);

      try {
        const run = await execFileAsync(process.execPath, [built.cliPath, "build"], {
          cwd: git.path("packages", "app"),
          encoding: "utf8",
        });
        expect(run.stdout).toContain("+ git hook post-checkout");
        for (const hook of HOOK_NAMES) {
          expect(await readFile(git.path(".git/hooks", hook), "utf8")).toContain(
            'cd "$(git rev-parse --show-toplevel)/packages/app"',
          );
        }

        const installed = git.path("packages", "app", ".claude", "skills", "demo", "SKILL.md");
        const installedText = await readFile(installed, "utf8");
        expect(installedText).toContain("# Demo");
        // Keep the generated comment: it marks the file as Metafab-owned, so
        // the build repairs the body instead of refusing a foreign file.
        await writeFile(installed, installedText.replace("# Demo", "# Demo edited"));

        // `git switch -c` runs post-checkout, which `cd`s to packages/app and
        // runs `metafab build` there.
        const switched = await git.gitRaw("switch", "-c", "other");

        expect(switched.exitCode).toBe(0);
        expect(`${switched.stdout}${switched.stderr}`).not.toContain("not a Git repository");
        expect(`${switched.stdout}${switched.stderr}`).not.toContain("metafab: build failed");
        expect(await readFile(installed, "utf8")).toBe(installedText);
        for (const hook of HOOK_NAMES) {
          expect(await readFile(git.path(".git/hooks", hook), "utf8")).toContain(
            "/packages/app",
          );
        }
      } finally {
        restorePath(cli);
      }
    },
  );

  test("worktree add, merge and rebase run metafab build; amend and file checkout do not", async () => {
    const git = await repo();
    await git.writeAndCommit(
      ".factory/metafab.yaml",
      "agents: all\ngit-hooks: true\n",
      "factory",
    );
    await git.writeAndCommit("file.txt", "one\n", "file");
    const installed = await syncGitHooks(git.root, true, "1.0.0");
    expect(installed.changed).toHaveLength(3);

    const stub = await installStub(git, LOGGING_STUB);
    usePath(stub);

    try {
      const branch = (await git.git("rev-parse", "--abbrev-ref", "HEAD")).stdout.trim();

      await git.git("worktree", "add", git.path("..", "wt"), "-b", "wt");
      expect(await logLines(stub.log)).toEqual([await realpath(git.path("..", "wt"))]);

      await clear(stub.log);
      await git.git("checkout", "--quiet", "-b", "topic");
      await git.writeAndCommit("topic.txt", "topic\n", "topic");
      await git.git("checkout", "--quiet", branch);
      await clear(stub.log);
      await git.git("merge", "--no-ff", "--quiet", "-m", "merge topic", "topic");
      expect(await logLines(stub.log)).toEqual([await realpath(git.root)]);

      await git.git("checkout", "--quiet", "-b", "rebase-topic");
      await git.writeAndCommit("rebase.txt", "rebase\n", "rebase topic");
      await git.git("checkout", "--quiet", branch);
      await git.writeAndCommit("main.txt", "main\n", "main");
      await git.git("checkout", "--quiet", "rebase-topic");
      await clear(stub.log);
      await git.git("rebase", "--quiet", branch);
      expect(await logLines(stub.log)).toHaveLength(2);
      expect(await logLines(stub.log)).toEqual([
        await realpath(git.root),
        await realpath(git.root),
      ]);

      await clear(stub.log);
      await git.git("commit", "--amend", "--no-edit", "--quiet");
      expect(await logLines(stub.log)).toEqual([]);

      await clear(stub.log);
      await git.git("checkout", "--", "file.txt");
      expect(await logLines(stub.log)).toEqual([]);
    } finally {
      restorePath(stub);
    }
  });

  test("post-checkout exits for a file checkout and post-rewrite for an amend", async () => {
    const git = await repo();
    await git.writeAndCommit(".factory/metafab.yaml", "agents: all\n", "factory");
    await syncGitHooks(git.root, true, "1.0.0");
    const stub = await installStub(git, LOGGING_STUB);
    usePath(stub);

    try {
      await execFileAsync(
        "sh",
        [git.path(".git/hooks/post-checkout"), "old", "new", "0"],
        { cwd: git.root },
      );
      expect(await logLines(stub.log)).toEqual([]);

      await execFileAsync(
        "sh",
        [git.path(".git/hooks/post-rewrite"), "amend"],
        { cwd: git.root },
      );
      expect(await logLines(stub.log)).toEqual([]);

      await execFileAsync(
        "sh",
        [git.path(".git/hooks/post-rewrite"), "rebase"],
        { cwd: git.root },
      );
      expect(await logLines(stub.log)).toHaveLength(1);
    } finally {
      restorePath(stub);
    }
  });

  test("a failing build still lets the Git command succeed and prints one line", async () => {
    const git = await repo();
    await git.writeAndCommit(".factory/metafab.yaml", "agents: all\n", "factory");
    await git.writeAndCommit("file.txt", "one\n", "file");
    await syncGitHooks(git.root, true, "1.0.0");
    const stub = await installStub(git, FAILING_STUB);
    usePath(stub);

    try {
      const result = await git.gitRaw(
        "worktree",
        "add",
        git.path("..", "wt"),
        "-b",
        "wt",
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("metafab: build failed. Run metafab build.");
      expect(await logLines(stub.log)).toEqual([]);
      for (const hook of HOOK_NAMES) {
        expect(await readFile(git.path(".git/hooks", hook), "utf8")).toContain(
          'echo "metafab: build failed. Run metafab build." >&2',
        );
      }
    } finally {
      restorePath(stub);
    }
  });

  describe("a new worktree finds the main worktree's metafab", () => {
    test.each([
      { paths: "plain names", containerPrefix: undefined, worktree: "wt" },
      {
        paths: "a space and é in the container and worktree names",
        containerPrefix: "metafab hooks é-",
        worktree: "wt é",
      },
    ])(
      "worktree add runs the main checkout's stub, and a switch in the main checkout uses step 1 ($paths)",
      { timeout: 60_000 },
      async ({ containerPrefix, worktree }) => {
        const { git, stub } = await hooksRepo({ containerPrefix });
        await installFactoryStub(git, "", loggingScript("main"));

        const created = git.path("..", worktree);
        await git.git("worktree", "add", created, "-b", "wt");
        expect(await stubRuns(stub.log)).toEqual([`main:${await realpath(created)}`]);

        await clear(stub.log);
        await git.git("switch", "--quiet", "-c", "other");
        expect(await stubRuns(stub.log)).toEqual([`main:${await realpath(git.root)}`]);
      },
    );

    test("without a main-worktree metafab, worktree add falls through to PATH", async () => {
      const { git, stub } = await hooksRepo();

      const created = git.path("..", "wt");
      await git.git("worktree", "add", created, "-b", "wt");

      expect(await stubRuns(stub.log)).toEqual([`path:${await realpath(created)}`]);
    });

    test("a worktree's own dependency wins over the main worktree's", async () => {
      const { git, stub } = await hooksRepo();
      await installFactoryStub(git, "", loggingScript("main"));

      const created = git.path("..", "wt");
      await git.git("worktree", "add", created, "-b", "wt");
      expect(await stubRuns(stub.log)).toEqual([`main:${await realpath(created)}`]);

      await clear(stub.log);
      await writeStub(
        path.join(created, "node_modules", ".bin", "metafab"),
        stub.log,
        loggingScript("own"),
      );
      await git.gitAt(created, "switch", "--quiet", "-c", "other");

      expect(await stubRuns(stub.log)).toEqual([`own:${await realpath(created)}`]);
    });

    test("a factory in a subdirectory looks in that same subdirectory of the main worktree", async () => {
      const { git, stub } = await hooksRepo({ factory: "packages/app" });
      await installFactoryStub(git, "packages/app", loggingScript("main"));

      const created = git.path("..", "wt");
      await git.git("worktree", "add", created, "-b", "wt");
      expect(await stubRuns(stub.log)).toEqual([
        `main:${await realpath(path.join(created, "packages", "app"))}`,
      ]);

      // A dependency hoisted to the repository root is not where step 1 looks
      // either, so the hook must not use it.
      await clear(stub.log);
      await rm(git.path("packages", "app", "node_modules"), { recursive: true, force: true });
      await installFactoryStub(git, "", loggingScript("main"));

      const second = git.path("..", "wt2");
      await git.git("worktree", "add", second, "-b", "wt2");
      expect(await stubRuns(stub.log)).toEqual([
        `path:${await realpath(path.join(second, "packages", "app"))}`,
      ]);
    });

    test("a bare repository's linked worktrees fall through to PATH", async () => {
      const { git, stub } = await hooksRepo();
      const bare = git.path("..", "bare.git");
      await git.git("clone", "--bare", "--quiet", git.root, bare);
      await writeStub(
        path.join(bare, "hooks", "post-checkout"),
        stub.log,
        hookScript("post-checkout", ".", "2.0.0"),
      );

      for (const branch of ["b1", "b2"]) {
        await git.gitAt(bare, "worktree", "add", git.path("..", `bare-${branch}`), "-b", branch);
      }
      await clear(stub.log);
      const third = git.path("..", "bare-b3");
      await git.gitAt(bare, "worktree", "add", third, "-b", "b3");

      expect(await stubRuns(stub.log)).toEqual([`path:${await realpath(third)}`]);
    });

    test("a linked worktree of a submodule falls through to PATH", async () => {
      const { git, stub } = await hooksRepo();
      const source = await repo();
      await source.writeAndCommit(
        ".factory/metafab.yaml",
        "agents: all\ngit-hooks: true\n",
        "factory",
      );
      await git.git(
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        "--quiet",
        source.root,
        "sub",
      );
      await git.git("commit", "--quiet", "-m", "submodule");
      expect((await syncGitHooks(git.path("sub"), true, "2.0.0")).changed).toHaveLength(3);

      // The submodule's main worktree is its own git directory, which has no
      // node_modules, so the hook goes on to PATH. Throws if Git fails.
      const created = git.path("sub-wt");
      await git.gitAt(git.path("sub"), "worktree", "add", created, "-b", "swt");

      expect(await stubRuns(stub.log)).toEqual([`path:${await realpath(created)}`]);
    });

    test("a failing main-worktree build prints one line and lets the Git command succeed", async () => {
      const { git, stub } = await hooksRepo();
      await installFactoryStub(git, "", loggingScript("main", 1));

      const created = git.path("..", "wt");
      const result = await git.gitRaw("worktree", "add", created, "-b", "wt");

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("metafab: build failed. Run metafab build.");
      // A failed build ends the lookup: the stub on PATH does not run.
      expect(await stubRuns(stub.log)).toEqual([`main:${await realpath(created)}`]);
    });
  });

  test("hooks written by an older version are updated once, then left alone", async () => {
    const git = await repo();
    await git.writeAndCommit(".factory/metafab.yaml", "agents: all\ngit-hooks: true\n", "factory");
    await mkdir(git.path(".git", "hooks"), { recursive: true });
    for (const hook of HOOK_NAMES) {
      const target = git.path(".git", "hooks", hook);
      await writeFile(target, await readFile(path.join(OLD_HOOKS, hook), "utf8"));
      await chmod(target, 0o755);
    }

    const first = await syncGitHooks(git.root, true, "2.0.0");

    expect(first.changed).toEqual([
      { hook: "post-checkout", action: "updated" },
      { hook: "post-merge", action: "updated" },
      { hook: "post-rewrite", action: "updated" },
    ]);
    for (const hook of HOOK_NAMES) {
      expect(await readFile(git.path(".git", "hooks", hook), "utf8")).toBe(
        hookScript(hook, ".", "2.0.0"),
      );
    }
    await expect(syncGitHooks(git.root, true, "2.0.0")).resolves.toEqual({
      changed: [],
      warnings: [],
    });
  });
});
