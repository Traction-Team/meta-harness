# Metafab Mark IV: overview

This document says what Mark IV is, why it is smaller than Mark III, and the parts it is built from. It starts from [`../mk3/overview.md`](../mk3/overview.md) and keeps its main idea. It drops the parts that need Metafab to run the work.

## The change from Mark III

Mark III is a runner. Metafab dispatches every program run, holds items at gates, scores every output, and can rewind an item. To get any value, a team must move all of its work into Metafab.

Mark IV is not a runner. Your agents already run the work, in the harness you already use: Claude Code, Codex, opencode, Orca or nodeterm. Mark IV does three things around them:

1. **Describes the factory.** The `.fab/` folder in the repository says how work moves in this project: the programs, what each one makes, and where people decide.
2. **Installs it into every agent.** The `fab` CLI turns `.fab/` into the files that agents read: skills, `AGENTS.md`, `CLAUDE.md`, and the runtime notes for each harness. Every person on the team, and every agent, works from the same factory.
3. **Shows it and starts it.** The **fab monitor** is a small floating window or menu bar app. It shows the fab and what runs in it now, on this machine. Anyone can click a program, such as **Log bug**, answer its questions, and a session starts in their harness.

The evidence for this change is the factory in the Dragonfly repository (see [`research/dragonfly-factory.md`](research/dragonfly-factory.md)). It has no runner. It is programs written as skills, a table of the programs in `AGENTS.md`, and a few scripts. That was enough for agents to move work forward on their own, because each step was well defined. Two things were missing: you could not see the factory, and you had to know what to ask for.

## The proposition

Every team that builds with agents already has a factory. Usually it is in people's heads, in prompts that people copy, and in skills on one person's machine. When that person leaves, or a new person joins, the factory goes with them.

Metafab makes the factory a file in the repository. Then:

- Every agent in every harness follows the same process.
- A new team member reads one folder, or opens the monitor, and sees how work moves.
- A person who does not write code can start work correctly, without knowing which words to type.
- When an agent does a step badly, you fix the program, and the fix goes to every agent on the team at the next pull.

The target experience:

1. In a repository, run `fab init`, or ask your agent to "set up a fab for this repo". The agent asks how the team works and writes the programs with `fab create` and normal file edits.
2. Run `fab install`. The programs become skills in every harness, and `AGENTS.md` gets a table of the programs and a short map of the flow.
3. Commit. Each teammate pulls and runs `fab install`, or a Git hook runs it.
4. Open the monitor. It shows the map of the fab and the sessions that run in it now.
5. Click **Log bug**. Type what went wrong. A Claude Code session (or Codex, or an Orca worktree) starts with the `log-bug` program and your answers.
6. Developers keep working in their agents as before. They say "pull the next chunk" or "here is a bug Kat hit", and the programs table in `AGENTS.md` sends the agent to the correct program.
7. When a program gives poor work, edit the program, not only the output. Run `fab install`, commit, and every agent has the fix.

## The bet

The bet from Mark III stays the same: **fix the factory, not the output.** The model is a projector. The frame (the instructions, skills and context in front of it) decides the result. A team that fixes frames improves every future run. A team that only fixes outputs fixes the same defects again and again.

Mark IV adds a second bet: **most of a factory is words.** A clear program, in a file that every agent loads, does most of what a runner does. The agent reads which step comes next, what that step makes, and where it must stop for a person. A runner adds dispatch, scores and rewind. Those are useful, but a team gets most of the value before it needs them.

So Mark IV puts its effort into three things that the Dragonfly factory showed are hard without help:

- **Writing the factory down well**, so that agents can follow it.
- **Keeping every agent and every person on the same version** of it.
- **Seeing it and starting it**, for people who do not live in a terminal.

## What Mark IV does not do

- **It does not run the work.** There is no dispatch, no queue, and no automatic start of the next program. An agent that finishes a program says what comes next. A person or the agent starts it.
- **It does not host agents.** Sessions run in the harness you already use. The monitor starts them there and reads their state there.
- **It does not type the flow strictly.** Inputs and outputs are descriptions for people, for the monitor's forms and for the map. They are not types that Metafab enforces.
- **It does not track items or rewind them.** A piece of work is a set of files (an intake note, a plan, a PR), and Git is its history.
- **It does not score outputs.** A review is a program, like any other step. Scorers can come back later.

## The parts of a fab

| Part | What it is | Where it lives |
| --- | --- | --- |
| **Program** | One step in how work moves. Instructions an agent follows, with an entry condition and a result. Installed as a skill | `.fab/programs/<name>/SKILL.md` |
| **Artifact** | A kind of document that work becomes: an intake note, a plan, a PR, a changelog entry. It says where that kind of file lives | `fab.yaml`, `artifacts:` |
| **Decision** | A point where a person decides: what is next, approve the plan, merge. Mark III called these gates | `fab.yaml`, `decisions:` |
| **Skill** | Know-how that programs load: how to write tests here, how the API layer works | `.fab/skills/<name>/SKILL.md` |
| **Rule** | A process rule that every session must follow: branch names, commit titles, "main is production" | `.fab/rules/*.md` |
| **Template** | The shape of an artifact: a plan, a PR body, an intake note | `.fab/templates/*` |
| **Runtime** | What is different in each harness: how to open a worktree session, how to start a sub-agent | `.fab/runtimes/<harness>.md` |

Programs and skills are both installed as skills, because that is how the agent tools load know-how. They are kept in separate folders so that `.fab/programs/` shows how work moves, without the domain know-how in the way.

### Programs

A program is a `SKILL.md` with more frontmatter. The body is the instructions. The frontmatter tells three readers what they need: the agent (when to load it), the monitor (whether to show a button, and which questions to ask), and the map (what comes before and after).

```yaml
---
name: log-bug
title: Log bug
description: Records a bug so it is not lost. Writes an intake note, and a short bug plan when the fix is clear. It does not prioritise or build.
when: Someone reports a bug, a defect from live use, or "this is broken".
entry: true                 # show a button in the monitor
inputs:
  - name: what
    ask: What went wrong?
  - name: where
    ask: Where did you see it? A screen, a ticket, or a link.
    optional: true
  - name: reporter
    ask: Who found it?
    default: $USER
writes: [intake-note, bug-plan]
next: [prioritise]          # for the map, and so the agent can say what comes next
decides: nobody             # or the name of a decision in fab.yaml
worktree: current           # current | new
---

# log-bug

1. Understand the report ...
```

Rules for programs:

- `name`, `description` and `when` are required. `fab install` builds the programs table in `AGENTS.md` from them, so an agent knows which program fits a request without loading every program.
- `entry: true` makes a program a button in the monitor. Usually the entry programs are the ones a person starts: *Log bug*, *Log idea*, *Pull next work*, *What's next?*.
- `inputs` are questions, not types. The monitor shows them as a form. `fab run` asks them in the terminal. The answers go into the opening prompt. A program that needs a conversation, not a form, has no inputs, and its instructions say to ask questions first.
- `writes`, `reads` and `next` draw the map. Metafab does not check that a program really writes what it says. `fab check` only checks that the names exist.
- `worktree: new` tells `fab run` and the monitor to start the session in a new worktree and branch.

### Artifacts

Artifacts give the map its words and let the monitor count what waits. Each one names a kind of file and where it lives:

```yaml
artifacts:
  intake-note:
    path: docs/roadmap/intake/*.md
    says: A bug, idea, feedback or follow-up that waits for a decision
    waiting: { status: new }      # frontmatter that means "waiting"
  plan:
    path: docs/plans/*.md
    says: How we build something, ending in its slices
  roadmap:
    path: docs/roadmap/roadmap.md
    says: What is next. At most six lines
```

With `waiting`, the monitor can show "7 intake notes wait for a decision" next to the *prioritise* program. It reads the files. It does not need a runner.

### Decisions

Decisions are the places where a person keeps control. They are text in `fab.yaml`, and the programs that stop for them name them in `decides:`.

```yaml
decisions:
  whats-next:   { who: product lead, says: Pick what is next, in the prioritise conversation }
  plan:         { who: tech lead,    says: Approve the plan, as a docs PR }
  done:         { who: developer,    says: The developer tested the slice and says it is done }
  merge:        { who: code owner,   says: Review and merge the PR }
```

Metafab does not enforce them. They are drawn on the map, and listed in `AGENTS.md`, so that every agent knows where it must stop and every person knows what they own.

### Runtimes

Most of a fab is the same in every harness. Four things are not:

| Operation | Orca | nodeterm | Plain Claude Code or Codex |
| --- | --- | --- | --- |
| Open a worktree session | `orca worktree create --agent … --prompt …` | `open-worktree`, then `open-agent --group` | `git worktree add`, then print the command to start the session |
| Start a sub-agent with a chosen model | The Agent tool | The Agent tool, or `open-agent --model` | The Agent tool |
| Wait for another session | `orca terminal wait` | `--after` | Run it in the foreground |
| Set up a new worktree | Orca setup script | worktree setup script | A `post_create` hook, or `fab install` by hand |

Programs never name a harness. They say "open a worktree session for this slice". The runtime file for the current harness, installed into the session's standing instructions, says how. A new harness is one new file in `.fab/runtimes/`.

## The folder

```
.fab/
  fab.yaml                 name, artifacts, decisions, install targets, harness defaults
  AGENTS.md                the team's standing instructions; the source of the root AGENTS.md
  programs/<name>/SKILL.md how work moves
  skills/<name>/SKILL.md   know-how the programs load
  rules/*.md               process rules for every session
  templates/*              plan.md, pr-body.md, intake.md ...
  runtimes/<harness>.md    orca.md, nodeterm.md, claude-code.md, codex.md, opencode.md
  scripts/                 optional project scripts that programs call, such as next.mjs
```

A fab is a normal folder in the repository. It is reviewed in PRs, it has a Git history, and a change to the fab is a commit. A fab can start from a template that another team shared. A template is a `.fab/` folder without the project's own skills and rules.

## Install

`fab install` writes the files that each agent tool reads. Nothing outside `.fab/` is edited by hand.

| From | To | Committed? |
| --- | --- | --- |
| `.fab/programs/*`, `.fab/skills/*` | Symlinks in `.claude/skills/<name>` and `.agents/skills/<name>` (Claude Code, Codex, and harnesses that read the same folders) | Yes |
| `.fab/AGENTS.md`, plus a programs table, the decisions, and a short map | Root `AGENTS.md`, between `<!-- fab:start -->` and `<!-- fab:end -->` markers. Text outside the markers stays the team's own | Yes |
| Nothing | Root `CLAUDE.md` with `@AGENTS.md`, if it does not exist | Yes |
| `.fab/runtimes/<harness>.md` | `.claude/rules/fab-runtime.md` for Claude Code, and `AGENTS.override.md` for Codex | No, these are local to each worktree |

By default the install is committed, because the point is that the whole team has the same factory. `fab install --local` makes every link local and git-excluded, so one person can try a fab without changing the repository for anyone else. The Dragonfly factory used only the local mode. See [`research/dragonfly-factory.md`](research/dragonfly-factory.md) for why the default changed.

`fab check` fails when an installed file is out of date with `.fab/`. Run it in the pre-commit hook and in CI.

## The CLI

The `fab` CLI is for people and for agents. Every command has `--json`, and every command works without a terminal for input, so an agent can define and change a fab as easily as a person can. See [`cli.md`](cli.md).

- **Define:** `fab init`, `fab create program|skill|rule|artifact|decision`, `fab list`, `fab show`, `fab map`.
- **Install:** `fab install`, `fab check`, `fab doctor`.
- **Run:** `fab run <program>` asks the program's inputs and starts a session in the chosen harness.
- **Watch:** `fab status` lists the sessions that run in this fab on this machine, and the program each one runs.

`fab install` also installs a `fab` skill. It tells an agent how to use the CLI, and how to design a fab with a team: ask how work arrives, what it becomes, where people decide, and what goes wrong today.

## The monitor

The fab monitor is a menu bar app with a panel that can float on top of other windows. It is a view over the CLI. It has no logic of its own. See [`monitor.md`](monitor.md).

- **Now.** The sessions on this machine that run in a fab: the program, the harness, the state, and how long it has run. Click one to go to it in its harness.
- **Start.** A button for each entry program. Click, answer the questions, choose a harness, and the session starts.
- **Map.** A small drawing of the fab: programs in flow order, the decisions between them, how many sessions run in each program, and how many artifacts wait.

### How the monitor knows what runs where

It reads what each harness already writes to disk. See [`research/agent-sessions.md`](research/agent-sessions.md).

- **Sessions that the monitor or `fab run` started** are exact. `fab run` writes a run record before it starts the session: the fab, the program, the inputs, the harness and the session ID. It also puts the run ID in the session's name, its branch, and the first line of its prompt.
- **Sessions a person started by hand** are a best guess. The folder they run in gives the fab and the worktree. The branch name, and the program names in the start of the transcript, can give the program. A session with no match shows as "in this repo, program unknown". The monitor does not guess past what it can see.

## Toward Mark III

The parts of Mark IV are the parts a runner needs first: a fab in Git, run records, and an adapter for each harness that can start a session and read its state. If a team later wants Metafab to start the next program on its own, the runner sits on top of these. Items, scorers, the autonomy dial and rewind stay in [`../mk3/overview.md`](../mk3/overview.md) for that time.

## Limits and open questions

- **Harness files are internal.** The session files of Claude Code, Codex and opencode are not documented APIs. Any update can change them. Keep one small adapter for each harness, and expect to fix it.
- **"Needs you" is not reliable without hooks.** Claude Code writes a session status to disk. The others do not, so the monitor cannot always see that an agent waits for an answer. Hooks in each CLI can add this later, as nodeterm does.
- **A plain CLI needs a terminal window.** Orca and nodeterm host their own terminals. For plain Claude Code or Codex, the monitor opens a window in the person's terminal app.
- **nodeterm cannot be started from outside.** Its control CLI works only inside a nodeterm session. The monitor can see nodeterm's agents, because they are Claude Code or Codex sessions, but it cannot start one there yet.
- **Non-technical people still need a harness.** They need Claude Code (or another agent) installed and signed in. A cloud runner could remove this later.
- **The map is declared, not proven.** A program can say `next: [prioritise]` and its text can say something else. `fab check` can catch names that do not exist. It cannot catch a program that does not do what its frontmatter says.
- **Committed links.** Symlinks in `.claude/skills/` work on macOS and Linux. Windows needs Git's symlink support turned on, or a copy mode.
- **opencode.** Confirm which skill folders opencode reads, and whether it reads `AGENTS.md` and `.claude/skills/` the same way.
- **One program, many buttons.** Dragonfly's `file-work` takes bugs, ideas and feedback. Either a program can list more than one entry, each with its own title and fixed inputs, or each button is a small program that loads the shared one.
- **Names.** "Program" stays from Mark III. "Fab" is the project's factory, and Metafab is the product. Confirm both before the CLI ships.

## What changed from Mark III

| Mark III | Mark IV |
| --- | --- |
| Metafab runs every program, dispatches work and holds items at gates | Agents run programs in their own harness. Metafab describes, installs, shows and starts |
| `.metafab/` with `metafab.yaml` as an executable workflow | `.fab/` with `fab.yaml` as a description: artifacts, decisions, install targets |
| Programs have typed inputs and outputs, connected by wires | Programs have questions for a form, and `writes`, `reads` and `next` for the map |
| Gates hold items until a person or agent decides | Decisions are written down, drawn on the map, and followed by the programs' text |
| Scorers mark every output | A review is a program. Scorers are left for later |
| Items move as balls with a full history and can rewind | Work is files and PRs. Git is the history |
| A large canvas app is the main view | A small monitor shows the map and what runs now. The repo is the main view |
| The value comes after the team moves its work into Metafab | The value comes on the first `fab install`, in the tools the team already uses |
