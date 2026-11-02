import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import { prepareFab, publishFab, verifyGitIndex } from "../../../src/core/publish/index.js";
import { addFailure } from "../../../src/core/publish/git-target.js";
import type { PublishConfig } from "../../../src/core/config/types.js";
import { makeRepo } from "../../helpers/makeRepo.js";
import { loadRepo, makePublishRepo } from "./fixtures.js";
import type { RepoFiles, TempRepo } from "../../helpers/makeRepo.js";
import {
  commitMessage,
  gitPublishSection,
  handCommit,
  listRemoteRefs,
  makeBareFabRepo,
  noIdentityEnv,
  remoteRef,
  runGitIn,
  showFile,
  tagMessage,
  treeFiles,
} from "./git-fab-fixture.js";

interface Cleanable {
  cleanup(): Promise<void>;
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function track<T extends Cleanable>(value: T): T {
  cleanups.push(() => value.cleanup());
  return value;
}

function trackEnv(value: { env: NodeJS.ProcessEnv; cleanup(): Promise<void> }): NodeJS.ProcessEnv {
  cleanups.push(value.cleanup);
  return value.env;
}

/** Git settings that store LF and check out CRLF, as a Windows checkout does. */
function withAutocrlf(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.autocrlf",
    GIT_CONFIG_VALUE_0: "true",
  };
}

interface Fixture {
  repo: TempRepo;
  publish: PublishConfig;
  prepared: Awaited<ReturnType<typeof prepareFab>>;
}

async function prepare(
  url: string,
  version: string,
  files?: RepoFiles,
  branch?: string,
): Promise<Fixture> {
  const repo = track(
    await makePublishRepo({
      publish: gitPublishSection(url, version, undefined, branch),
      files,
    }),
  );
  const { factory, config } = await loadRepo(repo);
  const prepared = track(await prepareFab(factory, config));
  return { repo, publish: config.publish as PublishConfig, prepared };
}

async function publish(
  url: string,
  version: string,
  files?: RepoFiles,
  branch?: string,
): Promise<Awaited<ReturnType<typeof publishFab>>> {
  const fixture = await prepare(url, version, files, branch);
  const env = trackEnv(await noIdentityEnv());
  return publishFab(fixture.prepared, fixture.publish, { env, stderr: () => undefined });
}

const VERSION = "1.2.0";

describe("the Git target", () => {
  it("publishes a fab to an empty bare repository", async () => {
    const bare = track(await makeBareFabRepo());

    const result = await publish(bare.repo, VERSION);

    expect(result.version).toBe(VERSION);
    expect(result.targets).toEqual([
      { target: "git", status: "published", detail: expect.stringContaining(VERSION) },
    ]);
    expect(await listRemoteRefs(bare.repo)).toEqual([
      "refs/heads/main",
      "refs/tags/v1.2.0",
    ]);

    const head = await remoteRef(bare.repo, "refs/heads/main");
    expect(head).toBeDefined();
    expect(await commitMessage(bare.repo, head as string)).toBe(`Publish ${VERSION}`);
    expect((await tagMessage(bare.repo, "v1.2.0")).trim()).toBe(`metafab publish ${VERSION}`);

    expect(await showFile(bare.repo, head as string, "README.md")).toBe("# Demo project readme");
    expect(await showFile(bare.repo, head as string, ".factory/factory.yaml")).toContain("name: demo");
    await expect(showFile(bare.repo, head as string, ".factory/metafab.yaml")).rejects.toThrow();
    await expect(showFile(bare.repo, head as string, "package.json")).rejects.toThrow();
  });

  it("uses publish.branch, then the remote default branch", async () => {
    const bare = track(await makeBareFabRepo("trunk"));

    await publish(bare.repo, "1.0.0", undefined, "trunk");
    expect(await listRemoteRefs(bare.repo)).toEqual([
      "refs/heads/trunk",
      "refs/tags/v1.0.0",
    ]);

    await publish(bare.repo, "1.1.0");
    expect(await listRemoteRefs(bare.repo)).toEqual([
      "refs/heads/trunk",
      "refs/tags/v1.0.0",
      "refs/tags/v1.1.0",
    ]);
  });

  it("skips a version whose tag already carries identical content", async () => {
    const bare = track(await makeBareFabRepo());
    await publish(bare.repo, VERSION);
    const head = await remoteRef(bare.repo, "refs/heads/main");

    const result = await publish(bare.repo, VERSION);

    expect(result.targets).toEqual([
      { target: "git", status: "skipped", detail: expect.stringContaining("identical") },
    ]);
    expect(await remoteRef(bare.repo, "refs/heads/main")).toBe(head);
  });

  it("reports a failed git diff instead of a changed fab", async () => {
    const bare = track(await makeBareFabRepo());
    await publish(bare.repo, VERSION);
    const head = await remoteRef(bare.repo, "refs/heads/main");

    const fixture = await prepare(bare.repo, VERSION);
    // Git rejects an unknown diff algorithm when it compares, so the `diff`
    // that decides equality fails for a reason other than "different content".
    const env = {
      ...trackEnv(await noIdentityEnv()),
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "diff.algorithm",
      GIT_CONFIG_VALUE_0: "metafab-test-unknown-algorithm",
    };

    const failure = (await publishFab(fixture.prepared, fixture.publish, {
      env,
      stderr: () => undefined,
    }).catch((error: unknown) => error)) as MetafabError;

    expect(failure).toBeInstanceOf(MetafabError);
    expect(failure.code).toBe("publish-git-failed");
    expect(failure.exitCode).toBe(ExitCode.FetchFailed);
    expect(failure.message).toContain("Cannot compare tag v1.2.0 with the staged fab");
    expect(failure.message).toContain("diff.algorithm");
    expect(await remoteRef(bare.repo, "refs/heads/main")).toBe(head);
  });

  it("refuses a version whose tag carries different content without changing the repository", async () => {
    const bare = track(await makeBareFabRepo());
    await publish(bare.repo, VERSION);
    const head = await remoteRef(bare.repo, "refs/heads/main");

    await expect(
      publish(bare.repo, VERSION, { ".factory/AGENTS.md": "# something else\n" }),
    ).rejects.toMatchObject({ code: "publish-version-exists" });

    expect(await remoteRef(bare.repo, "refs/heads/main")).toBe(head);
  });

  it("skips an unchanged re-publish when core.autocrlf would convert line endings", async () => {
    const bare = track(await makeBareFabRepo());
    const files = { ".factory/AGENTS.md": "# Agents\r\n\r\nCRLF.\r\n" };
    const first = await prepare(bare.repo, VERSION, files);
    const env = withAutocrlf(trackEnv(await noIdentityEnv()));

    await publishFab(first.prepared, first.publish, { env, stderr: () => undefined });

    const again = await prepare(bare.repo, VERSION, files);
    const result = await publishFab(again.prepared, again.publish, {
      env,
      stderr: () => undefined,
    });

    expect(result.targets).toEqual([
      { target: "git", status: "skipped", detail: expect.stringContaining("identical") },
    ]);
  });

  it("stores the staged bytes verbatim whatever a fab .gitattributes asks for", async () => {
    const bare = track(await makeBareFabRepo());
    const files = {
      ".factory/.gitattributes": "*.md text eol=crlf ident\n",
      ".factory/skills/git/notes.md": "# Notes\r\n\r\nbody $Id$\r\n",
    };
    const env = withAutocrlf(trackEnv(await noIdentityEnv()));

    const first = await prepare(bare.repo, VERSION, files);
    await publishFab(first.prepared, first.publish, { env, stderr: () => undefined });

    // Neither the text/eol rule nor ident may change what the tag stores.
    expect(await showFile(bare.repo, "v1.2.0", ".factory/skills/git/notes.md")).toBe(
      "# Notes\r\n\r\nbody $Id$",
    );

    const again = await prepare(bare.repo, VERSION, files);
    const result = await publishFab(again.prepared, again.publish, {
      env,
      stderr: () => undefined,
    });

    expect(result.targets).toEqual([
      { target: "git", status: "skipped", detail: expect.stringContaining("identical") },
    ]);
  });

  it.skipIf(process.platform === "win32")("refuses a version when only a file mode changed", async () => {
    const bare = track(await makeBareFabRepo());
    await publish(bare.repo, VERSION);

    const target = track(
      await makePublishRepo({ publish: gitPublishSection(bare.repo, VERSION) }),
    );
    await chmod(target.path(".factory", "scripts", "release.sh"), 0o644);
    const { factory, config } = await loadRepo(target);
    const prepared = track(await prepareFab(factory, config));
    const env = trackEnv(await noIdentityEnv());

    await expect(
      publishFab(prepared, config.publish as PublishConfig, { env, stderr: () => undefined }),
    ).rejects.toMatchObject({ code: "publish-version-exists" });
  });

  it("refuses to overwrite a hand commit on the fab branch with exit code 5", async () => {
    const bare = track(await makeBareFabRepo());
    await publish(bare.repo, VERSION);
    await handCommit(bare.repo, { ".factory/AGENTS.md": "# edited by hand\n" });

    await expect(publish(bare.repo, "1.3.0")).rejects.toMatchObject({
      exitCode: ExitCode.NotOwned,
    });
    expect(await remoteRef(bare.repo, "refs/tags/v1.3.0")).toBeUndefined();
  });

  it("leaves the project repository untouched", async () => {
    const bare = track(await makeBareFabRepo());
    const fixture = await prepare(bare.repo, VERSION);

    await runGitIn(fixture.repo.root, ["init", "--quiet"]);
    await runGitIn(fixture.repo.root, ["add", "-A"]);
    await runGitIn(fixture.repo.root, ["commit", "--quiet", "-m", "initial"]);

    const statusBefore = await runGitIn(fixture.repo.root, ["status", "--porcelain"]);
    const headBefore = await runGitIn(fixture.repo.root, ["rev-parse", "HEAD"]);

    const env = trackEnv(await noIdentityEnv());
    await publishFab(fixture.prepared, fixture.publish, { env, stderr: () => undefined });

    expect(await runGitIn(fixture.repo.root, ["status", "--porcelain"])).toBe(statusBefore);
    expect(await runGitIn(fixture.repo.root, ["rev-parse", "HEAD"])).toBe(headBefore);
  });

  it("carries the files the fab's own .gitignore matches", async () => {
    const bare = track(await makeBareFabRepo());
    const files = {
      ".factory/skills/git/.gitignore": "*.log\n",
      ".factory/skills/git/debug.log": "a log line\n",
    };

    const result = await publish(bare.repo, VERSION, files);
    const tag = await treeFiles(bare.repo, "v1.2.0");

    expect(result.targets.map((target) => target.status)).toEqual(["published"]);
    expect(tag).toContain(".factory/skills/git/.gitignore");
    expect(tag).toContain(".factory/skills/git/debug.log");
  });

  it("carries a file the user's global exclude file matches", async () => {
    const bare = track(await makeBareFabRepo());
    const identity = await noIdentityEnv();
    cleanups.push(identity.cleanup);
    const excludes = path.join(bare.root, "global-excludes");
    await writeFile(excludes, "*.log\n");
    // Git reads a backslash in a config value as an escape, so a Windows path
    // has to be written with forward slashes (Git accepts them on every
    // platform).
    await writeFile(
      identity.env.GIT_CONFIG_GLOBAL as string,
      `[core]\n\texcludesFile = ${excludes.split(path.sep).join("/")}\n`,
    );

    const fixture = await prepare(bare.repo, VERSION, {
      ".factory/skills/git/debug.log": "a log line\n",
    });
    await publishFab(fixture.prepared, fixture.publish, {
      env: identity.env,
      stderr: () => undefined,
    });

    expect(await treeFiles(bare.repo, "v1.2.0")).toContain(".factory/skills/git/debug.log");
  });

  it("fails the Git target by name when Git did not stage a fab file", async () => {
    const bare = track(await makeBareFabRepo());
    const fixture = await prepare(bare.repo, VERSION, {
      ".factory/skills/git/notes.md": "# notes\n",
    });
    // Git never adds the files under a `.git` directory. Staging refuses that
    // name, so this reaches the safety net only when it arrives another way;
    // the publisher must still report the path instead of pushing a tag that
    // lacks it.
    await mkdir(path.join(fixture.prepared.root, ".factory", "skills", "git", ".git"));
    await writeFile(
      path.join(fixture.prepared.root, ".factory", "skills", "git", ".git", "config"),
      "[core]\n",
    );
    const env = trackEnv(await noIdentityEnv());

    const result = await publishFab(fixture.prepared, fixture.publish, {
      env,
      stderr: () => undefined,
    });

    expect(result.targets).toEqual([
      {
        target: "git",
        status: "failed",
        detail: expect.stringContaining(".factory/skills/git/.git/config"),
      },
    ]);
    expect(result.exitCode).toBe(ExitCode.InvalidFab);
    expect(result.problems?.map((problem) => problem.file)).toContain(
      ".factory/skills/git/.git/config",
    );
    expect(await remoteRef(bare.repo, "refs/heads/main")).toBeUndefined();
  });

  it("names a file whose staged bytes do not match the index", async () => {
    const repoDir = track(await makeRepo());
    const stagedRoot = track(await makeRepo());
    await writeFile(path.join(repoDir.root, "notes.md"), "one\n");
    await runGitIn(repoDir.root, ["init", "--quiet"]);
    await runGitIn(repoDir.root, ["add", "-A"]);
    await writeFile(path.join(stagedRoot.root, "notes.md"), "two\n");

    const failure = (await verifyGitIndex(repoDir.root, stagedRoot.root).catch(
      (error: unknown) => error,
    )) as MetafabError;

    expect(failure).toBeInstanceOf(MetafabError);
    expect(failure.code).toBe("publish-git-files-lost");
    expect(failure.exitCode).toBe(ExitCode.InvalidFab);
    expect(failure.message).toContain("different bytes");
    expect(failure.problems).toEqual([
      expect.objectContaining({
        file: "notes.md",
        message: "Git stored different bytes for notes.md",
      }),
    ]);
  });

  it.skipIf(process.platform === "win32")(
    "publishes a fab file whose name contains a newline",
    async () => {
      const bare = track(await makeBareFabRepo());
      const odd = ".factory/skills/git/odd\nname.md";

      const result = await publish(bare.repo, VERSION, { [odd]: "# odd name\n" });

      expect(result.targets.map((target) => target.status)).toEqual(["published"]);
      // `ls-tree` without `-z` would quote the name, so ask for NUL separators.
      const tree = await runGitIn(process.cwd(), [
        "--git-dir",
        bare.repo,
        "ls-tree",
        "-r",
        "-z",
        "--name-only",
        "v1.2.0",
      ]);
      expect(tree.split("\0").filter((file) => file !== "")).toContain(odd);
      expect(await showFile(bare.repo, "v1.2.0", odd)).toBe("# odd name");
    },
  );

  it("publishes when init.templateDir has no info directory", async () => {
    const bare = track(await makeBareFabRepo());
    // A template directory without `info/` is what leaves `.git/info` out of
    // the clone, so the attributes file cannot be written without creating it.
    const template = track(await makeRepo());
    const env = {
      ...trackEnv(await noIdentityEnv()),
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "init.templateDir",
      GIT_CONFIG_VALUE_0: template.root,
    };

    const fixture = await prepare(bare.repo, VERSION, {
      ".factory/AGENTS.md": "# Agents\r\n\r\nCRLF.\r\n",
    });
    const result = await publishFab(fixture.prepared, fixture.publish, {
      env,
      stderr: () => undefined,
    });

    expect(result.targets.map((target) => target.status)).toEqual(["published"]);
    expect(await showFile(bare.repo, "v1.2.0", ".factory/AGENTS.md")).toBe(
      "# Agents\r\n\r\nCRLF.",
    );
  });

  it("keeps the failed target detail short when it names many paths", async () => {
    const bare = track(await makeBareFabRepo());
    const fixture = await prepare(bare.repo, VERSION);
    await mkdir(path.join(fixture.prepared.root, ".factory", "skills", "git", ".git"));
    for (let index = 0; index < 5; index += 1) {
      await writeFile(
        path.join(
          fixture.prepared.root,
          ".factory",
          "skills",
          "git",
          ".git",
          `extra-${index}.md`,
        ),
        "# not staged\n",
      );
    }
    const env = trackEnv(await noIdentityEnv());

    const result = await publishFab(fixture.prepared, fixture.publish, {
      env,
      stderr: () => undefined,
    });
    const detail = result.targets[0]?.detail as string;

    expect(result.problems).toHaveLength(5);
    expect(detail).toContain("(5 paths: ");
    expect(detail).toContain(".factory/skills/git/.git/extra-2.md");
    expect(detail).toContain("and 2 more");
    expect(detail).not.toContain("extra-3.md");
  });
});

describe("addFailure", () => {
  it("reports a path Git's verify_path rejects as a fab-rule failure", () => {
    const failure = addFailure(
      "error: invalid path '.factory/templates/.g\\342\\200\\214it/config'\nfatal: adding files failed",
      "Cannot stage the fab",
    );

    expect(failure.exitCode).toBe(ExitCode.InvalidFab);
    expect(failure.code).toBe("publish-git-invalid-path");
    expect(failure.message).toBe("Git cannot store .factory/templates/.g\u200cit/config in a fab.");
    expect(failure.problems).toEqual([
      expect.objectContaining({ file: ".factory/templates/.g\u200cit/config" }),
    ]);
  });

  it("keeps an ordinary Git failure", () => {
    const failure = addFailure("fatal: not a git repository", "Cannot stage the fab");

    expect(failure.exitCode).toBe(ExitCode.FetchFailed);
    expect(failure.code).toBe("publish-git-failed");
    expect(failure.message).toBe("Cannot stage the fab: fatal: not a git repository");
  });
});
