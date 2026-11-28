#!/usr/bin/env node
// A stand-in for the `orca` CLI. Every call reads and writes the JSON file named
// by FAKE_ORCA_STATE, so a test can inspect the automations and every argument
// list Metafab passed. It refuses a call that is not local and JSON, the way
// the sync promises every call is.
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const statePath = process.env.FAKE_ORCA_STATE;
if (statePath === undefined || statePath === "") {
  process.stderr.write("fake orca: FAKE_ORCA_STATE is not set\n");
  process.exit(1);
}

let state;
try {
  state = JSON.parse(readFileSync(statePath, "utf8"));
} catch {
  state = {};
}
state.automations ??= [];
state.calls ??= [];
state.nextId ??= 1;
state.calls.push({
  args,
  environment: process.env.ORCA_ENVIRONMENT ?? null,
  pairingCode: process.env.ORCA_PAIRING_CODE ?? null,
});

function save() {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function fail(message) {
  save();
  process.stderr.write(`fake orca: ${message}\n`);
  process.exit(1);
}

function value(flag) {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

function pathOf(selector) {
  if (selector === undefined) return undefined;
  return selector.startsWith("path:") ? selector.slice("path:".length) : selector;
}

if (value("--environment") !== "local") fail("every call must pass --environment local");
if (!args.includes("--json")) fail("every call must pass --json");

if (args[0] !== "automations") fail(`unknown command ${args[0] ?? ""}`);
const verb = args[1];

if (verb === "list") {
  save();
  process.stdout.write(`${JSON.stringify({ automations: state.automations }, null, 2)}\n`);
  process.exit(0);
}

if (verb === "create") {
  const repo = value("--repo");
  const workspace = value("--workspace");
  const path = pathOf(repo ?? workspace);
  const createdAt = new Date(Date.UTC(2026, 0, 1) + state.automations.length * 1000).toISOString();
  state.automations.push({
    id: `auto-${state.nextId}`,
    title: value("--name"),
    prompt: value("--prompt"),
    rrule: value("--trigger"),
    timezone: value("--timezone"),
    agentId: value("--provider"),
    enabled: args.includes("--enabled"),
    createdAt,
    runContext: { path },
    workspaceId: repo === undefined ? `main::${path}` : `worktree::${path}`,
    baseBranch: value("--base-branch"),
    launchSetup: value("--setup") === "run",
    reuseSession: !args.includes("--fresh-session"),
  });
  state.nextId += 1;
  save();
  process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
  process.exit(0);
}

if (verb === "edit") {
  const automation = state.automations.find((entry) => entry.id === args[2]);
  if (automation === undefined) fail(`no automation ${args[2] ?? ""}`);

  if (args.includes("--enabled")) automation.enabled = true;
  if (args.includes("--disabled")) automation.enabled = false;
  if (args.includes("--fresh-session")) automation.reuseSession = false;

  for (const [flag, key] of [
    ["--prompt", "prompt"],
    ["--trigger", "rrule"],
    ["--timezone", "timezone"],
    ["--provider", "agentId"],
    ["--base-branch", "baseBranch"],
  ]) {
    const next = value(flag);
    if (next !== undefined) automation[key] = next;
  }

  const workspace = value("--workspace");
  if (workspace !== undefined) {
    const path = pathOf(workspace);
    automation.workspaceId = `main::${path}`;
    automation.runContext = { path };
  }

  const setup = value("--setup");
  if (setup !== undefined) automation.launchSetup = setup === "run";

  save();
  process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
  process.exit(0);
}

if (verb === "remove") {
  state.automations = state.automations.filter((entry) => entry.id !== args[2]);
  save();
  process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
  process.exit(0);
}

fail(`unknown automations command ${verb ?? ""}`);
