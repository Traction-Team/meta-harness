Read `docs/factory.md` first. It holds this repository's settings. Every workflow and script reads it, and a branch, command or path written as a setting name means that setting's value: `trunk`, `verify`, `specs`, `plans`, `roadmap`.

The whole process is in [.factory/docs/process.md](.factory/docs/process.md): the words, the pipeline, claims, landing, stacking, features and releases.

## Rules

- **One plan, one pull request.** Change only the paths in the plan's `owns`. Widen `owns` in the plan when you must, and say why in the pull request.
- **A pull request that claims a plan changes only through `build-plan`, then through `finish-plan` once it is handed over.** Its first body line is `**Plan:** <plans>/<plan>.md`. `build-plan` owns the branch from the claim to the handoff, a merge-safe draft pull request and a TL;DR. After the handoff, feedback, fixes, review comments, restacks, "looks good" and "land it" all go through `finish-plan`, in this session or any other, because every push refreshes the landing commit and the TL;DR.
- **Specs first.** When `specs` names a directory, the specs in it are the acceptance standard for every change. When the code has to differ from a spec, change the spec in the same pull request and say so in its body. Never let them drift. When `specs` is empty, the spec steps in the workflows are skipped.
- **Conventional Commits, with no scope:** `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `ci`, `build`. A branch is `<type>/<slug>`. A plan's branch carries the plan file's stem: `feat/1.005-check` for `<plans>/1.005-check.md`, `feat/2026-11-02-onb-2-second` for a dated plan.
- **Code reaches `trunk` only through a pull request.** The `trunk` setting names that branch.
- **`.factory/scripts/` is code.** A change to it goes in a pull request, never straight to `trunk`.
- **Sub-agents.** Start task and fix sub-agents as `subagent_type: "<sub-agent-coding>"`, reviews as `subagent_type: "<sub-agent-review>"`, planning as `subagent_type: "<sub-agent-planning>"`. The values come from `docs/factory.md`; `opencode.json` defines them. The opencode-claude-bridge plugin replaces the Agent tool's list with Claude Code's built-ins (`general-purpose`, `Explore`, `Plan`), so those names may not appear: call them anyway, they run. Fall back to `general-purpose` only when the call fails with an unknown-agent error, and say so in one line. In Amp, each sub-agent is a separate thread; the workflows say how. How each harness starts a session or a sub-agent is in the `agent-harnesses` skill.

## Factory workflows

Delivery work runs through these workflows. Each is installed as a skill. When a request matches a row, load that workflow and follow it; do not do the work freehand. If two rows match, say which you chose and why in one line. If none matches, answer directly.

| Workflow | When to run it |
|---|---|
| `file-work` | A bug, idea, feedback, follow-up, spec gap, or any "we should...". Also every tooling problem and existing bug a build found, before its pull request merges |
| `prioritise-roadmap` | "What's next", re-ordering the roadmap, reviewing intake or open questions |
| `plan-feature` | "Plan <thing>", a roadmap line with no plan, or a bug too big for a bug plan |
| `review-plan` | After writing plans, always in a new sub-agent. "Cold review this plan", "poke holes in this plan" |
| `start-plan` | On `trunk`: "start the next plan", "pull the next chunk", "keep going", "what's ready". The orchestrator: one worker per plan, as a new Amp thread in its own orb, or an Orca worktree and OpenCode worker |
| `build-plan` | On a feature branch, usually as a worker in its own Amp thread or Orca worktree: "build docs/plans/<plan>.md". Stops at a merge-safe draft pull request and a TL;DR |
| `review-branch` | After any implementation, always in a new sub-agent. "Cold review this branch" |
| `finish-plan` | On a plan's branch, after the TL;DR: testing feedback, "looks good", review comments, "land it" |
| `release` | Only when the `release` setting is `on`: "release", "deploy", "ship a hotfix". Standalone, so the pipeline never suggests it; it stops at once when `release` is `off` |

## Publishing docs changes

Docs are `docs/`, and `.factory/` outside `scripts/`. How they reach `trunk` is the `docs-changes` setting.

**When root `AGENTS.md` has its own "Publishing docs changes" section, follow that section instead.** It knows this repository's checks and its own rule for what counts as docs. The rest of this section is the generic round trip.

- **`direct`** commits docs to `trunk` and pushes them:

  ```bash
  git switch <trunk> && git pull --ff-only
  git add docs/<files> .factory/<files> AGENTS.md   # `AGENTS.md` when a build regenerates its block
  git diff --cached --name-only | grep -vE '^(docs/|\.factory/|AGENTS\.md$)'   # must print nothing
  git diff --cached --name-only | grep '^\.factory/scripts/'                   # must print nothing: scripts are code
  node .factory/scripts/check.mjs                   # fix what it reports
  git commit -m "docs: <what changed>"
  git push
  ```

  When `metafab build` regenerates the block in root `AGENTS.md`, stage it with the `.factory/` file that changed it. Run `node .factory/scripts/check.mjs` before every docs commit.

- **`pull-request`** opens a docs pull request. Branch as `docs/<slug>`, commit as above, push, and open it with `gh pr create --base <trunk> --title "docs: <what changed>" --body-file <body>`. Send the person the link and a few plain lines on what it changes. **Merge it only when they have seen it and said to.** If they ask for changes, push to the same branch and ask again.

A change to `.factory/scripts/` is code and goes in a pull request either way. Files outside `docs/`, `.factory/` and the root `AGENTS.md` block belong to a code change: never mix them into a docs change.
