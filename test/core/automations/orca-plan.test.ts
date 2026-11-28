import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import {
  OrcaMissingError,
  applyOrcaSync,
  changeLine,
  createOrcaRunner,
  desiredSet,
  mainCheckout,
  planOrcaSync,
  prepareOrcaSync,
} from "../../../src/core/automations/index.js";
import type { OrcaAutomation, OrcaChange, OrcaRunner } from "../../../src/core/automations/index.js";
import { stubMarker } from "../../../src/core/automations/stub.js";
import { loadFactory } from "../../../src/core/factory/index.js";
import type { Factory } from "../../../src/core/factory/types.js";
import { MetafabError } from "../../../src/errors.js";
import { NeedsInput } from "../../../src/input.js";
import { runGit } from "../../../src/util/git.js";
import { makeRepo, writeRepoFiles } from "../../helpers/makeRepo.js";
import type { TempRepo } from "../../helpers/makeRepo.js";

const ACCOUNT = "owner@example.com";
const FACTORY = "dragonfly";
const AUTOMATION = `---
owner: "*"
triggers:
  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }
---

Triage the backlog.
`;

const repos: TempRepo[] = [];
const containers: string[] = [];
const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.cleanup()));
  await Promise.all(containers.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

interface Definition {
  owner?: string;
  enabled?: boolean;
  checkout?: "worktree" | "main";
  cron?: string;
  tz?: string;
}

function automationFile(definition: Definition): string {
  const lines = ["---", `owner: "${definition.owner ?? "*"}"`];
  if (definition.enabled === false) lines.push("enabled: false");
  if (definition.checkout !== undefined) lines.push(`checkout: ${definition.checkout}`);
  lines.push(
    "triggers:",
    `  - schedule: { cron: "${definition.cron ?? "0 8 * * 1,4"}", tz: ${definition.tz ?? "Australia/Sydney"} }`,
    "---",
    "",
    "Triage the backlog.",
    "",
  );
  return lines.join("\n");
}

async function factoryWith(
  definitions: Record<string, Definition>,
  options: { git?: boolean } = {},
): Promise<{ repo: TempRepo; factory: Factory }> {
  const files: Record<string, string> = {
    ".factory/factory.yaml": `format: 2\nname: ${FACTORY}\n`,
  };
  for (const [name, definition] of Object.entries(definitions)) {
    files[`.factory/automations/${name}/automation.md`] = automationFile(definition);
  }
  const repo = await makeRepo(files, { git: options.git ?? true });
  repos.push(repo);
  return { repo, factory: await loadFactory(repo.root) };
}

function installedEntry(
  name: string,
  repoRoot: string,
  overrides: Partial<OrcaAutomation> = {},
): OrcaAutomation {
  return {
    id: `id-${name}`,
    title: `automation: ${name}`,
    prompt: `${stubMarker(name, FACTORY)}\n`,
    rrule: "0 8 * * 1,4",
    timezone: "Australia/Sydney",
    agentId: "opencode",
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    runContext: { path: repoRoot },
    workspaceId: `worktree::${repoRoot}`,
    baseBranch: "origin/main",
    launchSetup: true,
    reuseSession: false,
    ...overrides,
  };
}

async function plan(
  repo: TempRepo,
  factory: Factory,
  installed: OrcaAutomation[],
  agent: string | null = "opencode",
) {
  const desired = await desiredSet(factory, "orca", ACCOUNT, "main");
  return planOrcaSync({
    desired,
    installed,
    repoRoot: repo.root,
    factory,
    account: ACCOUNT,
    trunk: "main",
    agent: agent ?? undefined,
  });
}

function listRunner(automations: OrcaAutomation[]): OrcaRunner {
  return async () => ({ exitCode: 0, stdout: JSON.stringify({ automations }), stderr: "" });
}

async function git(cwd: string, args: string[]): Promise<void> {
  const result = await runGit(args, { cwd });
  expect(result.exitCode, result.stderr).toBe(0);
}

describe("planOrcaSync", () => {
  test("creates a worktree automation with the stub, cron, zone, agent and fresh session", async () => {
    const { repo, factory } = await factoryWith({ intake: {} });
    const desired = await desiredSet(factory, "orca", ACCOUNT, "main");

    const planned = await plan(repo, factory, []);

    expect(planned.changes).toHaveLength(1);
    expect(planned.changes[0]).toEqual({
      kind: "create",
      name: "intake",
      fields: [],
      args: [
        "automations",
        "create",
        "--name",
        "automation: intake",
        "--trigger",
        "0 8 * * 1,4",
        "--timezone",
        "Australia/Sydney",
        "--prompt",
        desired[0]!.stub,
        "--provider",
        "opencode",
        "--enabled",
        "--fresh-session",
        "--repo",
        `path:${repo.root}`,
        "--base-branch",
        "origin/main",
        "--setup",
        "run",
      ],
    });
  });

  test("creates a main automation in the main checkout", async () => {
    const { repo, factory } = await factoryWith({ intake: { checkout: "main" } });

    const planned = await plan(repo, factory, []);

    const args = planned.changes[0]!.args;
    expect(args).toContain("--workspace");
    expect(args[args.indexOf("--workspace") + 1]).toBe(`path:${repo.root}`);
    expect(args).not.toContain("--repo");
    expect(args).not.toContain("--base-branch");
    expect(args).not.toContain("--setup");
  });

  test("changes nothing when the registration already matches", async () => {
    const { repo, factory } = await factoryWith({ intake: {} });
    const desired = await desiredSet(factory, "orca", ACCOUNT, "main");

    const planned = await plan(repo, factory, [
      installedEntry("intake", repo.root, { prompt: desired[0]!.stub }),
    ]);

    expect(planned.changes).toEqual([]);
    expect(planned.unchanged).toEqual(["intake"]);
  });

  test("repairs a skipped setup and a reused session", async () => {
    const { repo, factory } = await factoryWith({ intake: {} });
    const desired = await desiredSet(factory, "orca", ACCOUNT, "main");

    const planned = await plan(repo, factory, [
      installedEntry("intake", repo.root, {
        prompt: desired[0]!.stub,
        launchSetup: false,
        reuseSession: true,
      }),
    ]);

    expect(planned.changes).toEqual([
      {
        kind: "update",
        name: "intake",
        fields: ["setup", "session"],
        args: ["automations", "edit", "id-intake", "--setup", "run", "--fresh-session"],
      },
    ]);
  });

  test("edits with only the flags that differ", async () => {
    const { repo, factory } = await factoryWith({ intake: {} });
    const desired = await desiredSet(factory, "orca", ACCOUNT, "main");

    const planned = await plan(repo, factory, [
      installedEntry("intake", repo.root, {
        prompt: `${desired[0]!.stub}\nAn old line.`,
        rrule: "0 9 * * 1,4",
      }),
    ]);

    expect(planned.changes).toEqual([
      {
        kind: "update",
        name: "intake",
        fields: ["prompt", "cron"],
        args: [
          "automations",
          "edit",
          "id-intake",
          "--prompt",
          desired[0]!.stub,
          "--trigger",
          "0 8 * * 1,4",
        ],
      },
    ]);
  });

  test("replaces a worktree automation moved to main", async () => {
    const { repo, factory } = await factoryWith({ intake: { checkout: "main" } });
    const desired = await desiredSet(factory, "orca", ACCOUNT, "main");

    const planned = await plan(repo, factory, [
      installedEntry("intake", repo.root, { prompt: desired[0]!.stub }),
    ]);

    expect(planned.changes.map((change) => change.kind)).toEqual(["remove", "create"]);
    expect(planned.changes[0]!.args).toEqual(["automations", "remove", "id-intake"]);
    expect(planned.changes[1]!.args).toContain("--workspace");
  });

  test("disables a registration whose automation is turned off, keeping its history", async () => {
    const { repo, factory } = await factoryWith({ intake: { enabled: false } });

    const planned = await plan(repo, factory, [installedEntry("intake", repo.root)], null);

    expect(planned.changes).toEqual([
      {
        kind: "disable",
        name: "intake",
        fields: [],
        args: ["automations", "edit", "id-intake", "--disabled"],
      },
    ]);
    expect(planned.unchanged).toEqual([]);
  });

  test("removes a registration whose automation was deleted", async () => {
    const { repo, factory } = await factoryWith({});

    const planned = await plan(repo, factory, [installedEntry("intake", repo.root)], null);

    expect(planned.changes.map((change) => change.args)).toEqual([
      ["automations", "remove", "id-intake"],
    ]);
  });

  test("removes a registration whose automation now names another owner", async () => {
    const { repo, factory } = await factoryWith({ intake: { owner: "other@example.com" } });

    const planned = await plan(repo, factory, [installedEntry("intake", repo.root)]);

    expect(planned.changes.map((change) => change.args)).toEqual([
      ["automations", "remove", "id-intake"],
    ]);
  });

  test("leaves an already disabled registration alone", async () => {
    const { repo, factory } = await factoryWith({ intake: { enabled: false } });

    const planned = await plan(repo, factory, [
      installedEntry("intake", repo.root, { enabled: false }),
    ], null);

    expect(planned.changes).toEqual([]);
    expect(planned.unchanged).toEqual(["intake"]);
  });

  test("keeps the oldest of two registrations with one title", async () => {
    const { repo, factory } = await factoryWith({ intake: {} });
    const desired = await desiredSet(factory, "orca", ACCOUNT, "main");

    const planned = await plan(repo, factory, [
      installedEntry("intake", repo.root, {
        id: "newer",
        prompt: desired[0]!.stub,
        createdAt: "2026-02-01T00:00:00.000Z",
      }),
      installedEntry("intake", repo.root, {
        id: "older",
        prompt: desired[0]!.stub,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ]);

    expect(planned.changes.map((change) => change.args)).toEqual([
      ["automations", "remove", "newer"],
    ]);
    expect(planned.unchanged).toEqual(["intake"]);
  });

  test("ignores another repository's registration", async () => {
    const { repo, factory } = await factoryWith({ intake: {} });

    const planned = await plan(repo, factory, [
      installedEntry("intake", "/somewhere/else", { prompt: `${stubMarker("intake", FACTORY)}\n` }),
    ]);

    expect(planned.leftAlone).toEqual([]);
    expect(planned.changes.map((change) => change.kind)).toEqual(["create"]);
  });

  test("reports a foreign registration in this repository and leaves it alone", async () => {
    const { repo, factory } = await factoryWith({ intake: {} });

    const planned = await plan(repo, factory, [
      installedEntry("intake", repo.root, {
        prompt: `${stubMarker("intake", "another-factory")}\n`,
      }),
    ]);

    expect(planned.leftAlone).toEqual(["automation: intake"]);
    expect(planned.changes.map((change) => change.kind)).toEqual(["create"]);
  });

  test("takes the agent from the installed registrations when they share one", async () => {
    const { repo, factory } = await factoryWith({ intake: {}, report: {} });
    const desired = await desiredSet(factory, "orca", ACCOUNT, "main");
    const report = desired.find((entry) => entry.name === "report")!;

    const planned = await plan(
      repo,
      factory,
      [installedEntry("report", repo.root, { prompt: report.stub, agentId: "claude" })],
      null,
    );

    const create = planned.changes.find((change) => change.kind === "create")!;
    const args = create.args;
    expect(args[args.indexOf("--provider") + 1]).toBe("claude");
    expect(planned.agent).toBe("claude");
  });

  test("needs an agent when there is none and something to create", async () => {
    const { repo, factory } = await factoryWith({ intake: {} });

    const failure = await plan(repo, factory, [], null).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NeedsInput);
    const needsInput = failure as NeedsInput;
    expect(needsInput.exitCode).toBe(2);
    expect(needsInput.required.map((value) => value.name)).toEqual(["agent"]);
  });

  test("needs an agent when the installed registrations disagree, even with nothing to create", async () => {
    const { repo, factory } = await factoryWith({ intake: {}, report: {} });
    const desired = await desiredSet(factory, "orca", ACCOUNT, "main");

    const failure = await plan(
      repo,
      factory,
      [
        installedEntry("intake", repo.root, {
          prompt: desired.find((entry) => entry.name === "intake")!.stub,
          agentId: "opencode",
        }),
        installedEntry("report", repo.root, {
          prompt: desired.find((entry) => entry.name === "report")!.stub,
          agentId: "claude",
        }),
      ],
      null,
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NeedsInput);
  });

  test("needs no agent when the desired set is empty", async () => {
    const { repo, factory } = await factoryWith({ intake: { enabled: false } });

    const planned = await plan(repo, factory, [], null);

    expect(planned.changes).toEqual([]);
    expect(planned.agent).toBe("");
  });

  test("repairs a main registration whose workspace names another checkout", async () => {
    const { repo, factory } = await factoryWith({ intake: { checkout: "main" } });
    const desired = await desiredSet(factory, "orca", ACCOUNT, "main");

    const planned = await plan(repo, factory, [
      installedEntry("intake", repo.root, {
        prompt: desired[0]!.stub,
        workspaceId: "main::/somewhere/else",
      }),
    ]);

    expect(planned.changes).toEqual([
      {
        kind: "update",
        name: "intake",
        fields: ["workspace"],
        args: ["automations", "edit", "id-intake", "--workspace", `path:${repo.root}`],
      },
    ]);
  });
});

describe("mainCheckout", () => {
  test("names the main checkout when the sync runs in a linked worktree", async () => {
    const { repo, factory } = await factoryWith({ intake: {} }, { git: true });
    await git(repo.root, ["config", "user.email", ACCOUNT]);
    await git(repo.root, ["config", "user.name", "Test"]);
    await git(repo.root, ["add", "-A"]);
    await git(repo.root, ["commit", "-m", "one"]);

    const dir = await mkdtemp(path.join(tmpdir(), "metafab-orca-linked-"));
    containers.push(dir);
    const linked = path.join(dir, "linked");
    await git(repo.root, ["worktree", "add", linked, "-b", "feat"]);

    const linkedFactory = await loadFactory(linked);
    expect(await mainCheckout(linkedFactory)).toBe(await realpath(repo.root));

    const planned = await prepareOrcaSync({
      factory: linkedFactory,
      account: ACCOUNT,
      trunk: "main",
      agent: "opencode",
      run: listRunner([]),
    });
    const create = planned.changes.find((change) => change.kind === "create")!;
    expect(create.args).toContain(`path:${await realpath(repo.root)}`);
  });

  test("finds the main checkout of a --separate-git-dir clone", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "metafab-orca-separate-"));
    containers.push(dir);
    const root = path.join(dir, "checkout");
    await git(dir, ["init", "--separate-git-dir", path.join(dir, "repo.git"), root]);
    await writeRepoFiles(root, {
      ".factory/factory.yaml": `format: 2\nname: ${FACTORY}\n`,
      ".factory/automations/intake/automation.md": AUTOMATION,
    });

    const factory = await loadFactory(root);
    expect(await mainCheckout(factory)).toBe(await realpath(root));
  });

  test("refuses a bare repository's linked worktree", async () => {
    const { repo } = await factoryWith({ intake: {} }, { git: true });
    await git(repo.root, ["config", "user.email", ACCOUNT]);
    await git(repo.root, ["config", "user.name", "Test"]);
    await git(repo.root, ["add", "-A"]);
    await git(repo.root, ["commit", "-m", "one"]);

    const dir = await mkdtemp(path.join(tmpdir(), "metafab-orca-bare-"));
    containers.push(dir);
    const bare = path.join(dir, "bare.git");
    await git(dir, ["clone", "--bare", repo.root, bare]);
    const linked = path.join(dir, "linked");
    await git(dir, ["--git-dir", bare, "worktree", "add", linked, "HEAD"]);

    const factory = await loadFactory(linked);
    expect(await mainCheckout(factory)).toBeUndefined();

    const failure = await prepareOrcaSync({
      factory,
      account: ACCOUNT,
      trunk: "main",
      agent: "opencode",
      run: listRunner([]),
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MetafabError);
    expect((failure as MetafabError).message).toBe(
      "This repository has no main checkout for Orca to run in",
    );
  });
});

describe("createOrcaRunner", () => {
  test.skipIf(process.platform === "win32")(
    "passes --environment local and drops ORCA_PAIRING_CODE from every call",
    async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "metafab-orca-fake-"));
      const bin = path.join(dir, "bin");
      await mkdir(bin);
      await copyFile(
        fileURLToPath(new URL("../../helpers/fake-orca.mjs", import.meta.url)),
        path.join(bin, "orca"),
      );
      await chmod(path.join(bin, "orca"), 0o755);
      const state = path.join(dir, "state.json");
      await writeFile(state, JSON.stringify({ automations: [] }));

      const saved = {
        PATH: process.env.PATH,
        FAKE_ORCA_STATE: process.env.FAKE_ORCA_STATE,
        ORCA_ENVIRONMENT: process.env.ORCA_ENVIRONMENT,
        ORCA_PAIRING_CODE: process.env.ORCA_PAIRING_CODE,
      };
      process.env.PATH = `${bin}${path.delimiter}${process.env.PATH ?? ""}`;
      process.env.FAKE_ORCA_STATE = state;
      process.env.ORCA_ENVIRONMENT = "remote";
      process.env.ORCA_PAIRING_CODE = "secret";
      cleanups.push(async () => {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        await rm(dir, { recursive: true, force: true });
      });
      const answer = await createOrcaRunner()(["automations", "list"]);
      expect(answer.exitCode).toBe(0);

      const recorded = JSON.parse(await readFile(state, "utf8")) as {
        calls: { args: string[]; environment: string | null; pairingCode: string | null }[];
      };
      expect(recorded.calls).toHaveLength(1);
      expect(recorded.calls[0]!.args).toContain("--environment");
      expect(recorded.calls[0]!.args).toContain("local");
      expect(recorded.calls[0]!.environment).toBe("remote");
      expect(recorded.calls[0]!.pairingCode).toBeNull();
    },
  );

  test("reports a missing orca command", async () => {
    const saved = process.env.PATH;
    const empty = await mkdtemp(path.join(tmpdir(), "metafab-orca-empty-"));
    process.env.PATH = empty;
    cleanups.push(async () => {
      if (saved === undefined) delete process.env.PATH;
      else process.env.PATH = saved;
      await rm(empty, { recursive: true, force: true });
    });

    const failure = await createOrcaRunner()(["automations", "list"]).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(OrcaMissingError);
    expect((failure as OrcaMissingError).message).toBe("The orca command was not found");
  });
});

describe("changeLine", () => {
  test("writes the four change lines", () => {
    expect(changeLine({ kind: "create", name: "intake", args: [], fields: [] })).toBe(
      "+ automation: intake",
    );
    expect(
      changeLine({ kind: "update", name: "intake", args: [], fields: ["cron", "prompt"] }),
    ).toBe("~ automation: intake (cron, prompt)");
    expect(changeLine({ kind: "disable", name: "intake", args: [], fields: [] })).toBe(
      "off automation: intake",
    );
    expect(changeLine({ kind: "remove", name: "intake", args: [], fields: [] })).toBe(
      "- automation: intake",
    );
  });
});

describe("applyOrcaSync", () => {
  test("stops at the first failing call and reports what was done", async () => {
    const changes: OrcaChange[] = [
      {
        kind: "create",
        name: "intake",
        fields: [],
        args: ["automations", "create", "--name", "automation: intake"],
      },
      {
        kind: "create",
        name: "report",
        fields: [],
        args: ["automations", "create", "--name", "automation: report"],
      },
    ];
    const calls: string[][] = [];
    const run: OrcaRunner = async (args) => {
      calls.push(args);
      if (calls.length === 2) return { exitCode: 1, stdout: "", stderr: "Orca is not running" };
      return { exitCode: 0, stdout: "{}", stderr: "" };
    };

    const result = await applyOrcaSync(changes, run);

    expect(calls).toHaveLength(2);
    expect(result.created).toEqual(["intake"]);
    expect(result.failure).toEqual({
      message: "Orca is not running",
      fix: "Start Orca, then run the sync again",
    });
  });
});
