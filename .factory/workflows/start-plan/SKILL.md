---
name: start-plan
description: The orchestrator. It reads the ready plans from the roadmap and cuts them into waves whose owns paths do not collide when stacking is off, or into stacked chains when stacking is on, gets the person's approval, proves the trunk green once with setup then verify, and starts one worker per plan, which runs build-plan on the plan's branch, as a new Amp thread in its own orb when the session is in Amp, otherwise an agent in its own Orca worktree or a plain git worktree. It does not watch the pull requests; on its next run it removes the worktree of each merged plan, or offers to archive the Amp thread, and cuts the next wave. It also answers what is ready, blocked and in flight. It never builds, marks ready, or merges. Use it on the trunk for "start the next plan", "pull the next chunk", "keep going", "run the queue", "start <plan>", or "what's ready".
---

# start-plan

Cut the work and hand it out. Do not build a plan in this session. Every build happens in the workspace of a worker, under `build-plan`. One plan is one pull request, one branch and one worker.

A **wave** is the set of plans that go out in parallel at one time. Every plan in a wave runs beside the others, so no two may name the same path in `owns`. A wave holds four plans, five at the most. The next wave starts when a merge unblocks new plans.

With `stacking` on there are **chains** instead: a plan whose `needs` has not merged is ready, and it is built on the need's branch. The chain goes out in one go, in stack order. Step 2 says how the two shapes differ.

**Never** merge a pull request, mark one ready, or write the landing commit. A person merges. `build-plan` writes the landing bookkeeping on the plan's own branch before it hands over, and `finish-plan` keeps it current.

The settings are read from `docs/factory.md`: `trunk`, `verify`, `setup`, `agent`, `orca-repo`, `stacking`, `plans` and `roadmap`.

## 0. Guards

Stop if any of these fail:

- The branch is `trunk` (`git branch --show-current`).
- The working tree is clean (`git status --porcelain`). Ignore this only when the person says so.
- `trunk` carries no commit `origin/<trunk>` never saw:

  ```bash
  git fetch origin
  git rev-list --left-right --count origin/<trunk>...<trunk>   # the second number must be 0
  ```

These checks are fast and read-only. The green gate is slow, so it waits for step 3, after the person approves the work.

## 1. Read the state

```bash
node .factory/scripts/next.mjs --ref origin/<trunk> --json   # ready, blocked and in-flight plans, in roadmap order
```

`next.mjs` reads open pull requests through `gh`. A draft pull request whose first line is `**Plan:** <plans>/<plan>.md` is the claim, so a plan a worker holds is in flight, not ready. If the request names a plan, pull request or roadmap line, read it first. For "what's ready" or "what's in flight", answer from this output and stop.

With `stacking` on, a ready plan whose `needs` is still building carries the branch it stacks on as `stackedOn`, and that is the branch its worker starts from. A plan whose parent pull request has merged but whose branch is not restacked needs `finish-plan`'s restack in its own workspace: name it and stop there for that plan.

## 2. Cut the work, then propose

**2a. Waves, when `stacking` is `off`.**

1. **Wave A** is the ready plans, in roadmap order, that do not collide: no two share a path in `owns` (treat `a/b/**` as covering `a/b/c.ts`). Take at most four, five at the most. Leave out a ready plan that collides with an earlier one; it goes in the next wave.
2. **Later waves** come from the blocked list. Name the plans each merge in wave A unblocks, in the order the merges let them run: wave B, then C. Later waves are a forecast; step 4 recuts them from `next.mjs` after each merge.
3. Label each plan with its wave letter and a number: `A1`, `A2`, then `B1`. Use roadmap order. This label is the handle the person uses to approve, move or drop a plan.
4. For each plan, show its label, title, roadmap line, and any open question in the roadmap that blocks it.
5. Name every ready plan you left out, and why.
6. If a roadmap line has no plan, offer `plan-feature`. If nothing is ready, say why (from the blocked list) and offer `prioritise-roadmap`. Do not pick work yourself.
7. If the person names an urgent bug, put it first. It still needs a bug plan, which `file-work` creates.

**2b. Chains, when `stacking` is `on`.**

1. Propose the first ready plan, or the plans the person named, in roadmap order. A plan whose `needs` is still building is ready: it goes out stacked on that plan's branch.
2. A chain goes out together, in stack order. Each plan's base is the branch of the plan below it, or `origin/<trunk>` at the bottom. Label the chain's plans `A1`, `A2` and so on, bottom first.
3. Each worker claims its plan with a draft pull request before it builds. A stacked worker then waits for the parent's draft and is woken by the parent's worker; `build-plan` says how. Tell the person that plainly: the chain starts now, and each plan begins when the one below hands over.
4. Two unmerged needs on separate branches still block the plan, because a branch has one base. Say which two, and that all but one must merge first.
5. Linking the chain as a host stack is `build-plan`'s step 1a, with the `stacked-prs` skill. Do not link it here.
6. The rest of 2a holds: show the title and roadmap line for each plan, name what you left out, offer `plan-feature` for a line with no plan, and never pick work yourself.

Learning the state of a chain: once the bottom draft is pushed, `next.mjs` lists the next plan as ready, stacked on it. Do not open a chain twice.

Stop and wait. The person may cut a wave or chain, move a plan, or drop one, and it changes on their word. Do not run the gate or start a worker until they approve.

## 3. Prove `trunk` green, then start the workers

Run the gate once, here, for the whole wave or chain:

```bash
<setup> && <verify>
```

`setup` is the command a new workspace runs before its first check. When it is empty, run the repository's install command from its README, and say which command you ran. A red gate stops the run: fix `trunk` on a branch of its own, then start again. Every worker branches from this same `origin/<trunk>`, so `build-plan` does not take a baseline of its own.

Then start one worker per approved plan. How depends on where this session runs:

- **Amp** (`AMP_THREAD_ID` is set, or you have the `create_thread` tool): follow *In Amp* below.
- **Orca and OpenCode** (otherwise): follow *With Orca* below.

Either way, the brief is the first thing the worker reads, so write it for a session with no other context. Name the plan and nothing about how to build it. The worker reads the plan itself.

**Do not follow a worker.** Do not open its workspace or thread and do not read its terminal or transcript to see how it is going. Its fresh context is the reason it builds the plan well.

### In Amp

Each worker is a new Amp thread in its own orb. A fresh orb checks out the repository's default branch and runs the repository's orb setup script when it has one, so the worker starts on `trunk` with the skills installed and nothing to set up, and it creates the plan's branch itself.

Call `create_thread` once per approved plan, all in one turn:

- `executor`: `orb`. Leave `project` unset (it defaults to this one) and `agent_mode` as this thread's mode.
- `intent`: `parallel-work`. `title`: `<label> <plan-file-stem>`, such as `A1 1.020-cli-fixes`.
- `prompt`: the brief below.

```text
You are the worker for <plans>/<plan>.md (<label>), in your own Amp orb.
Create the plan's branch first: git fetch origin && git switch -c <type>/<plan-file-stem> <base>
Then load the build-plan workflow and build <plans>/<plan>.md on that branch.
<Stacked on <branch> (#<pr>).> The trunk was proved green at <sha>; do not re-run the baseline.
Start every sub-agent as its own thread, as build-plan's *Sub-agents in Amp* says; create no other threads.
End with build-plan's TL;DR as your final message.
```

`<base>` is `origin/<trunk>`, or `origin/<branch below>` for a stacked plan. The plan's stem is its file name without `.md`; take the type from the plan's title.

`create_thread` nests each worker under this thread. Once the workers are started, move each one to the top level with `update_thread` (`thread`: the worker's thread, `parent_thread: null`; it is in the `amp` module, through `code_exec`), one call per worker, so every plan sits in the thread list on its own. Leave the workers' own sub-agent threads nested under their worker.

Do not ask the workers to reply to this thread and do not wait for them: each worker's TL;DR is in its own thread, where the developer reviews it. Keep each thread URL; step 6 reports them.

### With Orca

```bash
orca worktree create --name <type>/<plan-file-stem> \
  --repo <orca-repo> \
  --base-branch <base> --no-parent --setup run \
  --agent <agent> --prompt "<brief>" --json
```

- **`--repo` is `orca-repo`.** It is required, because Orca otherwise infers the repository from the caller's worktree, and a plain checkout infers nothing or the wrong one. When `orca-repo` is empty, use the fallback below.
- **`--base-branch`** is `origin/<trunk>`, or `origin/<branch below>` for a stacked plan. Always use the remote ref: Orca records it as the worktree's base, and the Orca board can only rebase against a remote ref.
- **`--name`** sets the display name, and Orca derives the branch from it: it flattens the slash and adds the git user, so `--name feat/1.005-check` gives the branch `<git user>/feat-1.005-check`. There is no flag for the branch. The worker renames it to `<type>/<plan-file-stem>` in `build-plan` step 0, before the claim.
- **`--agent`** is the `agent` setting. When it is empty, ask the `agent-harnesses` skill to detect one. Do not override the agent.
- **`--setup run`** runs the repository's setup hook in the new checkout. `--no-parent` is deliberate: each plan is independent work.

The brief:

```text
You are the worker for <plans>/<plan>.md (<label>), in its own Orca worktree.
Load the build-plan workflow and build <plans>/<plan>.md. You are the worker:
step 0 renames this branch to <type>/<plan-file-stem> before the claim.
<Stacked on <branch> (#<pr>).> The trunk was proved green at <sha>; do not re-run the baseline.
Dispatch every task and fix sub-agent with subagent_type "<sub-agent-coding>" and
every review sub-agent with subagent_type "<sub-agent-review>", even though the
Agent tool's list does not show them. The calls work.
```

From the JSON, keep `result.path` and `result.agentTerminalHandle` (an older runtime returns only `result.startupTerminal.handle`). Step 6 reports both.

#### Without Orca

Use this when `orca-repo` is empty or `orca` is not installed:

```bash
git worktree add ../<repository directory name>-<branch with / as -> -b <branch> <base>
```

The path is derived, with no setting: the repository directory's name, a dash, then the branch with every `/` turned into `-`. Run the `setup` command in the new worktree, then show the person the `cd` and the agent command that starts the session, with the brief above. Say in the report that no setup hook ran and that the Orca board cannot see the worktree.

### Then

When the workers are started, go to step 6 and report. Do not watch the pull requests: the worker opens a merge-safe draft and hands the developer a TL;DR, the developer reviews it (with `finish-plan` for feedback), and a person merges. The next run of `start-plan` picks up from origin.

## 4. Clean up merged plans

On a later run ("keep going", "start the next plan"), first find the workers from earlier waves whose pull requests have left the open set. Origin is the record:

```bash
orca worktree list   # Orca only; in Amp, take the branches from the plans you sent
gh pr list --head <branch> --state all --json number,state --jq '.[0] // empty | "\(.state) #\(.number)"'
```

`build-plan` already wrote the landing commit on the branch, so the merge leaves nothing to write on `trunk`. For each merged pull request:

1. `git switch <trunk> && git pull --ff-only`.
2. Check that the plan reads `status: merged` and its roadmap box is ticked on `trunk`. If either is missing, tell the person and offer to write the landing as a docs-only commit on `trunk` (`docs: land <plan-slug>`, as `build-plan` step 8 describes); write it only when they agree.
3. In Amp there is nothing to remove: the worker's orb belongs to its thread, so offer to `archive` the worker thread. With Orca, remove the worktree, and offer to `archive` the thread too when the same plan was built in Amp:

   ```bash
   orca worktree list
   orca worktree rm --worktree name:<type>/<plan-file-stem>
   ```

   `--force` is for a tree the worker left dirty. Say so when you use it.

A pull request closed without merging keeps its branch on origin. Report it and stop there. Whether the plan goes back on the queue is the person's call.

Then cut the next wave or chain from step 1. A merge moves plans out of the blocked list. With `stacking` on, a merge also restacks what was stacked on it, so name each plan whose restack `finish-plan` still owes. Plans the person already approved in a forecast wave still need one line of confirmation if the cut changed.

## 5. Stop

Stop once the workers are started, when nothing is ready, when every remaining plan is blocked by one in flight, or when the person says so. Say which one stopped you.

## 6. Report

1. The waves or chains you sent. Per plan: its label, the branch, the title, and the base it branched from.
2. Each ready plan you left out, and why.
3. For every worker you started: its thread URL (Amp), or its worktree path and terminal handle (Orca).
4. Each merge you cleaned up: the plan, the pull request, and the worktree you removed or the thread you archived.
5. Each pull request closed without merging, and the branch it left on origin.
6. What stopped the run.
7. What happens next: each worker opens a merge-safe draft pull request and ends with a TL;DR in its thread or session; the developer reviews it there, gives feedback or says "looks good", a person merges, and then `start-plan` runs again.
