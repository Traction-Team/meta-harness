import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ExitCode, MetafabError } from "../../errors.js";
import type { Problem } from "../../errors.js";
import { copyTree, listFiles } from "../../util/fs.js";
import type { PublishConfig } from "../config/types.js";
import { disabledHooksConfig, gitEnvironment, gitMessage, VERBATIM_TEXT_ATTRIBUTES } from "../sources/git-process.js";
import { gitTransportUrl, sourceWithoutCredentials } from "../sources/parse.js";
import { redact } from "../sources/redact.js";
import { PUBLISH_RETRY_FIX, publishProblem } from "./prepare.js";
import type { PublishOptions } from "./types.js";

/** The tag message prefix that marks a tag `publish` created itself. */
const TAG_MESSAGE = "metafab publish";
/** A commit identity used only when the user has none configured. */
const FALLBACK_NAME = "metafab";
const FALLBACK_EMAIL = "metafab@example.com";
/** npm-only files: a Git fab repository carries no `package.json`. */
const NPM_ONLY_FILES = new Set(["package.json"]);

/**
 * A fab must reach the fab repository byte for byte. Git would otherwise apply
 * the fab's own `.gitattributes`, or the user's `core.autocrlf`: a `text` or
 * `eol` rule converts line endings, `filter=lfs` replaces the content, and
 * `ident` expands `$Id$`. Every clone publish uses turns those attributes off
 * for every path before anything is checked out or added.
 */
// Publish never runs git archive, so it needs no export rules and no tar.umask.
const VERBATIM_ATTRIBUTES = `* ${VERBATIM_TEXT_ATTRIBUTES}\n`;

/**
 * A fab may ship its own `.gitignore`, and the user's global exclude file is
 * theirs, not the fab's. Both would silently keep a staged file out of the
 * commit, so publishing stages with `git add --force`, which adds a path the
 * ignore rules match. `core.autocrlf=false` keeps line endings as staged.
 */
function verbatimConfig(): string {
  return "core.autocrlf=false";
}

interface GitFailure {
  stdout?: string;
  stderr?: string;
  message?: string;
}

interface GitResult {
  ok: boolean;
  /** The exit status; `undefined` when Git never ran or died from a signal. */
  status?: number;
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
    env: gitEnvironment(options.env, options.interactive),
  };
}

function gitError(
  message: string,
  code: string,
  exitCode: ExitCode,
  cause?: unknown,
  fix = PUBLISH_RETRY_FIX,
): MetafabError {
  const text = redact(message);
  return new MetafabError(text, {
    exitCode,
    code,
    cause,
    problems: [publishProblem(text, fix)],
  });
}

async function tryGit(
  args: string[],
  cwd: string,
  context: GitContext,
  config: string[] = [],
  input?: string,
): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = execFile(
      "git",
      ["-c", disabledHooksConfig(), ...config, ...args],
      {
        cwd,
        env: context.env,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ ok: true, stdout: stdout ?? "", stderr: stderr ?? "" });
          return;
        }
        const failure = error as GitFailure & { code?: unknown };
        resolve({
          ok: false,
          ...(typeof failure.code === "number" ? { status: failure.code } : {}),
          stdout: stdout ?? failure.stdout ?? "",
          stderr: stderr ?? failure.stderr ?? failure.message ?? "",
        });
      },
    );
    if (input !== undefined) {
      // A Git call that dies before it reads its input must not crash publish.
      child.stdin?.on("error", () => undefined);
      child.stdin?.end(input);
    }
  });
}

async function runGit(
  args: string[],
  cwd: string,
  context: GitContext,
  argvConfig: string[],
  failure: (detail: string) => MetafabError,
  input?: string,
): Promise<string> {
  const result = await tryGit(args, cwd, context, argvConfig, input);
  if (!result.ok) throw failure(gitMessage(result));
  return result.stdout;
}

function gitFailureError(context: string): (detail: string) => MetafabError {
  return (detail) => gitError(`${context}: ${detail}`, "publish-git-failed", ExitCode.FetchFailed);
}

/**
 * Git quotes a path it prints the way C would, with an octal escape for every
 * byte it cannot show; a rejected `.git` name with a formatting character in it
 * arrives that way.
 */
function unquoteGitPath(quoted: string): string {
  if (!quoted.includes("\\")) return quoted;

  const simple: Record<string, string> = {
    a: "\x07",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
    v: "\v",
    "\\": "\\",
    '"': '"',
  };
  const bytes: number[] = [];

  for (let index = 0; index < quoted.length; index += 1) {
    const character = quoted[index] as string;
    if (character !== "\\") {
      bytes.push(...Buffer.from(character, "utf8"));
      continue;
    }
    const octal = /^[0-7]{3}/.exec(quoted.slice(index + 1));
    if (octal !== null) {
      bytes.push(Number.parseInt(octal[0], 8));
      index += 3;
      continue;
    }
    const escaped = quoted[index + 1] ?? "";
    bytes.push(...Buffer.from(simple[escaped] ?? escaped, "utf8"));
    index += 1;
  }

  return Buffer.from(bytes).toString("utf8");
}

/**
 * `git add` fails a path its `verify_path` rejects even when staging let the
 * name through: a `.git` spelling the filesystem folds, for instance. That is a
 * fab-rule rejection (exit 4) that names the path, not a Git failure.
 */
export function addFailure(message: string, context: string): MetafabError {
  const invalid =
    /(?:error|fatal): invalid path (?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/.exec(message);
  if (invalid === null) return gitFailureError(context)(message);

  const file = unquoteGitPath(invalid[1] ?? invalid[2] ?? "");
  const problem: Problem = {
    level: "error",
    file,
    message: `Git cannot store ${file} in a fab`,
    fix: "Rename the path or add it to publish.exclude",
  };
  return new MetafabError(`Git cannot store ${file} in a fab.`, {
    exitCode: ExitCode.InvalidFab,
    code: "publish-git-invalid-path",
    problems: [problem],
  });
}

/**
 * Stages the whole working tree with Git's ignore rules off. A fab may ship a
 * `.gitignore` of its own, and the user's global exclude file must not decide
 * what a published fab carries, so the tree Git commits is the staged fab.
 */
async function addFabFiles(
  repo: string,
  context: GitContext,
  failure: string,
): Promise<void> {
  const result = await tryGit(["add", "-A", "--force"], repo, context, ["-c", verbatimConfig()]);
  if (!result.ok) throw addFailure(gitMessage(result), failure);
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
  // `check` accepts the import form, so `publish.git` may be written as
  // `git+https://`, `git+ssh://` or `git+file://`. Git has no `git+` transport
  // and would fail with `remote-git+https is not a git command`.
  return gitTransportUrl(publish.git);
}

async function cloneFab(url: string, parent: string, context: GitContext): Promise<string> {
  const repo = path.join(parent, "fab");
  await runGit(
    ["clone", "--", url, repo],
    parent,
    context,
    [],
    gitFailureError(`Cannot clone fab repository ${sourceWithoutCredentials(url)}`),
  );
  // The clone has already checked its branch out, and the attributes apply to
  // every checkout and add that follows, so the publish and the
  // identical-content comparison both store the staged bytes. An `init.templateDir`
  // without `info/` leaves the directory out, so create it first.
  await mkdir(path.join(repo, ".git", "info"), { recursive: true });
  writeFileSync(path.join(repo, ".git", "info", "attributes"), VERBATIM_ATTRIBUTES);
  return repo;
}

async function tagExistsRemotely(url: string, tag: string, context: GitContext): Promise<boolean> {
  const ref = `refs/tags/${tag}`;
  const output = await runGit(
    ["ls-remote", "--tags", "--refs", "--", url],
    process.cwd(),
    context,
    [],
    gitFailureError(`Cannot read tags from fab repository ${sourceWithoutCredentials(url)}`),
  );
  return output.split("\n").some((line) => line.split("\t")[1]?.trim() === ref);
}

/**
 * The tag's tree and the staged fab are compared by Git itself: the tag is
 * checked out, the staged fab replaces the tracked files, and Git decides
 * whether anything changed. The clone stores bytes verbatim (see
 * `VERBATIM_ATTRIBUTES`), so line endings, filters and modes count exactly as
 * Git stores them, and a round trip through a clone is not a difference.
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
  await addFabFiles(repo, context, "Cannot compare the fab repository files");

  const differences = await tryGit(["diff", "--cached", "--quiet"], repo, context);
  if (differences.ok) return true;
  // `--quiet` exits 1 only to report differences; any other failure is a Git
  // error, not a changed fab.
  if (differences.status === 1) return false;
  throw gitFailureError(`Cannot compare tag ${tag} with the staged fab`)(gitMessage(differences));
}

function filesLostError(
  missing: readonly string[],
  extra: readonly string[],
  changed: readonly string[] = [],
): MetafabError {
  const problems: Problem[] = [
    ...missing.map((file) => ({
      level: "error" as const,
      file,
      message: `Git did not stage ${file}`,
      fix: "Rename the path or add it to publish.exclude; Git cannot store it in a fab",
    })),
    ...changed.map((file) => ({
      level: "error" as const,
      file,
      message: `Git stored different bytes for ${file}`,
      fix: "Report this at https://github.com/seasb/metafab/issues",
    })),
    ...extra.map((file) => ({
      level: "error" as const,
      file,
      message: `Git staged ${file}, which the staged fab does not carry`,
      fix: "Report this at https://github.com/seasb/metafab/issues",
    })),
  ];
  const message =
    missing.length === 0 && extra.length === 0
      ? "The Git fab would store different bytes than the staged fab."
      : "The Git fab would not carry every staged file.";

  return new MetafabError(message, {
    exitCode: ExitCode.InvalidFab,
    code: "publish-git-files-lost",
    problems,
  });
}

/** The blob id and path of every index entry, as `git ls-files -s -z` reports them. */
function indexBlobs(listed: string): Map<string, string> {
  const entries = new Map<string, string>();

  for (const record of listed.split("\0")) {
    if (record === "") continue;
    const tab = record.indexOf("\t");
    if (tab < 0) continue;
    const [mode, blob] = record.slice(0, tab).split(" ");
    if (mode === undefined || blob === undefined || blob === "") continue;
    entries.set(record.slice(tab + 1), blob);
  }

  return entries;
}

/** The blob id Git would store for each staged file, with no filter applied. */
async function stagedBlobs(
  repo: string,
  root: string,
  expected: readonly string[],
  context: GitContext,
): Promise<Map<string, string>> {
  const failure = gitFailureError("Cannot compare the staged fab with the Git index");
  const batch: Array<{ file: string; absolute: string }> = [];
  const single: Array<{ file: string; absolute: string }> = [];

  for (const file of expected) {
    const absolute = path.join(root, ...file.split("/"));
    // `--stdin-paths` reads one path per line, so a name that contains a line
    // break would be read as two paths. Those files are hashed one at a time,
    // so Git still computes the id in the repository's own object format.
    (absolute.includes("\n") || absolute.includes("\r") ? single : batch).push({ file, absolute });
  }

  const blobs = new Map<string, string>();

  if (batch.length > 0) {
    const output = await runGit(
      ["hash-object", "--no-filters", "--stdin-paths"],
      repo,
      context,
      [],
      failure,
      batch.map((entry) => `${entry.absolute}\n`).join(""),
    );
    const hashes = output.split("\n").filter((hash) => hash !== "");

    if (hashes.length !== batch.length) {
      throw failure("git hash-object returned a different number of ids than the staged files");
    }

    batch.forEach((entry, index) => blobs.set(entry.file, hashes[index] as string));
  }

  for (const entry of single) {
    const output = await runGit(
      ["hash-object", "--no-filters", "--", entry.absolute],
      repo,
      context,
      [],
      failure,
    );
    blobs.set(entry.file, output.trim());
  }

  return blobs;
}

/**
 * The safety net for the Git target: `git add --force` covers the ignore rules,
 * and the clone stores bytes verbatim, but Git can still keep a file out of the
 * index, store different bytes for it, or add one the fab lacks. After staging,
 * the index is compared with the staged fab by path and blob id, and a
 * difference stops the publish before the commit names a tree that is not the
 * fab. The problems name every path.
 */
export async function verifyGitIndex(
  repo: string,
  root: string,
  options: PublishOptions = {},
): Promise<void> {
  const context = gitContext(options);
  const listed = await runGit(
    ["ls-files", "-s", "-z"],
    repo,
    context,
    [],
    gitFailureError("Cannot read the fab repository files"),
  );
  const tracked = indexBlobs(listed);
  const expected = (await listFiles(root)).filter((file) => !NPM_ONLY_FILES.has(file));
  const expectedSet = new Set(expected);
  const blobs = await stagedBlobs(repo, root, expected, context);
  const missing = expected.filter((file) => !tracked.has(file));
  const changed = expected.filter(
    (file) => tracked.has(file) && tracked.get(file) !== blobs.get(file),
  );
  const extra = [...tracked.keys()].filter((file) => !expectedSet.has(file)).sort();
  if (missing.length === 0 && changed.length === 0 && extra.length === 0) return;

  throw filesLostError(missing, extra, changed);
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
    `The fab repository ${sourceWithoutCredentials(url)} already has tag v${version}.`,
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
    await addFabFiles(repo, context, "Cannot stage the fab");
    // Staging and the commit must name the same tree: a file Git left out would
    // be reported as published while the tag never carried it.
    await verifyGitIndex(repo, root, options);

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
      gitFailureError(`Cannot push ${tag} to ${sourceWithoutCredentials(url)}`),
    );

    return `Published ${version} to ${branch} in ${sourceWithoutCredentials(url)}.`;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
