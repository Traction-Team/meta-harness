---
name: start-plan
description: The orchestrator. It cuts the ready plans in docs/roadmap.md order into waves whose owns paths do not collide, gets the person's approval, proves main green once, and starts one OpenCode worker per plan in its own Orca worktree, which runs build-plan there. It watches the pull requests, removes the worktree of each merged plan, and goes again. It also answers what is ready, blocked, and in flight. It never builds, marks ready, or merges. Use it on main for "start the next plan", "pull the next chunk", "keep going", "run the queue", "start <plan>", or "what's ready".
---

# start-plan

Cut the work and hand it out. Do not build a plan in this session. Every build happens in the worktree of a worker, under `build-plan`. One plan is one pull request, one branch and one worker.

A **wave** is the set of plans that go out in parallel at one time. Every plan in a wave runs beside the others, so no two may name the same path in `owns`. A wave holds four plans, five at the most. The next wave starts when a merge unblocks new plans.

**Never** merge a pull request, mark one ready, or write the landing commit. A person merges. `finish-plan` writes the landing bookkeeping on the plan's own branch.

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
2. **Later waves** come from the blocked list. Name the plans each merge in wave A unblocks, in the order the merges let them run: wave B, then C. Later waves are a forecast; step 6 recuts them from `next.mjs` after each merge.
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

Skip this when `origin/main` has no `package.json` (before plan 01 merges), and say so. A red gate stops the run: fix `main` on a branch of its own, then start again. Every worker branches from this same `origin/main`, so `build-plan` does not take a baseline of its own.

Then start one worker per approved plan in wave A:

```bash
orca worktree create --name <type>/<plan-slug-without-number> \
  --repo id:ea0f45bd-7c49-42b2-9fb8-1c280896e7c4 \
  --base-branch <base> --no-parent --setup run \
  --agent opencode --prompt "<brief>" --json
```

- **`--repo` is required.** Without it, Orca infers the repo from the caller's worktree, and a plain checkout infers nothing or the wrong repo. `orca repo list --json` prints the id; `name:MetaFab` resolves to the same repo.
- **`--base-branch`** is `origin/main`. For a plan stacked on an unmerged plan, it is `origin/<that plan's branch>`. Always use the remote ref: Orca records it as the worktree's base, and the Orca board can only rebase against a remote ref.
- **`--name`** sets the display name, and Orca derives the branch from it. It flattens the slash and adds the git user, so `--name chore/foundation` gives the branch `sebastiankade/chore-foundation`. There is no flag for the branch. The worker renames it to `<type>/<plan-slug-without-number>` in `build-plan` step 0, before the claim. Take the type from the plan's title.
- **`--agent opencode`** always. Do not override the agent or its model. The repo's `opencode.json` defines the sub-agents the worker dispatches.
- **`--setup run`** runs the repo's setup hook in the new checkout. `--no-parent` is deliberate: each plan is independent work.

The brief is the first thing the worker reads, so write it for a session with no other context:

```text
You are the worker for docs/plans/<plan>.md (<label>), in its own Orca worktree.
Load the build-plan workflow and build docs/plans/<plan>.md. You are the worker:
step 0 renames this branch to <type>/<plan-slug-without-number> before the claim.
<Stacked on <branch> (#<pr>).> main was proved green at <sha>; do not re-run the baseline.
Dispatch every sub-agent with subagent_type "agent-coding", even though the Agent
tool's list does not show it. The call works.
```

Name the plan and nothing about how to build it. The worker reads the plan itself.

From the JSON, keep `result.path` and `result.agentTerminalHandle` (an older runtime returns only `result.startupTerminal.handle`). Step 7 reports both.

**Do not follow a worker.** Do not `cd` into its worktree and do not read its terminal to see how it is going. Its fresh context is the reason it builds the plan well.

### Without Orca

Use this only when `orca` is not installed:

```bash
git worktree add ../meta-harness-<branch-with-slashes-as-dashes> -b <branch> <base>
```

Show the person the `cd` and agent commands that start the session, with the brief above. Say in the report that no setup hook ran and that the Orca board cannot see the worktree.

## 4. Watch the pull requests

Each worker opens a draft pull request when it claims its plan. Run one monitor for the wave, with the `Monitor` tool and `persistent: true`:

```bash
seen=$(mktemp)
branches="chore/foundation feat/factory-model"
while [ -n "$branches" ]; do
  next=""
  for b in $branches; do
    st=$(gh pr list --head "$b" --state all --json number,state,isDraft \
         --jq '.[0] // empty | "\(.state)\(if .isDraft then " draft" else "" end) #\(.number)"' 2>/dev/null)
    prev=$(grep "^$b " "$seen" 2>/dev/null | cut -d' ' -f2-)
    if [ -n "$st" ] && [ "$st" != "$prev" ]; then
      echo "$b $st"
      { grep -v "^$b " "$seen" 2>/dev/null; echo "$b $st"; } > "$seen.tmp"; mv "$seen.tmp" "$seen"
    fi
    case "$st" in MERGED*|CLOSED*) ;; *) next="$next $b" ;; esac
  done
  branches=$(echo $next)
  [ -n "$branches" ] || break
  sleep 60
done
echo "wave done: every branch has left the open set"
```

It reports each state change once: a draft that appears, a draft marked ready, a merge, a close. Tell the person about each one. A draft is the worker asking the developer to run `finish-plan`, and a ready pull request is waiting for a person to merge it.

**The monitor is a convenience. Origin is the record.** A monitor dies with the session that started it, without a marker, so silence never proves anything. Read the state from `gh` at the start of every turn that acts on the wave:

```bash
for b in $branches; do printf '%-36s ' "$b"; gh pr list --head "$b" --state all --json number,state,isDraft --jq '.[0] // empty | "\(.state) draft=\(.isDraft) #\(.number)"'; echo; done
```

## 5. After each merge

`finish-plan` already wrote the landing commit on the branch, so the merge leaves nothing to write on `main`. For each merged pull request:

1. `git switch main && git pull --ff-only`.
2. Check that the plan reads `status: merged` and its roadmap box is ticked on `main`. If either is missing, tell the person; do not fix it here.
3. Remove the worktree:

   ```bash
   orca worktree list
   orca worktree rm --worktree name:<type>/<plan-slug-without-number>
   ```

   `--force` is for a tree the worker left dirty. Say so when you use it.

A pull request closed without merging keeps its branch on origin. Report it and stop there. Whether the plan goes back on the queue is the person's call.

## 6. Go again, or stop

A merge moves plans out of the blocked list. A new draft can too: `next.mjs` lists a plan whose `needs` is building as ready, stacked on that branch. Go back to step 1 and cut the next wave from `next.mjs`. Plans the person already approved in a forecast wave still need one line of confirmation if the cut changed.

Stop when nothing is ready, when every remaining plan is blocked by one in flight, or when the person says so. Say which one stopped you.

## 7. Report

1. The waves you sent. Per plan: its label, the branch, the title, and the base it branched from.
2. Each ready plan you left out, and why.
3. The worktree path and terminal handle of every worker still running.
4. Each merge: the plan, the pull request, and the worktree you removed.
5. Each pull request closed without merging, and the branch it left on origin.
6. What stopped the run.
