import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode } from "../../src/errors.js";
import { runGit } from "../../src/util/git.js";
import { isolateGitConfig } from "../core/hooks/helpers.js";
import { makeRepo, writeRepoFiles } from "../helpers/makeRepo.js";
import type { TempRepo } from "../helpers/makeRepo.js";
import { runCli } from "../helpers/runCli.js";
import type { RunCliResult } from "../helpers/runCli.js";

const ACCOUNT = "owner@example.com";
const FACTORY_YAML = "format: 2\nname: sync-demo\n";

function automationFile(cron: string): string {
  return [
    "---",
    'owner: "*"',
    "triggers:",
    `  - schedule: { cron: "${cron}", tz: Australia/Sydney }`,
    "---",
    "",
    "Triage the backlog.",
    "",
  ].join("\n");
}

interface Call {
  args: string[];
  environment: string | null;
  pairingCode: string | null;
}

interface State {
  automations: {
    id: string;
    title: string;
    prompt: string;
    rrule: string;
    timezone: string;
    agentId: string;
    enabled: boolean;
    runContext: { path: string };
    workspaceId: string;
    baseBranch?: string;
    launchSetup: boolean;
    reuseSession: boolean;
  }[];
  calls: Call[];
}

interface FakeOrca {
  bin: string;
  statePath: string;
  read(): Promise<State>;
  close(): Promise<void>;
}

const repos: TempRepo[] = [];
const fakes: FakeOrca[] = [];
const dirs: string[] = [];
let isolation: Awaited<ReturnType<typeof isolateGitConfig>>;
let savedEnvironment: [string, string | undefined][] = [];

beforeEach(async () => {
  isolation = await isolateGitConfig();
  savedEnvironment = ["PATH", "FAKE_ORCA_STATE", "ORCA_ENVIRONMENT", "ORCA_PAIRING_CODE"].map(
    (key) => [key, process.env[key]],
  );
});

afterEach(async () => {
  for (const [key, value] of savedEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnvironment = [];
  isolation.restore();
  await Promise.all(fakes.splice(0).map((fake) => fake.close()));
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
});

async function syncRepo(cron = "0 8 * * 1,4"): Promise<TempRepo> {
  const repo = await makeRepo(
    {
      ".factory/factory.yaml": FACTORY_YAML,
      ".factory/automations/intake/automation.md": automationFile(cron),
    },
    { git: true },
  );
  repos.push(repo);
  for (const args of [
    ["config", "user.email", ACCOUNT],
    ["config", "user.name", "Test"],
  ]) {
    const result = await runGit(args, { cwd: repo.root });
    expect(result.exitCode, result.stderr).toBe(0);
  }
  return repo;
}

async function installFakeOrca(): Promise<FakeOrca> {
  const dir = await mkdtemp(path.join(tmpdir(), "metafab-fake-orca-"));
  const bin = path.join(dir, "bin");
  await mkdir(bin);
  await copyFile(
    fileURLToPath(new URL("../helpers/fake-orca.mjs", import.meta.url)),
    path.join(bin, "orca"),
  );
  await chmod(path.join(bin, "orca"), 0o755);
  const statePath = path.join(dir, "state.json");
  await writeFile(statePath, JSON.stringify({ automations: [], calls: [] }));

  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH ?? ""}`;
  process.env.FAKE_ORCA_STATE = statePath;

  const fake: FakeOrca = {
    bin,
    statePath,
    async read() {
      return JSON.parse(await readFile(statePath, "utf8")) as State;
    },
    async close() {
      await rm(dir, { recursive: true, force: true });
    },
  };
  fakes.push(fake);
  return fake;
}

function run(repo: TempRepo, args: readonly string[]): Promise<RunCliResult> {
  return runCli(args, { cwd: repo.root, tty: false });
}

const MARKER = "Run the factory automation `intake` from the `sync-demo` factory.";

describe("metafab automations sync orca", () => {
  test.skipIf(process.platform === "win32")(
    "creates the registration, then a second sync changes nothing",
    async () => {
      const repo = await syncRepo();
      const fake = await installFakeOrca();

      const first = await run(repo, [
        "automations",
        "sync",
        "orca",
        "--agent",
        "opencode",
        "--branch",
        "main",
      ]);

      expect(first.code, first.stderr).toBe(ExitCode.Ok);
      expect(first.stderr).toBe("");
      expect(first.stdout).toBe("+ automation: intake\n");

      const created = await fake.read();
      expect(created.automations).toHaveLength(1);
      expect(created.automations[0]).toMatchObject({
        title: "automation: intake",
        rrule: "0 8 * * 1,4",
        timezone: "Australia/Sydney",
        agentId: "opencode",
        enabled: true,
        reuseSession: false,
        launchSetup: true,
        baseBranch: "origin/main",
        runContext: { path: await realpath(repo.root) },
        workspaceId: `worktree::${await realpath(repo.root)}`,
      });
      expect(created.automations[0]!.prompt.startsWith(MARKER)).toBe(true);
      expect(created.automations[0]!.prompt).toContain("--target orca");

      const callsAfterFirst = created.calls.length;
      const second = await run(repo, ["automations", "sync", "orca", "--branch", "main"]);

      expect(second.code, second.stderr).toBe(ExitCode.Ok);
      expect(second.stdout).toBe("Orca automations are up to date.\n");

      const afterSecond = await fake.read();
      expect(afterSecond.calls.length).toBe(callsAfterFirst + 1);
      expect(afterSecond.calls.at(-1)!.args.slice(0, 2)).toEqual(["automations", "list"]);
    },
  );

  test.skipIf(process.platform === "win32")(
    "writes nothing when a partial an automation imports has an error",
    async () => {
      const repo = await syncRepo();
      await writeRepoFiles(repo.root, {
        ".factory/partials/broken.md": "<!-- factory:when env.nope == amp -->\nAsk first.\n",
        ".factory/automations/intake/automation.md": [
          "---",
          'owner: "*"',
          "triggers:",
          '  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }',
          "---",
          "",
          "Triage the backlog.",
          "",
          "<!-- factory:import ../../partials/broken.md -->",
          "",
        ].join("\n"),
      });
      const fake = await installFakeOrca();

      const result = await run(repo, [
        "automations",
        "sync",
        "orca",
        "--agent",
        "opencode",
        "--branch",
        "main",
      ]);

      expect(result.code).toBe(ExitCode.Failed);
      expect(result.stderr).toContain(".factory/partials/broken.md:1");
      expect(result.stderr).toContain('Condition names unknown variable "nope"');
      const state = await fake.read();
      expect(state.automations).toEqual([]);
      expect(state.calls.filter((call) => call.args[1] !== "list")).toEqual([]);
    },
  );

  test.skipIf(process.platform === "win32")(
    "refuses a --branch Git rejects, before reading Orca",
    async () => {
      const repo = await syncRepo();
      const fake = await installFakeOrca();

      const result = await run(repo, [
        "automations",
        "sync",
        "orca",
        "--agent",
        "opencode",
        "--branch",
        "bad..branch",
      ]);

      expect(result.code).toBe(ExitCode.Failed);
      expect(result.stderr).toContain("bad..branch is not a branch name");
      expect((await fake.read()).calls).toEqual([]);
    },
  );

  test.skipIf(process.platform === "win32")(
    "prints an edited cron with --dry-run and writes nothing",
    async () => {
      const repo = await syncRepo();
      const fake = await installFakeOrca();
      const first = await run(repo, [
        "automations",
        "sync",
        "orca",
        "--agent",
        "opencode",
        "--branch",
        "main",
      ]);
      expect(first.code, first.stderr).toBe(ExitCode.Ok);

      await writeFile(
        path.join(repo.root, ".factory", "automations", "intake", "automation.md"),
        automationFile("0 9 * * 1,4"),
      );
      const callsBefore = (await fake.read()).calls.length;

      const dryRun = await run(repo, [
        "automations",
        "sync",
        "orca",
        "--branch",
        "main",
        "--dry-run",
      ]);

      expect(dryRun.code, dryRun.stderr).toBe(ExitCode.Ok);
      expect(dryRun.stdout).toBe("~ automation: intake (cron)\n");

      const after = await fake.read();
      expect(after.calls.length).toBe(callsBefore + 1);
      expect(after.calls.at(-1)!.args.slice(0, 2)).toEqual(["automations", "list"]);
      expect(after.automations[0]!.rrule).toBe("0 8 * * 1,4");
    },
  );

  test.skipIf(process.platform === "win32")("adds the result as data with --json", async () => {
    const repo = await syncRepo();
    await installFakeOrca();

    const result = await run(repo, [
      "automations",
      "sync",
      "orca",
      "--agent",
      "opencode",
      "--branch",
      "main",
      "--json",
    ]);
    const json = JSON.parse(result.stdout) as Record<string, unknown>;

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(json).toMatchObject({
      ok: true,
      command: "automations sync",
      exitCode: 0,
      created: ["intake"],
      updated: [],
      disabled: [],
      removed: [],
      unchanged: [],
      leftAlone: [],
    });
    expect(json).not.toHaveProperty("summary");
  });

  test.skipIf(process.platform === "win32")("needs an agent when none is installed", async () => {
    const repo = await syncRepo();
    await installFakeOrca();

    const result = await run(repo, ["automations", "sync", "orca", "--branch", "main"]);

    expect(result.code).toBe(ExitCode.NeedsInput);
    expect(result.stderr).toContain("--agent");
  });

  test.skipIf(process.platform === "win32")("exits 1 when orca is not installed", async () => {
    const repo = await syncRepo();
    const bin = await mkdtemp(path.join(tmpdir(), "metafab-no-orca-"));
    dirs.push(bin);
    const which = await promisify(execFile)("which", ["git"]);
    await symlink(which.stdout.trim(), path.join(bin, "git"));
    process.env.PATH = bin;

    const result = await run(repo, [
      "automations",
      "sync",
      "orca",
      "--agent",
      "opencode",
      "--branch",
      "main",
    ]);

    expect(result.code).toBe(ExitCode.Failed);
    expect(result.stderr).toContain("The orca command was not found");
    expect(result.stderr).toContain("Install Orca");
  });
});

describe("metafab automations plan orca", () => {
  test.skipIf(process.platform === "win32")(
    "refuses a --branch Git rejects, before reading Orca",
    async () => {
      const repo = await syncRepo();
      const fake = await installFakeOrca();

      const result = await run(repo, [
        "automations",
        "plan",
        "orca",
        "--agent",
        "opencode",
        "--branch",
        "bad..branch",
      ]);

      expect(result.code).toBe(ExitCode.Failed);
      expect(result.stderr).toContain("bad..branch is not a branch name");
      expect((await fake.read()).calls).toEqual([]);
    },
  );

  test.skipIf(process.platform === "win32")("prints the desired set and the changes", async () => {
    const repo = await syncRepo();
    await installFakeOrca();

    const result = await run(repo, [
      "automations",
      "plan",
      "orca",
      "--agent",
      "opencode",
      "--branch",
      "main",
      "--json",
    ]);
    const json = JSON.parse(result.stdout) as {
      account: string;
      entries: { name: string; title: string; cron: string; tz: string; checkout: string }[];
      created: string[];
      updated: string[];
      disabled: string[];
      removed: string[];
      unchanged: string[];
      leftAlone: string[];
    };

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(json.account).toBe(ACCOUNT);
    expect(json.entries).toHaveLength(1);
    expect(json.entries[0]).toMatchObject({
      name: "intake",
      title: "automation: intake",
      cron: "0 8 * * 1,4",
      tz: "Australia/Sydney",
      checkout: "worktree",
    });
    expect(json.created).toEqual(["intake"]);
    expect(json.updated).toEqual([]);
    expect(json.removed).toEqual([]);
    expect(json.leftAlone).toEqual([]);
  });

  test.skipIf(process.platform === "win32")("prints a readable plan", async () => {
    const repo = await syncRepo();
    await installFakeOrca();

    const result = await run(repo, [
      "automations",
      "plan",
      "orca",
      "--agent",
      "opencode",
      "--branch",
      "main",
    ]);

    expect(result.code, result.stderr).toBe(ExitCode.Ok);
    expect(result.stdout).toBe(
      [
        "automation: intake",
        "  title:    automation: intake",
        "  trigger:  0 8 * * 1,4 Australia/Sydney",
        "  checkout: worktree",
        "",
        "+ automation: intake",
        "",
      ].join("\n"),
    );
  });
});
