import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Git calls in fixtures carry their own identity so Git config never leaks in. */
export async function runGitIn(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    [
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "user.name=Metafab Test",
      "-c",
      "user.email=metafab@example.com",
      ...args,
    ],
    { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true },
  );
  return stdout.trim();
}

export interface BareFabRepo {
  root: string;
  repo: string;
  cleanup(): Promise<void>;
}

export async function makeBareFabRepo(branch = "main"): Promise<BareFabRepo> {
  const root = await mkdtemp(path.join(tmpdir(), "metafab-fab-repo-"));
  const repo = path.join(root, "fab.git");
  await runGitIn(root, ["init", "--quiet", "--bare", `--initial-branch=${branch}`, repo]);
  return {
    root,
    repo,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

/** Every ref name a remote reports, with `HEAD` and peeled tags removed. */
export async function listRemoteRefs(repo: string): Promise<string[]> {
  const output = await runGitIn(process.cwd(), ["ls-remote", "--refs", "--", repo]);
  return output
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => line.split("\t")[1] ?? "");
}

export async function remoteRef(repo: string, ref: string): Promise<string | undefined> {
  const output = await runGitIn(process.cwd(), ["ls-remote", "--refs", "--", repo, ref]);
  return output === "" ? undefined : (output.split("\t")[0] ?? undefined);
}

export async function tagMessage(repo: string, tag: string): Promise<string> {
  return runGitIn(process.cwd(), [
    "--git-dir",
    repo,
    "for-each-ref",
    `refs/tags/${tag}`,
    "--format=%(contents)",
  ]);
}

export async function commitMessage(repo: string, revision: string): Promise<string> {
  return runGitIn(process.cwd(), [
    "--git-dir",
    repo,
    "log",
    "-1",
    "--format=%s",
    revision,
  ]);
}

export async function showFile(repo: string, revision: string, file: string): Promise<string> {
  return runGitIn(process.cwd(), ["--git-dir", repo, "show", `${revision}:${file}`]);
}

/** A commit made directly in the fab repository, the way a hand edit arrives. */
export async function handCommit(
  repo: string,
  files: Record<string, string>,
  message = "hand edit",
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "metafab-fab-hand-"));
  try {
    const work = path.join(root, "work");
    await runGitIn(root, ["clone", "--quiet", repo, work]);
    for (const [relativePath, content] of Object.entries(files)) {
      const target = path.join(work, ...relativePath.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    await runGitIn(work, ["add", "-A"]);
    await runGitIn(work, ["commit", "-q", "-m", message]);
    await runGitIn(work, ["push", "--quiet", "origin", "HEAD"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/**
 * An environment with no Git identity at all, so publish has to supply its
 * fallback. The empty global config also keeps a developer's own config out.
 */
export async function noIdentityEnv(
  base: NodeJS.ProcessEnv = process.env,
): Promise<{ env: NodeJS.ProcessEnv; cleanup(): Promise<void> }> {
  const root = await mkdtemp(path.join(tmpdir(), "metafab-fab-identity-"));
  const config = path.join(root, "gitconfig");
  await writeFile(config, "");
  return {
    env: { ...base, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: "1" },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export function gitPublishSection(
  url: string,
  version: string,
  name?: string,
  branch?: string,
): string {
  return [
    "publish:",
    ...(name === undefined ? [] : [`  name: ${JSON.stringify(name)}`]),
    `  git: ${JSON.stringify(url)}`,
    ...(branch === undefined ? [] : [`  branch: ${JSON.stringify(branch)}`]),
    `  version: ${version}`,
    "",
  ].join("\n");
}

export function npmPublishSection(name: string, version: string): string {
  return ["publish:", `  name: ${JSON.stringify(name)}`, `  version: ${version}`, ""].join("\n");
}
