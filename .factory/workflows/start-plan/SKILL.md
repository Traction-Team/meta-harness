---
name: start-plan
description: The orchestrator. It cuts the ready plans in docs/roadmap.md order into waves whose owns paths do not collide, gets the person's approval, proves main green once, and starts one worker per plan, which runs build-plan on the plan's branch, as a new Amp thread in its own orb when it runs in Amp, otherwise an OpenCode worker in its own Orca worktree. It does not watch the pull requests; on its next run it removes the worktree of each merged plan and cuts the next wave. It also answers what is ready, blocked, and in flight. It never builds, marks ready, or merges. Use it on main for "start the next plan", "pull the next chunk", "keep going", "run the queue", "start <plan>", or "what's ready".
---

# start-plan

Cut the work and hand it out. Do not build a plan in this session. Every build happens in the worktree of a worker, under `build-plan`. One plan is one pull request, one branch and one worker.

A **wave** is the set of plans that go out in parallel at one time. Every plan in a wave runs beside the others, so no two may name the same path in `owns`. A wave holds four plans, five at the most. The next wave starts when a merge unblocks new plans.

**Never** merge a pull request, mark one ready, or write the landing commit. A person merges. `build-plan` writes the landing bookkeeping on the plan's own branch before it hands over, and `finish-plan` keeps it current.

## 0. Guards

Stop if any of these fail:

- The branch is `main` (`git branch --show-current`).
- The working tree is clean (`git status --porcelain`). Ignore this only when the person says so.
- `main` carries no commit `origin/main` never saw:

  ```bash
  git fetch origin
  git rev-list --left-right --count origin/main...main   # the second number must be 0
  ```

These checks are fast and read-only. The green gate is slow, so it waits for step 3, after the person approves the waves.

## 1. Read the state

```bash
node .factory/scripts/next.mjs --ref origin/main --json   # ready, blocked and in-flight plans, in roadmap order
```

`next.mjs` reads open pull requests through `gh`. A draft pull request whose first line is `**Plan:** docs/plans/<plan>.md` is the claim, so a plan a worker holds is in flight, not ready. If the request names a plan, pull request or roadmap line, read it first. For "what's ready" or "what's in flight", answer from this output and stop.

## 2. Cut the waves, then propose

1. **Wave A** is the ready plans, in roadmap order, that do not collide: no two share a path in `owns` (treat `a/b/**` as covering `a/b/c.ts`). Take at most four, five at the most. Leave out a ready plan that collides with an earlier one; it goes in the next wave.
2. **Later waves** come from the blocked list. Name the plans each merge in wave A unblocks, in the order the merges let them run: wave B, then C. Later waves are a forecast; step 4 recuts them from `next.mjs` after each merge.
3. Label each plan with its wave letter and a number: `A1`, `A2`, then `B1`. Use roadmap order. This label is the handle the person uses to approve, move or drop a plan.
4. For each plan, show its label, title, roadmap line, the branch it is stacked on (if any), and any open question in `docs/roadmap.md` that blocks it.
5. Name every ready plan you left out, and why.
6. If a roadmap line has no plan, offer `plan-feature`. If nothing is ready, say why (from the blocked list) and offer `prioritise-roadmap`. Do not pick work yourself.
7. If the person names an urgent bug, put it first. It still needs a bug plan, which `file-work` creates.

Stop and wait. The person may cut a wave, move a plan, or drop one, and the waves change on their word. Do not run the gate or start a worker until they approve.

## 3. Prove `main` green, then start the workers

Run the gate once, here, for the whole wave:

```bash
npm install && npm run verify
```

Skip this when `origin/main` has no `package.json` (before plan 1.001 merges), and say so. A red gate stops the run: fix `main` on a branch of its own, then start again. Every worker branches from this same `origin/main`, so `build-plan` does not take a baseline of its own.

Then start one worker per approved plan in wave A. How depends on where this session runs:

- **Amp** (`AMP_THREAD_ID` is set, or you have the `create_thread` tool): follow *In Amp* below.
- **Orca and OpenCode** (otherwise): follow *With Orca* below.

Either way, the brief is the first thing the worker reads, so write it for a session with no other context. Name the plan and nothing about how to build it. The worker reads the plan itself.

**Do not follow a worker.** Do not open its worktree or thread and do not read its terminal or transcript to see how it is going. Its fresh context is the reason it builds the plan well.

### In Amp

Each worker is a new Amp thread in its own orb. A fresh orb checks out the project's default branch and runs `.agents/setup`, which installs dependencies, builds `dist/` and installs these workflows as skills. So the worker starts on `main` with nothing to set up, and it creates the plan's branch itself.

Call `create_thread` once per approved plan, all in one turn:

- `executor`: `orb`. Leave `project` unset (it defaults to this one) and `agent_mode` as this thread's mode.
- `intent`: `parallel-work`. `title`: `<label> <plan-file-stem>`, such as `A1 1.020-cli-fixes`.
- `prompt`: the brief below.

```text
You are the worker for docs/plans/<plan>.md (<label>), in your own Amp orb.
Create the plan's branch first: git fetch origin && git switch -c <type>/<plan-file-stem> <base>
Then load the build-plan workflow and build docs/plans/<plan>.md on that branch.
<Stacked on <branch> (#<pr>).> main was proved green at <sha>; do not re-run the baseline.
Dispatch sub-agents with the Task tool. Do the work in this thread; do not create other threads.
End with build-plan's TL;DR as your final message.
```

`<base>` is `origin/main`, or `origin/<branch below>` for a stacked plan. Take the type from the plan's title.

Do not ask the workers to reply to this thread and do not wait for them: each worker's TL;DR is in its own thread, where the developer reviews it. Keep each thread URL; step 6 reports them.

### With Orca

```bash
orca worktree create --name <type>/<plan-file-stem> \
  --repo id:ea0f45bd-7c49-42b2-9fb8-1c280896e7c4 \
  --base-branch <base> --no-parent --setup run \
  --agent opencode --prompt "<brief>" --json
```

- **`--repo` is required.** Without it, Orca infers the repo from the caller's worktree, and a plain checkout infers nothing or the wrong repo. `orca repo list --json` prints the id; `name:MetaFab` resolves to the same repo.
- **`--base-branch`** is `origin/main`. For a plan stacked on an unmerged plan, it is `origin/<that plan's branch>`. Always use the remote ref: Orca records it as the worktree's base, and the Orca board can only rebase against a remote ref.
- **`--name`** sets the display name, and Orca derives the branch from it. It flattens the slash and adds the git user, so `--name feat/1.005-check` gives the branch `sebastiankade/feat-1.005-check`. There is no flag for the branch. The worker renames it to `<type>/<plan-file-stem>` (the plan file name without `.md`, so the branch carries the plan number, as in `feat/1.005-check`) in `build-plan` step 0, before the claim. Take the type from the plan's title.
- **`--agent opencode`** always. Do not override the agent or its model. The repo's `opencode.json` defines the sub-agents the worker dispatches.
- **`--setup run`** runs the repo's setup hook in the new checkout. `--no-parent` is deliberate: each plan is independent work.

The brief:

```text
You are the worker for docs/plans/<plan>.md (<label>), in its own Orca worktree.
Load the build-plan workflow and build docs/plans/<plan>.md. You are the worker:
step 0 renames this branch to <type>/<plan-file-stem> before the claim.
<Stacked on <branch> (#<pr>).> main was proved green at <sha>; do not re-run the baseline.
Dispatch every sub-agent with subagent_type "agent-coding", even though the Agent
tool's list does not show it. The call works.
```

From the JSON, keep `result.path` and `result.agentTerminalHandle` (an older runtime returns only `result.startupTerminal.handle`). Step 6 reports both.

#### Without Orca

Use this only when `orca` is not installed:

```bash
git worktree add ../meta-harness-<branch-with-slashes-as-dashes> -b <branch> <base>
```

Show the person the `cd` and agent commands that start the session, with the brief above. Say in the report that no setup hook ran and that the Orca board cannot see the worktree.

### Then

When the workers are started, go to step 6 and report. Do not watch the pull requests: the worker opens a merge-safe draft and hands the developer a TL;DR, the developer reviews it (with `finish-plan` for feedback), and a person merges. The next run of `start-plan` picks up from origin.

## 4. Clean up merged plans

On a later run ("keep going", "start the next plan"), first find the workers from earlier waves whose pull requests have left the open set. Origin is the record:

```bash
orca worktree list   # Orca only; in Amp, take the branches from the plans you sent
gh pr list --head <branch> --state all --json number,state --jq '.[0] // empty | "\(.state) #\(.number)"'
```

`build-plan` already wrote the landing commit on the branch, so the merge leaves nothing to write on `main`. For each merged pull request:

1. `git switch main && git pull --ff-only`.
2. Check that the plan reads `status: merged` and its roadmap box is ticked on `main`. If either is missing, tell the person and offer to write the landing as a docs-only commit on `main` (`docs: land <plan-slug>`, as build-plan step 8 describes); write it only when they agree.
3. In Amp there is nothing to remove: the worker's orb belongs to its thread. Offer to archive the worker thread. With Orca, remove the worktree:

   ```bash
   orca worktree list
   orca worktree rm --worktree name:<type>/<plan-file-stem>
   ```

   `--force` is for a tree the worker left dirty. Say so when you use it.

A pull request closed without merging keeps its branch on origin. Report it and stop there. Whether the plan goes back on the queue is the person's call.

Then cut the next wave from step 1. A merge moves plans out of the blocked list. A new draft can too: `next.mjs` lists a plan whose `needs` is building as ready, stacked on that branch. Plans the person already approved in a forecast wave still need one line of confirmation if the cut changed.

## 5. Stop

Stop once the wave's workers are started, when nothing is ready, when every remaining plan is blocked by one in flight, or when the person says so. Say which one stopped you.

## 6. Report

1. The waves you sent. Per plan: its label, the branch, the title, and the base it branched from.
2. Each ready plan you left out, and why.
3. For every worker you started: its thread URL (Amp), or its worktree path and terminal handle (Orca).
4. Each merge you cleaned up: the plan, the pull request, and the worktree you removed.
5. Each pull request closed without merging, and the branch it left on origin.
6. What stopped the run.
7. What happens next: each worker opens a merge-safe draft pull request and ends with a TL;DR in its thread or session; the developer reviews it there, gives feedback or says "looks good", a person merges, and then `start-plan` runs again.
