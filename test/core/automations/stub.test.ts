import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { defaultTrunk, renderStub } from "../../../src/core/automations/index.js";
import type { Automation, Target } from "../../../src/core/automations/index.js";
import { runGit } from "../../../src/util/git.js";
import { buildCli } from "../../cli/build.js";
import type { BuiltCli } from "../../cli/build.js";

const execFileAsync = promisify(execFile);

const CLEAN_STEP =
  "Run `git status --porcelain --untracked-files=all`. If it prints anything or fails, report that this run needs a clean checkout, and stop.";
const FETCH_STEP = "Run `git fetch origin && git switch --detach origin/'main'`.";

/** The whole `<metafab>` of step 3, written out: a change here is a change to the stub. */
function lookup(target: Target): string {
  const args = `automations prompt intake --target ${target}`;
  return [
    `(cd "$(git rev-parse --show-toplevel)"/'.' && if [ -x node_modules/.bin/metafab ]; then node_modules/.bin/metafab ${args}`,
    `elif main=$(git -c core.quotePath=false worktree list --porcelain 2>/dev/null | sed -n '1{s/^worktree //;h;d;};/^bare$/q;g;p;q') && [ -n "$main" ] && [ -x "$main"/'.'/node_modules/.bin/metafab ]; then "$main"/'.'/node_modules/.bin/metafab ${args}`,
    `elif command -v metafab >/dev/null 2>&1; then metafab ${args}`,
    `else npx --yes @seasb/metafab@2.0.0 ${args}; fi)`,
  ].join("; ");
}

const PROMPT_STEP = (target: Target): string =>
  `Run \`${lookup(target)}\`. If it fails, report what it printed, and stop. Otherwise follow what it printed: those are this run's instructions.`;

function expected(steps: readonly string[]): string {
  return (
    [
      "Run the factory automation `intake` from the `dragonfly` factory.",
      "",
      ...steps.map((step, index) => `${index + 1}. ${step}`),
    ].join("\n") + "\n"
  );
}

function automation(checkout: "worktree" | "main"): Automation {
  return {
    name: "intake",
    file: ".factory/automations/intake/automation.md",
    owner: "*",
    enabled: true,
    checkout,
    triggers: [],
    body: "",
    bodyLine: 1,
    triggersLine: 1,
  };
}

function stub(
  checkout: "worktree" | "main",
  target: Target,
  overrides: { trunk?: string; factoryRelDir?: string } = {},
): string {
  return renderStub({
    factoryName: "dragonfly",
    automation: automation(checkout),
    target,
    trunk: overrides.trunk ?? "main",
    factoryRelDir: overrides.factoryRelDir ?? ".",
    cliVersion: "2.0.0",
  });
}

describe("renderStub", () => {
  test("prints the exact stub for checkout: worktree with Orca", () => {
    expect(stub("worktree", "orca")).toBe(
      expected([CLEAN_STEP, FETCH_STEP, PROMPT_STEP("orca")]),
    );
  });

  test("prints the exact stub for checkout: worktree with Amp", () => {
    expect(stub("worktree", "amp")).toBe(expected([CLEAN_STEP, FETCH_STEP, PROMPT_STEP("amp")]));
  });

  test("leaves the guard steps out for checkout: main with Orca", () => {
    expect(stub("main", "orca")).toBe(expected([PROMPT_STEP("orca")]));
  });

  test("keeps the guard steps for checkout: main with Amp, because an orb is its own clone", () => {
    expect(stub("main", "amp")).toBe(expected([CLEAN_STEP, FETCH_STEP, PROMPT_STEP("amp")]));
  });

  test("quotes the factory directory and the trunk for sh", () => {
    const text = stub("worktree", "orca", {
      trunk: "feat/a'b$c",
      factoryRelDir: 'my "fab" $x',
    });

    expect(text).toContain(`(cd "$(git rev-parse --show-toplevel)"/'my "fab" $x' && `);
    expect(text).toContain(`[ -x "$main"/'my "fab" $x'/node_modules/.bin/metafab ]`);
    expect(text).toContain(`git switch --detach origin/'feat/a'\\''b$c'`);
  });
});

const containers: string[] = [];

afterEach(async () => {
  await Promise.all(
    containers.splice(0).map((container) => rm(container, { recursive: true, force: true })),
  );
});

async function git(cwd: string, args: readonly string[]): Promise<void> {
  const result = await runGit([...args], { cwd });
  expect(result.exitCode, result.stderr).toBe(0);
}

interface Clone {
  container: string;
  clone: string;
  source: string;
}

/** A bare origin and a clone of it, with `main` committed and pushed. */
async function cloneWithOrigin(files: Record<string, string>): Promise<Clone> {
  const container = await mkdtemp(path.join(tmpdir(), "metafab-stub-"));
  containers.push(container);
  const origin = path.join(container, "origin.git");
  const source = path.join(container, "source");
  const clone = path.join(container, "clone");

  await mkdir(source, { recursive: true });
  await git(container, ["init", "--quiet", "--bare", origin]);
  // The clone sets `origin/HEAD` from the bare repository's HEAD, so point it
  // at the branch this helper pushes.
  await git(origin, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  await git(source, ["init", "--quiet"]);
  await git(source, ["config", "user.name", "Metafab Test"]);
  await git(source, ["config", "user.email", "metafab@example.com"]);
  await git(source, ["config", "commit.gpgsign", "false"]);
  await git(source, ["branch", "-M", "main"]);

  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(source, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  await git(source, ["add", "-A"]);
  await git(source, ["commit", "--quiet", "-m", "initial"]);
  await git(source, ["remote", "add", "origin", origin]);
  await git(source, ["push", "--quiet", "origin", "main"]);

  await git(container, ["clone", "--quiet", origin, clone]);
  return { container, clone, source };
}

/** The commands the stub's numbered steps hold. */
function stepCommands(text: string): string[] {
  return text.split("\n").flatMap((line) => {
    const match = /^\d+\. Run `([^`]+)`/.exec(line);
    return match === null ? [] : [match[1]!];
  });
}

async function sh(command: string, cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync("sh", ["-c", command], { cwd, encoding: "utf8" });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

const FACTORY = "format: 2\nname: stub-demo\n";
const BODY = (text: string): string =>
  `---\nowner: "*"\ntriggers:\n  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }\n---\n\n# intake\n\n${text}\n`;

describe.skipIf(process.platform === "win32")("the stub's commands", () => {
  let built: BuiltCli;

  beforeAll(async () => {
    built = await buildCli();
  }, 180_000);

  afterAll(async () => {
    await built?.cleanup();
  });

  test(
    "run in a clone reach the factory directory and print the prompt",
    { timeout: 60_000 },
    async () => {
      const directory = 'my "fab" $x';
      const shim = `#!/bin/sh\nexec "${process.execPath}" "${built.cliPath}" "$@"\n`;
      const { source, clone } = await cloneWithOrigin({
        [`${directory}/.factory/factory.yaml`]: FACTORY,
        [`${directory}/.factory/automations/intake/automation.md`]: BODY("From the trunk."),
        [`${directory}/node_modules/.bin/metafab`]: shim,
      });
      await chmod(path.join(source, directory, "node_modules/.bin/metafab"), 0o755);
      await git(source, ["add", "-A"]);
      await git(source, ["commit", "--quiet", "-m", "make the shim executable"]);

      // A second branch with different body text proves the detach reached it.
      await git(source, ["switch", "-c", "feat/a'b$c"]);
      await writeFile(
        path.join(source, directory, ".factory/automations/intake/automation.md"),
        BODY("From the branch."),
        "utf8",
      );
      await git(source, ["add", "-A"]);
      await git(source, ["commit", "--quiet", "-m", "branch text"]);
      await git(source, ["push", "--quiet", "origin", "feat/a'b$c"]);
      await git(source, ["switch", "main"]);

      const text = renderStub({
        factoryName: "stub-demo",
        automation: automation("worktree"),
        target: "orca",
        trunk: "feat/a'b$c",
        factoryRelDir: directory,
        cliVersion: "2.0.0",
      });

      const commands = stepCommands(text);
      expect(commands).toHaveLength(3);

      const clean = await sh(commands[0]!, clone);
      expect(clean.code, clean.stderr).toBe(0);
      expect(clean.stdout).toBe("");

      const switched = await sh(commands[1]!, clone);
      expect(switched.code, switched.stderr).toBe(0);

      const prompt = await sh(commands[2]!, clone);
      expect(prompt.code, prompt.stderr).toBe(0);
      expect(prompt.stdout.startsWith("Run the factory automation `intake` unattended.")).toBe(true);
      expect(prompt.stdout).toContain("From the branch.");
      expect(prompt.stdout).not.toContain("From the trunk.");
    },
  );

  test(
    "step 3 exits non-zero when the automation is disabled",
    { timeout: 60_000 },
    async () => {
      const directory = "repo";
      const shim = `#!/bin/sh\nexec "${process.execPath}" "${built.cliPath}" "$@"\n`;
      const { source, clone } = await cloneWithOrigin({
        [`${directory}/.factory/factory.yaml`]: FACTORY,
        [`${directory}/.factory/automations/intake/automation.md`]: BODY("Do the work.").replace(
          'owner: "*"',
          'owner: "*"\nenabled: false',
        ),
        [`${directory}/node_modules/.bin/metafab`]: shim,
      });
      await chmod(path.join(source, directory, "node_modules/.bin/metafab"), 0o755);
      await git(source, ["add", "-A"]);
      await git(source, ["commit", "--quiet", "-m", "make the shim executable"]);
      await git(source, ["push", "--quiet", "origin", "main"]);
      await git(clone, ["pull", "--quiet", "--ff-only"]);

      const text = renderStub({
        factoryName: "stub-demo",
        automation: automation("main"),
        target: "orca",
        trunk: "main",
        factoryRelDir: directory,
        cliVersion: "2.0.0",
      });

      const commands = stepCommands(text);
      expect(commands).toHaveLength(1);

      const result = await sh(commands[0]!, clone);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("intake is turned off");
    },
  );
});

describe("defaultTrunk", () => {
  test("names the remote's default branch without origin/", async () => {
    const { clone } = await cloneWithOrigin({ "README.md": "hello\n" });

    expect(await defaultTrunk(clone)).toBe("main");
  });

  test("is undefined when the remote has no HEAD", async () => {
    const { clone } = await cloneWithOrigin({ "README.md": "hello\n" });
    await git(clone, ["symbolic-ref", "--delete", "refs/remotes/origin/HEAD"]);

    expect(await defaultTrunk(clone)).toBeUndefined();
  });

  test("is undefined outside a repository", async () => {
    const container = await mkdtemp(path.join(tmpdir(), "metafab-stub-plain-"));
    containers.push(container);

    expect(await defaultTrunk(container)).toBeUndefined();
  });
});
