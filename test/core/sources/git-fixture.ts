import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FIXTURES = fileURLToPath(new URL("../../fixtures/fabs/", import.meta.url));

export interface GitFixture {
  root: string;
  work: string;
  repo: string;
  commits: { v100: string; v110: string; v200: string; feature: string; main: string };
  cleanup(): Promise<void>;
}

export async function runGitIn(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true },
  );
  return stdout.trim();
}

async function initWorkRepository(root: string): Promise<string> {
  const work = path.join(root, "work");
  await runGitIn(root, ["init", "-q", "-b", "main", work]);
  await runGitIn(work, ["config", "user.name", "Metafab Test"]);
  await runGitIn(work, ["config", "user.email", "metafab@example.com"]);
  await cp(path.join(FIXTURES, "valid-fab", ".factory"), path.join(work, ".factory"), {
    recursive: true,
  });
  await writeFile(path.join(work, "README.md"), "# Test fab\n");
  return work;
}

export async function createGitFixture(): Promise<GitFixture> {
  const root = await mkdtemp(path.join(tmpdir(), "metafab-git-fixture-"));
  const work = await initWorkRepository(root);
  const repo = path.join(root, "repo.git");

  await writeFile(
    path.join(work, ".factory", "metafab.yaml"),
    "upstream:\n  source: belongs-to-the-project\n",
  );
  await writeFile(path.join(work, ".factory", "README.md"), "# belongs at the fab root\n");

  await runGitIn(work, ["add", "-A"]);
  await runGitIn(work, ["commit", "-qm", "first"]);
  const v100 = await runGitIn(work, ["rev-parse", "HEAD"]);
  await runGitIn(work, ["tag", "v1.0.0"]);
  await runGitIn(work, ["tag", "release-candidate", v100]);

  await writeFile(path.join(work, ".factory", "AGENTS.md"), "# Agents at 1.1.0\n");
  await runGitIn(work, ["commit", "-qam", "second"]);
  const v110 = await runGitIn(work, ["rev-parse", "HEAD"]);
  await runGitIn(work, ["tag", "-a", "v1.1.0", "-m", "release 1.1.0"]);
  await runGitIn(work, ["branch", "feature"]);

  await writeFile(
    path.join(work, ".factory", "factory.yaml"),
    "format: 1\nname: sample-fab\npipeline:\n  - sample-workflow\n# 2.0.0\n",
  );
  await runGitIn(work, ["commit", "-qam", "third"]);
  const v200 = await runGitIn(work, ["rev-parse", "HEAD"]);
  await runGitIn(work, ["tag", "v2.0.0"]);

  await runGitIn(work, ["switch", "-q", "feature"]);
  await writeFile(path.join(work, ".factory", "AGENTS.md"), "# Agents on the feature branch\n");
  await runGitIn(work, ["commit", "-qam", "feature work"]);
  const feature = await runGitIn(work, ["rev-parse", "HEAD"]);
  await runGitIn(work, ["switch", "-q", "main"]);

  await runGitIn(root, ["clone", "-q", "--bare", work, repo]);

  return {
    root,
    work,
    repo,
    commits: { v100, v110, v200, feature, main: v200 },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export interface UntaggedGitFixture {
  root: string;
  repo: string;
  head: string;
  cleanup(): Promise<void>;
}

export async function createUntaggedGitFixture(): Promise<UntaggedGitFixture> {
  const root = await mkdtemp(path.join(tmpdir(), "metafab-git-untagged-"));
  const work = await initWorkRepository(root);
  const repo = path.join(root, "repo.git");

  await runGitIn(work, ["add", "-A"]);
  await runGitIn(work, ["commit", "-qm", "only commit"]);
  await runGitIn(work, ["tag", "release-one"]);
  const head = await runGitIn(work, ["rev-parse", "HEAD"]);
  await runGitIn(root, ["clone", "-q", "--bare", work, repo]);

  return {
    root,
    repo,
    head,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export async function installReferenceTransactionHook(
  fixture: GitFixture,
): Promise<{ env: NodeJS.ProcessEnv; marker: string }> {
  const hooks = path.join(fixture.root, "hooks");
  const marker = path.join(fixture.root, "hook-ran");
  await mkdir(hooks, { recursive: true });
  const hook = path.join(hooks, "reference-transaction");
  await writeFile(hook, `#!/bin/sh\necho ran >> "${marker}"\n`);
  await writeFile(path.join(hooks, "post-checkout"), `#!/bin/sh\necho ran >> "${marker}"\n`);
  await execFileAsync("chmod", ["+x", hook, path.join(hooks, "post-checkout")]);

  const globalConfig = path.join(fixture.root, "gitconfig");
  await writeFile(globalConfig, `[core]\n\thooksPath = ${hooks}\n`);

  return { env: { ...process.env, GIT_CONFIG_GLOBAL: globalConfig }, marker };
}
