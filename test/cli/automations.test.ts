import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { copyTree } from "../../src/util/fs.js";
import { ExitCode } from "../../src/errors.js";
import { isolateGitConfig } from "../core/hooks/helpers.js";
import { makeRepo, writeRepoFiles } from "../helpers/makeRepo.js";
import type { TempRepo } from "../helpers/makeRepo.js";
import { runCli } from "../helpers/runCli.js";
import type { RunCliResult } from "../helpers/runCli.js";

const FIXTURE = fileURLToPath(new URL("../fixtures/automations/prompt/", import.meta.url));

const FIRST = "Run the factory automation `intake` unattended. Nobody is watching this session.";
const MARKER = "Run the factory automation `intake` from the `prompt-demo` factory.";

const GROUP_HELP = [
  "Usage: metafab automations <subcommand>",
  "",
  "Subcommands:",
  "  metafab automations list [--json]                                                     Show the automations in the factory",
  "  metafab automations prompt <name> [--target <target>] [--env <variable>=<values>]...  Print one run's prompt for an automation",
  "  metafab automations stub <name> --target <orca|amp> [--branch <trunk>]                Print the text a target registers for an automation",
  "  metafab automations plan <target> [--agent <id>] [--branch <trunk>]                   Show the registrations a target's sync would create, update or remove",
  "  metafab automations sync orca [--agent <id>] [--branch <trunk>] [--dry-run]           Make Orca's automations match the factory",
  "",
  "Run metafab automations <subcommand> --help for its options.",
  "",
].join("\n");

const LIST_HELP = [
  "Usage: metafab automations list [--json]",
  "",
  "Show the automations in the factory",
  "",
  "Options:",
  "  --json      Write one JSON object to stdout",
  "  -h, --help  Show this help",
  "",
].join("\n");

const PROMPT_HELP = [
  "Usage: metafab automations prompt <name> [--target <target>] [--env <variable>=<values>]...",
  "",
  "Print one run's prompt for an automation",
  "",
  "Arguments:",
  "  <name>                     An automation in .factory/automations/",
  "",
  "Options:",
  "  --target <target>          Also check the account the target runs as: orca or amp",
  "  --env <variable>=<values>  Render the prompt for this environment selection",
  "  --json                     Write one JSON object to stdout",
  "  -h, --help                 Show this help",
  "",
].join("\n");

const STUB_HELP = [
  "Usage: metafab automations stub <name> --target <orca|amp> [--branch <trunk>]",
  "",
  "Print the text a target registers for an automation",
  "",
  "Arguments:",
  "  <name>             An automation in .factory/automations/",
  "",
  "Options:",
  "  --target <target>  The harness to register the automation in: orca or amp",
  "  --branch <trunk>   The trunk a run switches to; the remote's default branch by default",
  "  --json             Write one JSON object to stdout",
  "  -h, --help         Show this help",
  "",
].join("\n");

const repos: TempRepo[] = [];
let isolation: Awaited<ReturnType<typeof isolateGitConfig>>;
let savedEnvironment: [string, string | undefined][] = [];

beforeEach(async () => {
  isolation = await isolateGitConfig();
  savedEnvironment = Object.entries(process.env).filter(
    ([key]) => key.toUpperCase().startsWith("FACTORY_ENV_") || key === "AMP_USER_EMAIL",
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

/** A copy of the prompt fixture: `intake` and the `plan-intake` follower. */
async function promptRepo(overrides: Record<string, string> = {}): Promise<TempRepo> {
  const repo = await makeRepo();
  await copyTree(FIXTURE, repo.root);
  await writeRepoFiles(repo.root, overrides);
  repos.push(repo);
  return repo;
}

function run(repo: TempRepo, args: readonly string[]): Promise<RunCliResult> {
  return runCli(args, { cwd: repo.root, tty: false });
}

function personal(owner: string): Record<string, string> {
  return {
    ".factory/automations/intake/automation.md": [
      "---",
      `owner: "${owner}"`,
      "triggers:",
      '  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }',
      "---",
      "",
      "Triage the backlog.",
      "",
    ].join("\n"),
  };
}

describe("metafab automations list", () => {
  test("prints one block per automation in name order", async () => {
    const repo = await promptRepo();

    const result = await run(repo, ["automations", "list"]);

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      [
        "intake  (enabled)",
        "  description: Triage the intake backlog",
        "  trigger:  schedule 0 8 * * 1,4 Australia/Sydney",
        "  checkout: worktree",
        "  owner:    *",
        "  after:    plan-intake",
        "",
        "plan-intake  (enabled)",
        "  trigger:  after intake",
        "  checkout: main",
        "  owner:    *",
        "  after:    none",
        "",
      ].join("\n"),
    );
  });

  test("adds the automations as data with --json", async () => {
    const repo = await promptRepo();

    const result = await run(repo, ["automations", "list", "--json"]);
    const json = JSON.parse(result.stdout) as {
      automations: unknown[];
      problems: unknown[];
    };

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(json.problems).toEqual([]);
    expect(json.automations).toEqual([
      {
        name: "intake",
        file: ".factory/automations/intake/automation.md",
        owner: "*",
        description: "Triage the intake backlog",
        enabled: true,
        checkout: "worktree",
        triggers: [
          { kind: "schedule", cron: "0 8 * * 1,4", tz: "Australia/Sydney", line: 5 },
        ],
        after: ["plan-intake"],
      },
      {
        name: "plan-intake",
        file: ".factory/automations/plan-intake/automation.md",
        owner: "*",
        enabled: true,
        checkout: "main",
        triggers: [{ kind: "after", names: ["intake"], line: 5 }],
        after: [],
      },
    ]);
  });

  test("says so when there are none", async () => {
    const repo = await makeRepo({ ".factory/factory.yaml": "format: 2\nname: empty\n" });
    repos.push(repo);

    const result = await run(repo, ["automations", "list"]);

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(result.stdout).toBe("No automations.\n");
  });

  test("a format 1 factory exits 1 with the format 2 fix", async () => {
    const repo = await makeRepo({ ".factory/factory.yaml": "format: 1\nname: one\n" });
    repos.push(repo);

    const result = await run(repo, ["automations", "list"]);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("Set format: 2 in .factory/factory.yaml");
  });

  test("an automation with an error exits 1 with the problems", async () => {
    const repo = await promptRepo({
      ".factory/automations/broken/automation.md":
        '---\nowner: "*"\ntriggers:\n  - schedule: { cron: "99 8 * * 1", tz: Australia/Sydney }\n---\n\n# broken\n\nPlan.\n',
    });

    const result = await run(repo, ["automations", "list"]);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("99 is outside 0-59");
  });
});

describe("metafab automations prompt", () => {
  test("prints the prompt alone", async () => {
    const repo = await promptRepo();

    const result = await run(repo, ["automations", "prompt", "intake", "--env", "harness=amp"]);

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(result.stderr).toBe("");
    expect(result.stdout.startsWith(FIRST)).toBe(true);
    expect(result.stdout).toContain("In Amp, ask with the `ask_user_choice` tool");
    expect(result.stdout).not.toContain("In OpenCode, ask");
  });

  test("shows the automation's heading once when the body starts with it", async () => {
    const repo = await promptRepo({
      ".factory/automations/intake/automation.md":
        '---\nowner: "*"\ntriggers:\n  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }\n---\n\n# intake\n\nTriage the backlog.\n',
    });

    const result = await run(repo, ["automations", "prompt", "intake", "--env", "harness=amp"]);

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(result.stdout.match(/^# intake$/gm)).toHaveLength(1);
  });

  test("adds the prompt as data with --json, and not the output flag", async () => {
    const repo = await promptRepo();

    const result = await run(repo, [
      "automations",
      "prompt",
      "intake",
      "--env",
      "harness=amp",
      "--json",
    ]);
    const json = JSON.parse(result.stdout) as { prompt?: string; textOnly?: boolean };

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(json.prompt?.startsWith(FIRST)).toBe(true);
    expect(json).not.toHaveProperty("textOnly");
  });

  test("a missing automation exits 1 with nothing on stdout", async () => {
    const repo = await promptRepo();

    const result = await run(repo, ["automations", "prompt", "nope"]);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("No automation named nope");
  });

  test("a disabled automation exits 1 with nothing on stdout", async () => {
    const repo = await promptRepo({
      ".factory/automations/intake/automation.md":
        '---\nowner: "*"\nenabled: false\ntriggers:\n  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }\n---\n\n# intake\n\nTriage.\n',
    });

    const result = await run(repo, ["automations", "prompt", "intake"]);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("intake is turned off");
  });

  test("another person's automation exits 1 when --target names an account", async () => {
    const repo = await promptRepo(personal("person@example.com"));
    process.env.AMP_USER_EMAIL = "other@example.com";

    const result = await run(repo, ["automations", "prompt", "intake", "--target", "amp"]);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "intake belongs to person@example.com, and this run acts as other@example.com",
    );
  });

  test("the owner matches the account without letter case", async () => {
    const repo = await promptRepo(personal("Person@Example.com"));
    process.env.AMP_USER_EMAIL = "person@example.com";

    const result = await run(repo, ["automations", "prompt", "intake", "--target", "amp"]);

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(result.stdout.startsWith(FIRST)).toBe(true);
  });

  test("an unknown account exits 1 and names the missing setting", async () => {
    const repo = await promptRepo(personal("person@example.com"));

    const result = await run(repo, ["automations", "prompt", "intake", "--target", "amp"]);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("AMP_USER_EMAIL is not set");
  });

  test("an unknown target exits 1 and lists the targets", async () => {
    const repo = await promptRepo();

    const result = await run(repo, ["automations", "prompt", "intake", "--target", "nope"]);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain('Unknown target "nope"');
    expect(result.stderr).toContain("Use one of: orca, amp");
  });

  test("a format 1 factory exits 1 with the format 2 fix", async () => {
    const repo = await makeRepo({ ".factory/factory.yaml": "format: 1\nname: one\n" });
    repos.push(repo);

    const result = await run(repo, ["automations", "prompt", "intake"]);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("Set format: 2 in .factory/factory.yaml");
  });
});

describe("metafab automations stub", () => {
  test("prints the stub alone", async () => {
    const repo = await promptRepo();

    const result = await run(repo, [
      "automations",
      "stub",
      "intake",
      "--target",
      "orca",
      "--branch",
      "main",
    ]);

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(result.stderr).toBe("");
    expect(result.stdout.startsWith(`${MARKER}\n\n1. Run `)).toBe(true);
    expect(result.stdout).toContain("git switch --detach origin/'main'");
    expect(result.stdout).toContain("automations prompt intake --target orca");
    expect(result.stdout.endsWith("those are this run's instructions.\n")).toBe(true);
  });

  test("adds the stub as data with --json", async () => {
    const repo = await promptRepo();

    const result = await run(repo, [
      "automations",
      "stub",
      "intake",
      "--target",
      "amp",
      "--branch",
      "main",
      "--json",
    ]);
    const json = JSON.parse(result.stdout) as { prompt?: string };

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(json.prompt?.startsWith(MARKER)).toBe(true);
  });

  test("without --target and without a terminal it needs input", async () => {
    const repo = await promptRepo();

    const result = await run(repo, ["automations", "stub", "intake", "--json"]);
    const json = JSON.parse(result.stdout) as {
      exitCode: number;
      required: { name: string; flag?: string }[];
    };

    expect(result.code).toBe(ExitCode.NeedsInput);
    expect(json.required).toEqual([
      expect.objectContaining({ name: "target", flag: "--target" }),
    ]);
  });

  test("an unknown target exits 1 and lists the targets", async () => {
    const repo = await promptRepo();

    const result = await run(repo, ["automations", "stub", "intake", "--target", "nope"]);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain('Unknown target "nope"');
    expect(result.stderr).toContain("Use one of: orca, amp");
  });

  test("a missing automation exits 1", async () => {
    const repo = await promptRepo();

    const result = await run(repo, ["automations", "stub", "nope", "--target", "orca"]);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("No automation named nope");
  });

  test("a --branch that Git refuses exits 1", async () => {
    const repo = await promptRepo();

    const result = await run(repo, [
      "automations",
      "stub",
      "intake",
      "--target",
      "orca",
      "--branch",
      "not a branch",
    ]);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("not a branch is not a branch name");
  });

  test("no trunk and no --branch exits 1 with the fix", async () => {
    const repo = await promptRepo();

    const result = await run(repo, ["automations", "stub", "intake", "--target", "orca"]);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("Pass --branch <trunk>");
  });

  test("a format 1 factory exits 1 with the format 2 fix", async () => {
    const repo = await makeRepo({ ".factory/factory.yaml": "format: 1\nname: one\n" });
    repos.push(repo);

    const result = await run(repo, ["automations", "stub", "intake", "--target", "orca"]);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("Set format: 2 in .factory/factory.yaml");
  });
});

describe("metafab automations help", () => {
  test("the group lists its subcommands", async () => {
    const repo = await promptRepo();

    const result = await run(repo, ["automations", "--help"]);

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(GROUP_HELP);
  });

  test("each command prints its own help", async () => {
    const repo = await promptRepo();

    for (const [args, expected] of [
      [["automations", "list", "--help"], LIST_HELP],
      [["automations", "prompt", "--help"], PROMPT_HELP],
      [["automations", "stub", "--help"], STUB_HELP],
    ] as const) {
      const result = await run(repo, args);
      expect(result.code, args.join(" ")).toBe(ExitCode.Ok);
      expect(result.stderr, args.join(" ")).toBe("");
      expect(result.stdout, args.join(" ")).toBe(expected);
    }
  });

  test("automations with no subcommand exits 1 with a fix", async () => {
    const repo = await promptRepo();

    const result = await run(repo, ["automations"]);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("metafab automations --help");
  });
});
