# Metafab Mark IV: overview

This document says what Mark IV is, why it is smaller than Mark III, and the parts it is built from. It starts from [`../mk3/overview.md`](../mk3/overview.md) and keeps its main idea. It drops the parts that need Metafab to run the work. It brings back two ideas from earlier marks: **stages as filters** from Mark II, and **scorers** from Mark III.

## The change from Mark III

Mark III is a runner. Metafab dispatches every program run, holds items at gates, scores every output, and can rewind an item. To get any value, a team must move all of its work into Metafab.

Mark IV is not a runner. Your agents already run the work, in the harness you already use: Claude Code, Codex, Cursor, opencode, Orca or nodeterm. Mark IV does four things around them:

1. **Describes the factory.** The `.fab/` folder in the repository says how work moves in this project: the **stages** work passes through, the **jobs** that move it from one stage to the next, the **scorers** that judge it, and where people decide.
2. **Installs it into every agent.** The `fab` CLI turns `.fab/` into the files that agents read: skills, `AGENTS.md`, `CLAUDE.md`, and the runtime notes for each harness. Every person on the team, and every agent, works from the same factory.
3. **Shows where the work is.** The **fab monitor** is a small floating window or menu bar app. Its **Work** tab shows each stage as a bar, with one cube for each piece of work in it, so a pile-up is seen at once. Each piece of work shows the agents on it, its scores, and where it came from.
4. **Starts jobs.** The monitor's **Jobs** tab, and the ▶ on each stage, start a job in the person's own harness. A person who does not write code presses a button and answers a question. The job runs with the team's instructions, not a one-off prompt.

The evidence for this change is the factory in the Dragonfly repository (see [`research/dragonfly-factory.md`](research/dragonfly-factory.md)). It has no runner. It is steps written as skills, a table of them in `AGENTS.md`, and a few scripts. That was enough for agents to move work forward on their own, because each step was well defined. Two things were missing: you could not see the factory, and you had to know what to ask for.

## The proposition

Every team that builds with agents already has a factory. Usually it is in people's heads, in prompts that people copy, and in skills on one person's machine. When that person leaves, or a new person joins, the factory goes with them.

Two cases show the gap:

- **A small business, one builder.** A designer who can code a little builds the company's software in Cursor. He chats with the agent, one shot after another, and runs out of credits. He has no structure for planning, building and reviewing, so the results are uneven. With Metafab, he installs a fab that someone else wrote and shared. He then presses buttons: *Log bug*, *Plan feature*, *Build slice*, *Review slice*. Each one starts a well-defined job in Cursor. He gets the structure without having to design it, and he can change it later.
- **A company with many developers.** Each developer uses agents in their own way. Nobody can say where the work is: all in planning, all waiting for review, all waiting to deploy. With one shared fab, every developer's work is in the same stages. The Work view shows where work piles up, and over time, where the factory is slow. The scores show whether the work is good. (Seeing other people's agents needs a sync between fab clients. That is out of scope for Mark IV. The prototype shows a preview.)

Metafab makes the factory a file in the repository. Then:

- Every agent in every harness follows the same process.
- A new team member opens the monitor and sees how work moves, and where it is now.
- A person who does not write code can start work correctly, without knowing which words to type.
- When an agent does a step badly, a scorer shows it, you fix the job, and the fix goes to every agent on the team at the next pull.

The target experience:

1. In a repository, run `fab init`, or `fab init --template <shared fab>`, or ask your agent to "set up a fab for this repo". The agent asks how the team works and writes the stages, jobs and scorers with `fab create` and normal file edits.
2. Run `fab install`. The jobs become skills in every harness, and `AGENTS.md` gets a table of the jobs and a short map of the flow.
3. Commit. Each teammate pulls and runs `fab install`, or a Git hook runs it.
4. Open the monitor. The Work tab already shows the work the repository has: the open intake notes, the roadmap lines, the plans, the draft PRs, the PRs that wait for review. None of it had to be made by fab, because each stage is a filter.
5. Press ▶ on *Needs review*. A review job starts in Claude Code (or Codex, Cursor, or an Orca worktree) on the oldest PR that nobody's agent is on.
6. Developers keep working in their agents as before. They say "pull the next chunk" or "here is a bug Kat hit", and the jobs table in `AGENTS.md` sends the agent to the correct job.
7. When a job ends, its output lands in the next stage, and that stage's scorers run. A low score shows as a red mark on the cube. Edit the job, not only the output. Run `fab install`, commit, and every agent has the fix.

## The bet

The bet from Mark III stays the same: **fix the factory, not the output.** The model is a projector. The frame (the instructions, skills and context in front of it) decides the result. A team that fixes frames improves every future run. A team that only fixes outputs fixes the same defects again and again.

Mark IV adds two bets:

- **Most of a factory is words.** A clear job, in a file that every agent loads, does most of what a runner does. The agent reads which step comes next, what that step makes, and where it must stop for a person. A runner adds dispatch and rewind. Those are useful, but a team gets most of the value before it needs them.
- **Work is already somewhere.** Plans are files, slices are lines in plans, builds are branches and PRs, bugs are tickets. A stage that is a filter over those things works on day one, in a repository with history, for work that no agent touched. A stage that is a status written by Metafab works only for work that went through Metafab.

So Mark IV puts its effort into four things that the Dragonfly factory showed are hard without help:

- **Writing the factory down well**, so that agents can follow it.
- **Keeping every agent and every person on the same version** of it.
- **Seeing where the work is**, and how good it is.
- **Starting it**, for people who do not live in a terminal.

## What Mark IV does not do

- **It does not run the work.** There is no dispatch, no queue, and no automatic start of the next job. An agent that finishes a job says what comes next. A person or the agent starts it.
- **It does not host agents.** Sessions run in the harness you already use. The monitor starts them there and reads their state there.
- **It does not own the work's state.** A stage reads where work is from the files, branches, PRs and tickets. Metafab never writes "this is in review". If the PR is ready and not approved, it is in review.
- **It does not type the flow strictly.** Inputs are questions for people and for the monitor's forms. They are not types that Metafab enforces.
- **It does not rewind.** History is linked where it can be (see [History](#history)). Git is the record.
- **It does not share across machines.** The monitor shows this machine's agents. Teammates' agents, and shared scores, need a sync that Mark IV does not have.

## The parts of a fab

| Part | What it is | Where it lives |
| --- | --- | --- |
| **Stage** | A place work waits, as a filter over things that already exist: files, lines in a file, slices in plans, branches, PRs, tickets. Names the job that moves work on | `fab.yaml`, `stages:` |
| **Artifact** | One thing a stage's filter finds: an intake note, a roadmap line, a plan PR, a slice, a feature PR. Not declared. Found | Wherever it already is |
| **Job** | Work an agent can do. Moves work from one stage to the next, or starts new work. Instructions an agent follows. Installed as a skill. Mark III called these programs | `.fab/jobs/<name>/SKILL.md` |
| **Scorer** | One question about the artifacts in a stage, answered 0–10 by an agent. Higher is always better | `.fab/scorers/<name>/SKILL.md` |
| **Decision** | A point where a person decides: what is next, approve the plan, merge. Mark III called these gates | `fab.yaml`, `decisions:` |
| **Skill** | Know-how that jobs load: how to write tests here, how the API layer works | `.fab/skills/<name>/SKILL.md` |
| **Rule** | A process rule that every session must follow: branch names, commit titles, "main is production" | `.fab/rules/*.md` |
| **Template** | The shape of an artifact: a plan, a PR body, an intake note | `.fab/templates/*` |
| **Runtime** | What is different in each harness: how to open a worktree session, how to start a sub-agent | `.fab/runtimes/<harness>.md` |

Jobs, scorers and skills are all installed as skills, because that is how the agent tools load know-how. They are kept in separate folders so that `.fab/jobs/` shows how work moves, without the domain know-how in the way.

### Stages

A stage is a filter. It says where to look (`find`) and what must be true (`where`). Anything that matches is in the stage, whoever made it and however.

```yaml
stages:
  - id: intake
    title: Intake
    kind: note
    find: files docs/roadmap/intake/*.md
    where: "status: open"
    next: prioritise
    slow-after: 7d
    scored-by: [clear]
  - id: ready
    title: Ready to build
    kind: slice
    find: slices in docs/plans/*.md
    where: "status: ready"
    next: pull-work
    scored-by: [edge-cases, product-debt]
  - id: review
    title: Needs review
    kind: pr
    find: prs head:feat/*
    where: ready for review, not approved
    next: review-slice
    waits-for: code owner
    slow-after: 1d
    scored-by: [tech-debt, tests]
  - id: shipped
    title: Shipped
    kind: pr
    find: prs head:feat/*
    where: merged in the last 7 days
    done: true
```

- **Sources.** `find` names a source and a pattern. The first sources: `files <glob>` (frontmatter in `where`), `lines in <file>`, `slices in <glob>` (headings in plans), `branches <pattern>`, `prs <query>` (GitHub, through `gh`), and `linear <query>`. A source is a small adapter in the CLI, like a harness adapter.
- **Order.** Stages are listed in flow order. That order is the Work view, top to bottom.
- **`next`** names the job that moves work out of the stage. It is the ▶ on the stage in the monitor.
- **`waits-for`** names who must act before work can leave the stage. It is drawn on the stage, and the job's text says to stop for them.
- **`slow-after`** is how long an artifact may wait before the monitor marks the stage as slow. It is how bottlenecks show.
- **`scored-by`** lists the scorers that run on artifacts when they enter the stage.
- **`done: true`** marks an end stage. The monitor shows it dimmed, and limits it to a time window in `where`.

`fab check` warns when two stages can match the same artifact. Usually that is a mistake (a PR is a draft or it is ready). See the open questions.

### Jobs

A job is a `SKILL.md` with more frontmatter. The body is the instructions. The frontmatter tells three readers what they need: the agent (when to load it), the monitor (where to show it and which questions to ask), and the map (which stages it joins).

```yaml
---
name: review-slice
title: Review slice
description: A second agent reviews the slice's PR against its plan and the rules, then hands it to the code owner.
when: A slice PR is ready for review.
from: review              # the stage it takes work from; empty for a job that starts new work
to: merge                 # the stage its output lands in
takes: one                # one: works on one artifact | all: reads the whole stage (prioritise)
decides: done             # or the name of a decision in fab.yaml
worktree: current         # current | new
---

# review-slice

1. Read the PR and the slice in its plan ...
```

A job that starts new work has no `from`. It has `inputs`, which the monitor shows as a form:

```yaml
---
name: file-work
title: File work
to: intake
entries:                  # one job, many buttons
  - { title: Log bug,      fixed: { kind: bug },      ask: What went wrong? }
  - { title: Log idea,     fixed: { kind: idea },     ask: What's the idea? }
  - { title: Log feedback, fixed: { kind: feedback }, ask: What did they say? }
inputs:
  - { name: what, ask: What went wrong?, long: true }
  - { name: where, ask: Where did you see it?, optional: true }
  - { name: reporter, ask: Who found it?, default: $USER }
---
```

Rules for jobs:

- `name`, `description` and `when` are required. `fab install` builds the jobs table in `AGENTS.md` from them, so an agent knows which job fits a request without loading every job.
- `from` and `to` name stages. `fab check` checks that they exist. Metafab does not check that a job really moves work where it says. The stage filters will show it if it does not.
- `takes: one` jobs get the artifact in their opening prompt (`On: feat/context-packs-s2 · #412`). The monitor asks "Which pull request?" and selects the oldest one that nobody's agent is on.
- `takes: all` jobs read the whole `from` stage. They start at once, with no form.
- `inputs` are questions, not types. A job that needs a conversation, not a form, has no inputs, and its instructions say to ask questions first.
- `worktree: new` tells `fab run` and the monitor to start the session in a new worktree and branch. A job whose `to` stage holds PRs gets a branch that the stage filters match (`feat/<artifact>`).

### Scorers

A scorer is a small skill that asks one question about one artifact and answers with a number from 0 to 10. Higher is always better, so "tech debt" is asked as "Does it add little tech debt?".

```yaml
---
name: edge-cases
title: Edge cases
ask: Does the plan name the edge cases, and say what happens in each?
---

# edge-cases

Read the plan. List the inputs and states it touches ...
Score 0–10. Give one line for the score and one line for the biggest gap.
```

- A scorer runs when an artifact enters a stage that lists it in `scored-by`. The job's run ends with `fab score <scorer> --on <ref>`, or the monitor runs it after it sees the job end. It is a short agent run, in the same harness or a cheaper model.
- Scores are kept per artifact and per stage. A plan has an *edge cases* score in *Plan in review*. The slice that comes from it gets its own score in *Ready to build*. The history keeps both.
- The monitor shows the worst score on each artifact, the average on each stage, and a red mark on any cube under 5.
- A scorer does not stop work. It is information for people and for the next job. A team that wants a gate makes a decision, and the job's text says to stop when a score is low.
- Score records live on the machine that ran the scorer, in `~/.fab/scores/`. Sharing them needs the sync that Mark IV does not have.

### History

Because stages are filters, an artifact does not need an ID from fab. History is linked after the fact, from what fab can see:

| Link | How |
| --- | --- |
| **Run record** | The run that moved the artifact names what it worked `on` and what it wrote. That joins the two |
| **Branch name** | A draft PR and the ready PR on the same branch are the same work |
| **A link in the file** | A plan that names its roadmap line, or a slice heading in a plan |
| **Found** | The stage filter found it, and nothing links it further back. It was made outside fab |

The monitor's artifact sheet shows this trail, newest first, with the job, harness, person and scores at each step. It reads like a run trace in LangSmith, but for the work, not for one agent. A trail can stop early. That is expected for work that started before the fab.

### Decisions

Decisions are the places where a person keeps control. They are text in `fab.yaml`. The jobs that stop for them name them in `decides:`, and stages name who they wait for in `waits-for:`.

```yaml
decisions:
  whats-next:   { who: product lead, says: Pick what is next, in the prioritise conversation }
  plan:         { who: tech lead,    says: Approve the plan, as a docs PR }
  done:         { who: code owner,   says: Approve the PR }
  merge:        { who: code owner,   says: Merge the PR }
```

Metafab does not enforce them. They are drawn on the stages, and listed in `AGENTS.md`, so that every agent knows where it must stop and every person knows what they own.

### Runtimes

Most of a fab is the same in every harness. Four things are not:

| Operation | Orca | nodeterm | Plain Claude Code, Codex or Cursor |
| --- | --- | --- | --- |
| Open a worktree session | `orca worktree create --agent … --prompt …` | `open-worktree`, then `open-agent --group` | `git worktree add`, then start the session there |
| Start a sub-agent with a chosen model | The Agent tool | The Agent tool, or `open-agent --model` | The Agent tool |
| Wait for another session | `orca terminal wait` | `--after` | Run it in the foreground |
| Set up a new worktree | Orca setup script | worktree setup script | A `post_create` hook, or `fab install` by hand |

Jobs never name a harness. They say "open a worktree session for this slice". The runtime file for the current harness, installed into the session's standing instructions, says how. A new harness is one new file in `.fab/runtimes/`.

## The folder

```
.fab/
  fab.yaml                 name, stages, decisions, install targets, harness defaults
  AGENTS.md                the team's standing instructions; the source of the root AGENTS.md
  jobs/<name>/SKILL.md     how work moves
  scorers/<name>/SKILL.md  how work is judged
  skills/<name>/SKILL.md   know-how the jobs load
  rules/*.md               process rules for every session
  templates/*              plan.md, pr-body.md, intake.md ...
  runtimes/<harness>.md    orca.md, nodeterm.md, claude-code.md, codex.md, cursor.md, opencode.md
  scripts/                 optional project scripts that jobs call, such as next.mjs
```

A fab is a normal folder in the repository. It is reviewed in PRs, it has a Git history, and a change to the fab is a commit. **To share a factory, share this folder.** A template is a `.fab/` folder without the project's own skills and rules. `fab init --template` copies it in. The stage filters then find whatever the new repository already has. The person who installs it can change any part of it from then on.

## Install

`fab install` writes the files that each agent tool reads. Nothing outside `.fab/` is edited by hand.

| From | To | Committed? |
| --- | --- | --- |
| `.fab/jobs/*`, `.fab/scorers/*`, `.fab/skills/*` | Symlinks in `.claude/skills/<name>` and `.agents/skills/<name>` (Claude Code, Codex, and harnesses that read the same folders), and `.cursor/rules/` for Cursor | Yes |
| `.fab/AGENTS.md`, plus a jobs table, the stages, the decisions, and a short map | Root `AGENTS.md`, between `<!-- fab:start -->` and `<!-- fab:end -->` markers. Text outside the markers stays the team's own | Yes |
| Nothing | Root `CLAUDE.md` with `@AGENTS.md`, if it does not exist | Yes |
| `.fab/runtimes/<harness>.md` | `.claude/rules/fab-runtime.md` for Claude Code, and `AGENTS.override.md` for Codex | No, these are local to each worktree |

By default the install is committed, because the point is that the whole team has the same factory. `fab install --local` makes every link local and git-excluded, so one person can try a fab without changing the repository for anyone else. The Dragonfly factory used only the local mode. See [`research/dragonfly-factory.md`](research/dragonfly-factory.md) for why the default changed.

`fab check` fails when an installed file is out of date with `.fab/`. Run it in the pre-commit hook and in CI.

## The CLI

The `fab` CLI is for people and for agents. Every command has `--json`, and every command works without a terminal for input, so an agent can define and change a fab as easily as a person can. See [`cli.md`](cli.md).

- **Define:** `fab init`, `fab create stage|job|scorer|skill|rule|decision`, `fab list`, `fab show`, `fab map`.
- **Install:** `fab install`, `fab check`, `fab doctor`.
- **Work:** `fab work` runs the stage filters and lists what each stage holds. `fab history <ref>` prints an artifact's trail.
- **Run:** `fab run <job> [--on <ref>]` asks the job's inputs and starts a session in the chosen harness. `fab score <scorer> --on <ref>` scores one artifact.
- **Watch:** `fab status` lists the sessions that run in this fab on this machine, the job each one runs, and the artifact it is on.

`fab install` also installs a `fab` skill. It tells an agent how to use the CLI, and how to design a fab with a team: ask where work already lives, what stages it passes through, which jobs move it, where people decide, and what goes wrong today.

## The monitor

The fab monitor is a menu bar app with a panel that can float on top of other windows. It is a view over the CLI. It has no logic of its own. See [`monitor.md`](monitor.md).

- **Work.** One row per stage, in flow order. Each row is a bar of cubes, one per artifact, coloured by the agents on it. Open a stage to see its artifacts, scores and filter. Open an artifact to see who has agents on it, its scores, and its history. ▶ on a stage runs its next job.
- **Jobs.** Everything the fab can have an agent do. *Start something* (jobs with no `from`) and *Move work along* (each job as `from → to`, with how many artifacts wait for it).

### How the monitor knows what runs where

It reads what each harness already writes to disk. See [`research/agent-sessions.md`](research/agent-sessions.md).

- **Sessions that the monitor or `fab run` started** are exact. `fab run` writes a run record before it starts the session: the fab, the job, the artifact it is on, the inputs, the harness and the session ID. It also puts the run ID in the session's name, its branch, and the first line of its prompt.
- **Sessions a person started by hand** are a best guess. The folder gives the fab. The branch can give the artifact, because the stage filters know which branch a PR is on. The first prompt can name a job. A session with no match shows under "Not on any work". The monitor does not guess past what it can see.

## Toward Mark III

The parts of Mark IV are the parts a runner needs first: a fab in Git, stages that find the work, scorers that judge it, run records, and an adapter for each harness that can start a session and read its state. If a team later wants Metafab to start the next job on its own (for example, run *Review slice* on every PR that enters *Needs review*), the runner sits on top of these. Dispatch, the autonomy dial and rewind stay in [`../mk3/overview.md`](../mk3/overview.md) for that time.

## Limits and open questions

- **Harness files are internal.** The session files of Claude Code, Codex, Cursor and opencode are not documented APIs. Any update can change them. Keep one small adapter for each harness, and expect to fix it.
- **"Waits for you" is not reliable without hooks.** Claude Code writes a session status to disk. The others do not, so the monitor cannot always see that an agent waits for an answer.
- **Are stages always separate?** *Building* and *Needs review* both filter PRs, and only draft or ready splits them. Some fabs will want one artifact in two stages. `fab check` warns for now.
- **"Being worked" is not a stage.** While a job runs on an artifact, the artifact stays in its `from` stage until the job's output lands. The cube turns green. Is that clear enough?
- **Score a run, or an artifact?** Scores belong to an artifact in a stage. A job could also be scored as a run (how well did *Plan feature* do, over its last 20 runs?). That is the number that says which job to fix.
- **How far back can history go?** Run records, branch names and links in plans cover most of it. Work that changes shape (a roadmap line that becomes three slices) needs the plan to name its line.
- **Filter cost.** `prs` and `linear` sources call an API. `fab work` caches them, and the monitor refreshes them less often than files.
- **Team view.** Seeing teammates' agents and scores needs a sync between fab clients. The prototype previews it. Its design (a shared service, or records in Git) is open.
- **A plain CLI needs a terminal window.** Orca and nodeterm host their own terminals. For plain Claude Code or Codex, the monitor opens a window in the person's terminal app. Cursor runs in its own window.
- **nodeterm cannot be started from outside.** The monitor can see nodeterm's agents, but it cannot start one there yet.
- **Non-technical people still need a harness**, installed and signed in. A cloud runner could remove this later.
- **Cursor is not researched yet.** Confirm where it keeps agent sessions, whether one can be started from outside with a prompt, and which folders it reads skills and rules from. See [`research/agent-sessions.md`](research/agent-sessions.md).
- **Committed links.** Symlinks in `.claude/skills/` work on macOS and Linux. Windows needs Git's symlink support turned on, or a copy mode.
- **Names.** "Job" replaces "program", because it reads better to people who do not write code. "Fab" is the project's factory, and Metafab is the product. "Stage" and "artifact" stay from Mark II.

## What changed from Mark III

| Mark III | Mark IV |
| --- | --- |
| Metafab runs every program, dispatches work and holds items at gates | Agents run jobs in their own harness. Metafab describes, installs, shows and starts |
| `.metafab/` with `metafab.yaml` as an executable workflow | `.fab/` with `fab.yaml` as a description: stages, decisions, install targets |
| Programs have typed inputs and outputs, connected by wires | Jobs move work from one stage to the next. Inputs are questions for a form |
| Items exist only once Metafab makes them | Stages are filters. Work made before or outside fab shows in its stage |
| Gates hold items until a person or agent decides | Decisions are written down, drawn on the stages, and followed by the jobs' text |
| Scorers mark every output, and can gate | Scorers mark artifacts as they enter a stage. They inform. They do not gate |
| Items move as balls with a full history and can rewind | History is linked from run records, branches and links in files. No rewind |
| A large canvas app is the main view | A small monitor shows where the work is and starts jobs. The repo is the main view |
| The value comes after the team moves its work into Metafab | The value comes on the first `fab install`, in the tools the team already uses |
