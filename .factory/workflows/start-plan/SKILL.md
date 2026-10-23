---
name: start-plan
description: Picks the next ready plan in docs/roadmap.md order, gets the person's approval, and opens one worktree session per approved plan that starts build-plan there. It also answers what is ready, blocked, and in flight. It never builds a plan in the current session. Use it on main for "start the next plan", "pull the next chunk", "start <plan>", or "what's ready".
---

# start-plan

Pick work and open it somewhere else. Do not build the plans in this session. One plan is one pull request.

## 1. Read the state

Run these commands, in parallel where possible:

```bash
git fetch origin
git branch --show-current && git status --short
node .factory/scripts/next.mjs --ref origin/main   # ready, blocked, and in-flight plans, in roadmap order
```

If the request names a plan, pull request, or roadmap line, read it first. For "what's ready" or "what's in flight", answer from this output and stop.

## 2. Propose

1. Propose the first ready plan. If the person asks for more than one, propose the first set whose `owns` paths do not overlap.
2. For each, show its title, its roadmap line, any branch it is stacked on, and any open question in `docs/roadmap.md` that blocks it.
3. If a roadmap line has no plan, offer `plan-feature`.
4. If nothing is ready, say why (from the blocked list) and offer `prioritise-roadmap`. Do not pick work yourself.
5. If the person names an urgent bug, put it first. It still needs a bug plan, which `file-work` creates.
6. Wait for the person to approve. Do not open a worktree before they approve.

## 3. Open one worktree per approved plan

- Name the branch `<type>/<plan-slug-without-number>`. Take the type from the plan's title.
- Base it on `origin/main`, unless the plan needs a plan that has not merged. Then base it on that plan's branch.
- If the session has a worktree tool through `manage-nodeterm-canvas` or `orca-cli`, use it.
- Without one, run `git worktree add ../meta-harness-<branch-with-slashes-as-dashes> -b <branch> <base>`, then show the person the `cd` and `claude` commands that start the session.
- The skill links and the `AGENTS.md` block are committed, so the worktree needs no install step. If the plan's code needs dependencies, the new session runs `npm install` first.
- Start the new session with: `Load the build-plan workflow and build docs/plans/<plan>.md.`

Report each worktree and where it is.
