# Automations

> Version 2 (draft). Format 2 factories only. Plans 2.019 and 2.020 build it.

An **automation** is factory work that runs on its own: a fresh agent session, started by a schedule or by another automation, with nobody watching. It is one file in `.factory/`, so what runs, when it runs and whose account runs it are reviewed like any other change. A harness that can schedule agent sessions (Orca, Amp) holds a copy of each automation's trigger. `metafab automations sync` keeps that copy in step with the files.

The idea comes from the Dragonfly factory's `.factory/automations/`, which took it from Warp. This spec keeps that design's file-first rules and its Amp procedure. It drops what belongs to one factory (workflow lists, inputs, gates and Who to ask), because a factory says those in prose and in its run instructions.

The format is part of the open factory format. Its names (`automations/`, `automation.md`, `run.md`) do not name Metafab.

## Concepts

- **Automation:** `.factory/automations/<name>/automation.md`. Its frontmatter says when it runs and for whom; its body says what the run does.
- **Run instructions:** `.factory/automations/run.md`, optional. Text every run reads before the automation's body: how this factory's harnesses ask a person, notify, and start a chained run.
- **Target:** a harness Metafab can register automations in. Version 2 has `orca` and `amp`.
- **Account:** who a target runs a registered automation as. In Amp it is `AMP_USER_EMAIL`. In Orca it is `git config user.email` in the repository.
- **Prompt:** the full instructions for one run, rendered by `metafab automations prompt` when the run starts.
- **Stub:** the short text registered in a target. It puts the checkout on the trunk and runs `metafab automations prompt`, so a registered copy never goes stale.

## Layout

```text
.factory/
  automations/
    run.md                    optional: run instructions for every automation
    intake/automation.md      the automation named intake
    sync-automations/automation.md
```

1. `automations/` is a reserved top-level directory in format 2. It holds no skills: a `SKILL.md` anywhere below it is an error, and `build` never installs anything from it.
2. Each directory directly in `automations/` is one automation. Its name follows the skill name rules ([Factory format](factory-format.md#validation) rule 5), and it must contain `automation.md`. Other files beside `automation.md` are allowed and ignored.
3. The only file allowed directly in `automations/` is `run.md`. Any other file there is an error.
4. Directories whose name starts with `.` are ignored, as everywhere in `.factory/`.

## `automation.md`

```markdown
---
description: Triage the intake backlog and plan the next cluster
owner: mitch@example.com
triggers:
  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }
---

# intake

Triage the whole intake backlog with the `file-work` workflow's rules, then plan the next
cluster with `plan-feature`. Stop at the plan approval and ask the feature's owner.
```

### Frontmatter

| Key | Required | Meaning |
| --- | --- | --- |
| `owner` | Yes | The email of the account the automation is registered in and runs as, or `"*"` for every account that syncs. Compared without letter case |
| `description` | No | One line that `list` shows |
| `enabled` | No | `true` (default) or `false`. A disabled automation is listed, never registered, and never started by a chain |
| `checkout` | No | `worktree` (default) or `main`. See [Checkout](#checkout) |
| `triggers` | Yes | A non-empty list of triggers |

A trigger is a mapping with exactly one key:

- `schedule: { cron: "<five fields>", tz: "<IANA zone>" }`. Each cron field is comma-separated parts; a part is `*`, a number or a range `a-b` with `a <= b`, optionally followed by `/<step>` with a positive integer step. Every number is inside its field's range: minute 0-59, hour 0-23, day of month 1-31, month 1-12, day of week 0-7 (0 and 7 are Sunday). `tz` is a zone that `Intl.DateTimeFormat` accepts.
- `after: [<name>, ...]`: start this automation when any of the named automations finishes.

Rules:

1. Automations need `format: 2`. In a format 1 factory, `check` warns once that `.factory/automations/` needs `format: 2`, and the `automations` commands exit 1 with the fix `Set format: 2 in .factory/factory.yaml`.
2. The frontmatter is YAML with the [grammar](factory-format.md#yaml-and-frontmatter-grammar) of skill frontmatter. Keys other than those above are errors.
3. An automation has at most one `schedule` trigger, because every target holds one schedule per registered automation. Write several times in one cron (`0 8,17 * * 1-5`).
4. Two triggers that are equal are an error.
5. Each `after` name is another automation in the factory, not itself. An `after` chain may not loop; each automation on a loop is an error that lists the loop.
6. An automation that runs `after` another has `owner: "*"`, or the same `owner` as that automation (compared without letter case), because a chained run starts in its parent's account. A personal owner after a `"*"` parent is an error: the parent runs in accounts the child would refuse.
7. `owner` is the only key that may hold an email.
8. The body, rendered for every declared value, is not empty. A selection that removes all of it makes `prompt` fail ([The prompt](#the-prompt) rule 2). It is the run's procedure: what to do, in what order, which workflows to follow, who to ask and who to tell. A workflow named in it is loaded by the run like any other skill.

### Checkout

| Value | Orca | Amp |
| --- | --- | --- |
| `worktree` | Orca creates a new worktree from the trunk for each run and runs the repository's setup in it. The stub stops if the checkout is dirty, then detaches it at `origin/<trunk>` | Each firing is a fresh thread in the project's orb. The stub stops if the checkout is dirty, then detaches it at `origin/<trunk>` |
| `main` | The run uses the repository's main checkout as it is. The stub does not switch branches | The same as `worktree`, because an orb is its own clone |

`worktree` is the default because a run then reads the factory as the trunk holds it, and two runs never share a checkout. Use `main` for a run that needs local state that only the main checkout has.

## Run instructions

`.factory/automations/run.md` is a partial ([Environments: Import](environments.md#import)): its frontmatter, if any, is removed and its body is rendered into every prompt, before the automation's body. It says what Metafab cannot know: how this factory's harnesses ask a person at a decision, how they notify someone when a run ends, and how they start a chained run. A factory serving several harnesses writes it with `switch env.harness`, so each run reads only its own harness's text.

A factory with no `run.md` gets prompts with no run instructions.

## Directives

Directives apply to `run.md` and to the body of every `automation.md`, in addition to the files listed in [Environments: Where directives apply](environments.md#where-directives-apply). `check` validates every branch, as for skills. Directives in `automation.md` frontmatter are errors.

## The prompt

`metafab automations prompt <name>` renders one run's instructions for the current [selection](environments.md#selecting-an-environment):

```text
Run the factory automation `intake` unattended. Nobody is watching this session.

<run.md, rendered>

# intake
<the automation's body, rendered>

When this run ends, start each automation that runs after it, as the run instructions say: `plan-intake`.
```

1. The first line is fixed. The run-instructions section is left out when there is no `run.md`. The last line is left out when no enabled automation runs `after` this one. When the body starts with the heading `# <name>`, the prompt leaves it out, so the heading appears once.
2. `prompt` exits 1 and prints nothing to standard output when the automation does not exist (`No automation named <name>`), is disabled (`<name> is turned off`), renders to an empty body for the selection (`<name> has nothing to do in this environment`), or when `check` reports an error in a file the prompt depends on: its own `automation.md`, `run.md`, a file either of them imports, or the `automation.md` of an automation on its `after` line. A loop that passes through it is such an error too. Errors in any other file do not stop it.
3. With `--target <target>`, `prompt` also checks the account. When `owner` is not `"*"` and is not the target's account, it exits 1 with `<name> belongs to <owner>, and this run acts as <account>`. When the account is unknown (`AMP_USER_EMAIL` unset for `amp`, no `user.email` for `orca`), it exits 1 and says which setting is missing.
4. `--env` previews another selection, as for `build`.

## The stub

`metafab automations stub <name> --target <target> [--branch <trunk>]` prints the text a target registers. For `checkout: worktree`:

```text
Run the factory automation `intake` from the `dragonfly` factory.

1. Run `git status --porcelain --untracked-files=all`. If it prints anything or fails, report that this run needs a clean checkout, and stop.
2. Run `git fetch origin && git switch --detach origin/'main'`.
3. Run `<metafab> automations prompt intake --target amp`. If it fails, report what it printed, and stop. Otherwise follow what it printed: those are this run's instructions.
```

For `checkout: main` with `--target orca`, steps 1 and 2 are left out and step 3 is step 1. For `--target amp`, the stub always has all three steps, because an orb is its own clone ([Checkout](#checkout)).

1. The first line is the stub's **marker**: `Run the factory automation \`<name>\` from the \`<factory>\` factory.`, where `<factory>` is `name` in `factory.yaml`. Sync uses it to recognise the registrations it owns.
2. `<metafab>` runs Metafab with the same lookup as the [Git hooks](building.md#git-hooks), from the factory's directory, ending in `npx --yes @seasb/metafab@<version>`, where `<version>` is the version that wrote the stub. It is POSIX `sh`.
3. `<trunk>` is `--branch`, or the remote's default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`, without `origin/`). When neither gives one, `stub` exits 1 with the fix `Pass --branch <trunk>`. A `--branch` that `git check-ref-format --branch` refuses is an error (exit 1).
4. Every value the stub puts in a shell command (the trunk and the factory's directory) is quoted for POSIX `sh`, so spaces and shell characters in them are safe.
5. The stub holds no part of the body, so a change to an automation's body takes effect at its next run without a sync. A sync is needed only when `owner`, `enabled`, `checkout` or a `schedule` trigger changes, or when the stub changes because Metafab was upgraded.

## Sync

`sync` makes a target's registrations match the files. The files are the set: sync never decides what runs, when, or for whom.

The **desired set** for a target and account is one entry per automation that:

- is enabled,
- has a `schedule` trigger, and
- has `owner` `"*"` or the account.

An automation started only by `after` is never registered: the run before it starts it.

A registration is **managed** when its title is `automation: <name>`, its prompt begins with the marker for that name and this factory, and it belongs to this repository (the target says how). Sync creates, updates, disables and removes only managed registrations. Any other registration is left alone, and one whose title starts with `automation: ` is reported as `left alone`.

Every sync:

1. Reads the desired set from the files in the current checkout. If any automation has an error, sync changes nothing and exits 1 with the errors.
2. Refuses, changing nothing, when an automation in the set cannot be expressed in the target, naming the automation and the reason (exit 1).
3. Keeps the oldest of two managed registrations with the same title and removes the others.
4. Creates a registration for each entry that has none, updates each one that differs, and handles each managed registration that has no entry (see each target).
5. Changes nothing on a second run.

### Orca

`metafab automations sync orca [--agent <id>] [--branch <trunk>] [--dry-run]` uses the `orca` CLI on this machine, always against the local Orca and never a paired remote one. It needs a main checkout: a bare repository's linked worktree is refused (exit 1).

- **Account:** `git config user.email` in the repository.
- **Belongs to this repository:** the automation's run context path is the repository root.
- **A registration** is an Orca automation named `automation: <name>`, with the stub for `--target orca` as its prompt, the cron and `tz` as its trigger and time zone, the agent `--agent`, a fresh session for every run, and, for `checkout: worktree`, a new worktree per run on the repository from `origin/<trunk>` with setup run. For `checkout: main`, it runs in the main checkout. Sync always passes `--timezone`, because an automation created without one takes the zone of the browser that made it. Sync restores each of these settings when a person changed one in Orca.
- **Agent:** `--agent`, such as `opencode`, `claude` or `codex`. Without it, sync uses the agent of the managed registrations when they all have the same one. Otherwise, when the desired set is not empty, it is missing input (exit 2, `required: ["agent"]`) and nothing changes.
- **Main checkout:** registrations name the repository's main checkout, even when sync runs in a linked worktree.
- **A managed registration with no entry:** when its automation still exists, is owned by this account and is disabled, sync disables it in Orca and keeps its run history. Otherwise (the automation is deleted, or now has another owner) sync removes it.
- `--dry-run` prints the changes and makes none.
- When `orca` is not installed or its runtime does not answer, sync exits 1 with Orca's message and the fix `Start Orca, then run the sync again`. A sync that fails partway leaves the changes it made; the next sync finishes the work.

### Amp

Amp's schedules can be changed only by an agent's tools inside an Amp thread, so Metafab cannot write them. `metafab automations plan amp [--branch <trunk>] --json` prints the desired set for `AMP_USER_EMAIL`. The built-in `metafab-automations` skill tells an agent in an Amp thread how to apply it.

- **Account:** `AMP_USER_EMAIL`. When it is unset, `plan amp` exits 1, because the session is not an Amp thread and nothing else can say which account would hold the schedules.
- **Expressible:** an Amp schedule repeats every day or on a list of weekdays, at plain hours and minutes. The cron's minute and hour must be numbers or comma lists, its day of month and month `*`, and its day of week `*`, days or ranges of days. Any other cron is refused with the reason.
- **Each entry** has `name`, `title` (`automation: <name>`), `schedule` (a `DTSTART;TZID=<tz>:<stamp>` line and an `RRULE` line), `schedule_label` (the days and times in words), `run_mode` (`fresh`) and `prompt` (the stub for `--target amp`, with trailing whitespace removed, as Amp stores it). The `DTSTART` stamp is the first firing at or after now in `tz`, skipping a wall-clock time that the zone's daylight-saving change skips.
- **Comparing:** only the `TZID` and the `RRULE` are compared with an installed schedule, never the `DTSTART` stamp, which moves on its own as time passes.
- **Holding threads:** Amp keeps one schedule per thread, so each schedule is held by a thread made for it. That thread is titled like the schedule, and its only message is `This thread holds the \`automation: <name>\` schedule for metafab automations sync. Do nothing and end.` Every holding thread in an account sits under one parent thread titled `Factory automations`. The skill gives the procedure.
- **A managed schedule with no entry** is cleared, and its holding thread is archived.

## Commands

| Command | Behaviour |
| --- | --- |
| `metafab automations list [--json]` | Every automation in name order, with its owner, enabled state, checkout, triggers and the automations that run after it |
| `metafab automations prompt <name> [--target <target>] [--env <variable>=<values>]...` | Prints one run's prompt ([The prompt](#the-prompt)) |
| `metafab automations stub <name> --target <target> [--branch <trunk>]` | Prints the text a target registers ([The stub](#the-stub)) |
| `metafab automations plan <target> [--agent <id>] [--branch <trunk>]` | Prints the desired set for the target's account, and for `orca` the changes a sync would make |
| `metafab automations sync orca [--agent <id>] [--branch <trunk>] [--dry-run]` | Makes Orca match the files ([Orca](#orca)) |

`metafab check` validates every automation and `run.md`. `prompt` and `stub` write the text alone to standard output; with `--json` they write `{ ..., "prompt": "<text>" }`.

Running an automation by hand is `metafab automations prompt <name>` given to an agent session, for example `p=$(metafab automations prompt intake) && claude -p "$p"`. It is a real run.

## Validation

`check` adds these rules for a format 2 factory:

1. `automations/` follows the [layout](#layout) rules.
2. Every `automation.md` follows the [frontmatter](#frontmatter) rules, and its body is not empty when rendered for every declared value.
3. Directives in `run.md` and in every body follow [Environments: Validation](environments.md#validation) rules 2 to 6.

`check` does not check whether a cron can be expressed in a target; `plan` and `sync` do, for the target they serve.

## Sharing

A fab carries its automations and `run.md` like any other file in `.factory/`. An imported automation with a personal `owner` never registers in another person's account. A fab that wants its automations to run for everyone who syncs uses `owner: "*"`.

## Out of scope

- Event triggers (Slack, GitHub, Linear). Orca supports them only for its bots.
- Running an automation on a schedule without a target. Metafab never runs an agent.
- Other targets. A new target is a new section here and a new `sync` or `plan` target.
- Recording gate answers. A decision is recorded where it lives (a merge, a document field), never in the harness.
