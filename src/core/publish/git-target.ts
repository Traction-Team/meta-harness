import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { copyTree } from "../../util/fs.js";
import type { PublishConfig } from "../config/types.js";
import { withEnv } from "../sources/env.js";
import { redact, stripSourceCredentials } from "../sources/redact.js";
import type { PublishOptions } from "./types.js";

const execFileAsync = promisify(execFile);

/** The tag message prefix that marks a tag `publish` created itself. */
const TAG_MESSAGE = "metafab publish";
/** A commit identity used only when the user has none configured. */
const FALLBACK_NAME = "metafab";
const FALLBACK_EMAIL = "metafab@example.com";
/** npm-only files: a Git fab repository carries no `package.json`. */
const NPM_ONLY_FILES = new Set(["package.json"]);

let hooksDirectory: string | undefined;

/**
 * Git runs `core.hooksPath` hooks from the user's configuration, and a hook is
 * code from outside the fab; publishing must never run it. An empty directory
 * is a hooks directory with nothing in it on every platform.
 */
function hooksConfig(): string {
  if (hooksDirectory === undefined) {
    const directory = mkdtempSync(path.join(tmpdir(), "metafab-publish-hooks-"));
    hooksDirectory = directory;
    process.once("exit", () => {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // best effort: the temporary directory is empty
      }
    });
  }
  return `core.hooksPath=${hooksDirectory}`;
}

interface GitFailure {
  stdout?: string;
  stderr?: string;
  message?: string;
}

interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

interface GitContext {
  env: NodeJS.ProcessEnv;
}

/**
 * One helper for every Git call the publish workflows make. It disables hooks
 * and turns off the credential prompt unless the caller allows it.
 */
function gitContext(options: PublishOptions): GitContext {
  return {
    env: withEnv(
      options.env ?? process.env,
      options.interactive === true ? {} : { GIT_TERMINAL_PROMPT: "0" },
    ),
  };
}

function gitMessage(failure: GitFailure): string {
  const raw = (failure.stderr ?? "").trim() || (failure.stdout ?? "").trim() || failure.message || "";
  return (
    raw
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line !== "")
      .join("\n") || "git failed"
  );
}

function gitError(message: string, code: string, exitCode: ExitCode, cause?: unknown): MetafabError {
  return new MetafabError(redact(message), { exitCode, code, cause });
}

async function tryGit(
  args: string[],
  cwd: string,
  context: GitContext,
  config: string[] = [],
): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "git",
      ["-c", hooksConfig(), ...config, ...args],
      {
        cwd,
        env: context.env,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      },
    );
    return { ok: true, stdout, stderr };
  } catch (error) {
    const failure = error as GitFailure;
    return {
      ok: false,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message ?? "",
    };
  }
}

async function runGit(
  args: string[],
  cwd: string,
  context: GitContext,
  argvConfig: string[],
  failure: (detail: string) => MetafabError,
): Promise<string> {
  const result = await tryGit(args, cwd, context, argvConfig);
  if (!result.ok) throw failure(gitMessage(result));
  return result.stdout;
}

function gitFailureError(context: string): (detail: string) => MetafabError {
  return (detail) => gitError(`${context}: ${detail}`, "publish-git-failed", ExitCode.FetchFailed);
}

/** `publish.git` is required for the Git target; a missing URL is a config error. */
function gitUrl(publish: PublishConfig): string {
  if (publish.git === undefined) {
    throw new MetafabError("The Git target requires publish.git.", {
      exitCode: ExitCode.Failed,
      code: "publish-missing-setting",
      problems: [
        {
          level: "error",
          file: ".factory/metafab.yaml",
          message: "The Git target requires publish.git.",
          fix: 'Add "git" to the publish section',
        },
      ],
    });
  }
  return publish.git;
}

async function cloneFab(url: string, parent: string, context: GitContext): Promise<string> {
  const repo = path.join(parent, "fab");
  await runGit(
    ["clone", "--", url, repo],
    parent,
    context,
    [],
    gitFailureError(`Cannot clone fab repository ${stripSourceCredentials(url)}`),
  );
  return repo;
}

async function tagExistsRemotely(url: string, tag: string, context: GitContext): Promise<boolean> {
  const ref = `refs/tags/${tag}`;
  const output = await runGit(
    ["ls-remote", "--tags", "--refs", "--", url],
    process.cwd(),
    context,
    [],
    gitFailureError(`Cannot read tags from fab repository ${stripSourceCredentials(url)}`),
  );
  return output.split("\n").some((line) => line.split("\t")[1]?.trim() === ref);
}

/**
 * The tag's tree and the staged fab are compared by Git itself: the tag is
 * checked out, the staged fab replaces the tracked files, and Git decides
 * whether anything changed. Line endings (`core.autocrlf`), filters and modes
 * therefore count exactly as Git stores them, so a round trip through a clone
 * is not a difference.
 */
async function tagTreeMatches(
  repo: string,
  tag: string,
  root: string,
  context: GitContext,
): Promise<boolean> {
  await runGit(
    ["checkout", "--quiet", "--force", "--detach", `refs/tags/${tag}`],
    repo,
    context,
    [],
    gitFailureError(`Cannot read tag ${tag}`),
  );
  await runGit(
    ["rm", "-r", "-q", "-f", "--ignore-unmatch", "."],
    repo,
    context,
    [],
    gitFailureError("Cannot compare the fab repository files"),
  );

  await copyTree(root, repo, { ignore: (relativePath) => NPM_ONLY_FILES.has(relativePath) });
  await runGit(
    ["add", "-A"],
    repo,
    context,
    [],
    gitFailureError("Cannot compare the fab repository files"),
  );

  const differences = await tryGit(["diff", "--cached", "--quiet"], repo, context);
  return differences.ok;
}

export interface GitVersionState {
  /** The fab repository already has tag `v<version>`. */
  tagExists: boolean;
  /** The tag's tree is the staged fab, without the npm-only files. */
  identical: boolean;
}

/** Whether the fab repository already has `v<version>`, and with which content. */
export async function gitVersionState(
  publish: PublishConfig,
  version: string,
  root: string,
  options: PublishOptions = {},
): Promise<GitVersionState> {
  const url = gitUrl(publish);
  const context = gitContext(options);
  const tag = `v${version}`;

  if (!(await tagExistsRemotely(url, tag, context))) {
    return { tagExists: false, identical: false };
  }

  const scratch = await mkdtemp(path.join(tmpdir(), "metafab-publish-check-"));
  try {
    const repo = await cloneFab(url, scratch, context);
    return { tagExists: true, identical: await tagTreeMatches(repo, tag, root, context) };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function hasCommits(repo: string, context: GitContext): Promise<boolean> {
  const result = await tryGit(["rev-parse", "--verify", "--quiet", "HEAD"], repo, context);
  return result.ok && result.stdout.trim() !== "";
}

async function defaultBranch(repo: string, context: GitContext): Promise<string | undefined> {
  const result = await tryGit(
    ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
    repo,
    context,
  );
  if (!result.ok) return undefined;
  const prefix = "refs/remotes/origin/";
  const ref = result.stdout.trim();
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : undefined;
}

async function checkoutBranch(
  repo: string,
  branch: string,
  context: GitContext,
): Promise<void> {
  if (!(await hasCommits(repo, context))) {
    await runGit(
      ["checkout", "--quiet", "-B", branch],
      repo,
      context,
      [],
      gitFailureError(`Cannot start branch "${branch}"`),
    );
    return;
  }

  const remote = await tryGit(
    ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`],
    repo,
    context,
  );
  if (!remote.ok) {
    const problem: Problem = {
      level: "error",
      file: ".factory/metafab.yaml",
      message: `The fab repository has no branch "${branch}".`,
      fix: `Set publish.branch to an existing branch, or create "${branch}" in the fab repository`,
    };
    throw new MetafabError(`The fab repository has no branch "${branch}".`, {
      exitCode: ExitCode.Failed,
      code: "publish-git-branch-missing",
      problems: [problem],
    });
  }

  await runGit(
    ["checkout", "--quiet", "-B", branch, `origin/${branch}`],
    repo,
    context,
    [],
    gitFailureError(`Cannot check out branch "${branch}"`),
  );
}

/**
 * The branch head must be a commit an earlier `publish` tagged, so a hand edit
 * in the fab repository is reported instead of silently overwritten. An empty
 * repository has no head and passes.
 */
async function publishOwnsHead(
  repo: string,
  branch: string,
  context: GitContext,
): Promise<void> {
  if (!(await hasCommits(repo, context))) return;

  const tags = await runGit(
    ["tag", "--points-at", "HEAD"],
    repo,
    context,
    [],
    gitFailureError("Cannot read the branch tags"),
  );

  for (const tag of tags.split("\n").map((line) => line.trim()).filter((line) => line !== "")) {
    const info = await tryGit(
      ["for-each-ref", `refs/tags/${tag}`, "--format=%(objecttype)%00%(contents:subject)"],
      repo,
      context,
    );
    if (!info.ok) continue;
    const [type, subject] = info.stdout.split("\0");
    // A lightweight tag reports the commit's own subject, not a tag message.
    if (type === "tag" && subject !== undefined && subject.trim().startsWith(`${TAG_MESSAGE} `)) {
      return;
    }
  }

  const problem: Problem = {
    level: "error",
    file: ".factory/metafab.yaml",
    message: `The head of "${branch}" is not tagged by an earlier publish.`,
    fix: "Revert the commits made directly in the fab repository, then publish again",
  };
  throw new MetafabError(
    `The Git fab repository branch "${branch}" was changed outside metafab publish.`,
    { exitCode: ExitCode.NotOwned, code: "publish-git-not-ours", problems: [problem] },
  );
}

/** The identity flags for a commit or a tag when the user has none configured. */
async function identityConfig(repo: string, context: GitContext): Promise<string[]> {
  const [name, email] = await Promise.all([
    tryGit(["config", "--get", "user.name"], repo, context),
    tryGit(["config", "--get", "user.email"], repo, context),
  ]);
  if (name.ok && name.stdout.trim() !== "" && email.ok && email.stdout.trim() !== "") return [];
  return ["-c", `user.name=${FALLBACK_NAME}`, "-c", `user.email=${FALLBACK_EMAIL}`];
}

function versionExistsError(version: string, url: string): MetafabError {
  return new MetafabError(
    `The fab repository ${stripSourceCredentials(url)} already has tag v${version}.`,
    {
      exitCode: ExitCode.Failed,
      code: "publish-version-exists",
      problems: [
        {
          level: "error",
          file: ".factory/metafab.yaml",
          message: `Tag v${version} already exists in the fab repository.`,
          fix: "Bump publish.version; a published version cannot change",
        },
      ],
    },
  );
}

/**
 * Replaces the fab repository branch with the staged fab, then pushes the
 * commit and the annotated release tag atomically. Nothing in the project
 * repository is read or written.
 */
export async function publishGitFab(
  publish: PublishConfig,
  version: string,
  root: string,
  options: PublishOptions = {},
): Promise<string> {
  const url = gitUrl(publish);
  const context = gitContext(options);
  const tag = `v${version}`;
  const scratch = await mkdtemp(path.join(tmpdir(), "metafab-publish-push-"));

  try {
    const repo = await cloneFab(url, scratch, context);
    const remoteDefault = await defaultBranch(repo, context);
    const branch = publish.branch ?? remoteDefault ?? "main";
    await checkoutBranch(repo, branch, context);

    const existing = await tryGit(
      ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`],
      repo,
      context,
    );
    if (existing.ok) throw versionExistsError(version, url);

    await publishOwnsHead(repo, branch, context);

    const committed = await hasCommits(repo, context);
    if (committed) {
      await runGit(
        ["rm", "-r", "-q", "."],
        repo,
        context,
        [],
        gitFailureError("Cannot replace the fab repository files"),
      );
    }

    await copyTree(root, repo, { ignore: (relativePath) => NPM_ONLY_FILES.has(relativePath) });
    await runGit(["add", "-A"], repo, context, [], gitFailureError("Cannot stage the fab"));

    const identity = await identityConfig(repo, context);
    await runGit(
      ["commit", "--allow-empty", "--quiet", "-m", `Publish ${version}`],
      repo,
      context,
      identity,
      gitFailureError("Cannot commit the fab"),
    );
    await runGit(
      ["tag", "-a", tag, "-m", `${TAG_MESSAGE} ${version}`],
      repo,
      context,
      identity,
      gitFailureError(`Cannot create tag ${tag}`),
    );
    await runGit(
      ["push", "--atomic", "origin", branch, tag],
      repo,
      context,
      [],
      gitFailureError(`Cannot push ${tag} to ${stripSourceCredentials(url)}`),
    );

    return `Published ${version} to ${branch} in ${stripSourceCredentials(url)}.`;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
