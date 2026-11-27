import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { copyTree } from "../../../src/util/fs.js";
import { afterOf } from "../../../src/core/automations/index.js";
import type { Automation } from "../../../src/core/automations/index.js";
import { ExitCode } from "../../../src/errors.js";
import { isolateGitConfig } from "../hooks/helpers.js";
import { makeRepo, writeRepoFiles } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";
import { runCli } from "../../helpers/runCli.js";

const FIXTURE = fileURLToPath(new URL("../../fixtures/automations/prompt/", import.meta.url));

const FIRST = "Run the factory automation `intake` unattended. Nobody is watching this session.";
const AFTER =
  "When this run ends, start each automation that runs after it, as the run instructions say: `plan-intake`.";
/** The body section: the automation's name as a heading, then the body itself. */
const BODY = "# intake\nTriage the intake backlog with the `file-work` workflow's rules.";

const RUN_AMP =
  "# Run instructions\n\nIn Amp, ask with the `ask_user_choice` tool, and notify with `notify_user`.";
const RUN_OPENCODE =
  "# Run instructions\n\nIn OpenCode, ask in the chat, and notify with a message.";
const RUN_BOTH =
  "# Run instructions\n\n**In Amp:**\nIn Amp, ask with the `ask_user_choice` tool, and notify with `notify_user`.\n**In OpenCode:**\nIn OpenCode, ask in the chat, and notify with a message.";

const repos: TempRepo[] = [];
let isolation: Awaited<ReturnType<typeof isolateGitConfig>>;
let savedEnvironment: [string, string | undefined][] = [];

beforeEach(async () => {
  isolation = await isolateGitConfig();
  // No developer's FACTORY_ENV_* may decide a test's selection.
  savedEnvironment = Object.entries(process.env).filter(([key]) =>
    key.toUpperCase().startsWith("FACTORY_ENV_"),
  );
  for (const [key] of savedEnvironment) delete process.env[key];
});

afterEach(async () => {
  for (const [key, value] of savedEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnvironment = [];
  isolation.restore();
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

/** A copy of the prompt fixture, with any file overridden. */
async function promptRepo(overrides: Record<string, string> = {}): Promise<TempRepo> {
  const repo = await makeRepo();
  await copyTree(FIXTURE, repo.root);
  await writeRepoFiles(repo.root, overrides);
  repos.push(repo);
  return repo;
}

function prompt(repo: TempRepo, args: readonly string[]): ReturnType<typeof runCli> {
  return runCli(["automations", "prompt", "intake", ...args], { cwd: repo.root, tty: false });
}

function automation(name: string, enabled: boolean, after?: string): Automation {
  return {
    name,
    file: `.factory/automations/${name}/automation.md`,
    owner: "*",
    enabled,
    checkout: "worktree",
    triggers:
      after === undefined
        ? []
        : [{ kind: "after", names: [after], line: 1 }],
    body: "",
    bodyLine: 1,
    triggersLine: 1,
  };
}

describe("afterOf", () => {
  test("lists the enabled automations whose after names it, sorted", () => {
    const list = [
      automation("zulu", true, "intake"),
      automation("alpha", true, "intake"),
      automation("off", false, "intake"),
      automation("other", true, "plan-intake"),
    ];

    expect(afterOf("intake", list)).toEqual(["alpha", "zulu"]);
    expect(afterOf("plan-intake", list)).toEqual(["other"]);
    expect(afterOf("nobody", list)).toEqual([]);
  });
});

describe("metafab automations prompt", () => {
  test("prints the first line, the run instructions, the body and the after line", async () => {
    const repo = await promptRepo();

    const result = await prompt(repo, ["--env", "harness=amp"]);

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe([FIRST, RUN_AMP, BODY, AFTER].join("\n\n") + "\n");
  });

  test("renders only the OpenCode text of run.md for harness=opencode", async () => {
    const repo = await promptRepo();

    const result = await prompt(repo, ["--env", "harness=opencode"]);

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(result.stdout).toBe([FIRST, RUN_OPENCODE, BODY, AFTER].join("\n\n") + "\n");
  });

  test("labels both texts when the selection holds both values", async () => {
    const repo = await promptRepo();

    const result = await prompt(repo, ["--env", "harness=amp,opencode"]);

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(result.stdout).toBe([FIRST, RUN_BOTH, BODY, AFTER].join("\n\n") + "\n");
  });

  test("leaves the run instructions out when the factory has no run.md", async () => {
    const repo = await promptRepo();
    await rm(path.join(repo.root, ".factory/automations/run.md"));

    const result = await prompt(repo, ["--env", "harness=amp"]);

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(result.stdout).toBe([FIRST, BODY, AFTER].join("\n\n") + "\n");
  });

  test("leaves the last line out when no enabled automation runs after it", async () => {
    const repo = await promptRepo();
    await rm(path.join(repo.root, ".factory/automations/plan-intake"), {
      recursive: true,
      force: true,
    });

    const result = await prompt(repo, ["--env", "harness=amp"]);

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(result.stdout).toBe([FIRST, RUN_AMP, BODY].join("\n\n") + "\n");
  });

  test("does not list a disabled follower", async () => {
    const repo = await promptRepo({
      ".factory/automations/plan-intake/automation.md":
        '---\nowner: "*"\nenabled: false\ntriggers:\n  - after: [intake]\n---\n\n# plan-intake\n\nPlan the next cluster.\n',
    });

    const result = await prompt(repo, ["--env", "harness=amp"]);

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(result.stdout).toBe([FIRST, RUN_AMP, BODY].join("\n\n") + "\n");
  });

  test("puts the name above a body that has no heading of its own", async () => {
    const repo = await promptRepo({
      ".factory/automations/intake/automation.md":
        '---\ndescription: Triage the intake backlog\nowner: "*"\ntriggers:\n  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }\n---\n\nRead docs/intake and triage each note.\n',
    });

    const result = await prompt(repo, ["--env", "harness=amp"]);

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(result.stdout).toBe(
      [FIRST, RUN_AMP, "# intake\nRead docs/intake and triage each note.", AFTER].join("\n\n") + "\n",
    );
  });

  test("a selection that empties the body exits 1 with nothing on stdout", async () => {
    const repo = await promptRepo({
      ".factory/automations/intake/automation.md": [
        "---",
        'owner: "*"',
        "triggers:",
        '  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }',
        "---",
        "",
        "<!-- factory:switch env.harness -->",
        "<!-- factory:case amp -->",
        "   ",
        "<!-- factory:case opencode -->",
        "In OpenCode, triage the backlog.",
        "<!-- factory:endswitch -->",
        "",
      ].join("\n"),
    });

    const result = await prompt(repo, ["--env", "harness=amp"]);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("intake has nothing to do in this environment");
  });
});
