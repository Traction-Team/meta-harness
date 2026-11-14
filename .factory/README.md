# The factory

How work moves from idea to merged code in this repository. It was copied from the Dragonfly factory and adapted to building the Metafab CLI.

The factory is written in the [Metafab v1 factory format](../docs/specs/factory-format.md), so it doubles as our first real fixture: `metafab build` installs it.

## Installing it

This repository builds its factory from its own checkout:

```bash
npm install
npm run build
node dist/cli.js build
```

`build` writes the installed skills as generated copies in `.claude/skills/<name>` and `.agents/skills/<name>`. Git ignores them, so a fresh clone has none until it builds. It also writes the block between `<!-- factory:start -->` and `<!-- factory:end -->` in root `AGENTS.md` from `.factory/AGENTS.md` and the pipeline in `.factory/factory.yaml`, in the shape the [build spec](../docs/specs/building.md#root-agentsmd) defines. That block is committed.

`metafab` is `node dist/cli.js` here until `@seasb/metafab` is on npm ([plan 1.012](../docs/plans/1.012-release.md)). Run `npm link` once if you want a `metafab` on `PATH`.

Hooks are off for now (`git-hooks: false` in `.factory/metafab.yaml`). They look for `metafab` in `node_modules/.bin`, on `PATH` and through `npx`, and this checkout's CLI is none of those until 1.012, so a hook would fail in every fresh checkout. After a checkout, merge or rebase that changes `.factory/`, run `node dist/cli.js build` yourself, or `npm run factory` for the build and both checks. Plan 1.012 turns the hooks on.

A new Amp orb builds through `.agents/setup`, which installs dependencies with `npm ci`, builds `dist/` and runs `node dist/cli.js build`, so a fresh Amp thread has every workflow installed as a skill. A new Orca worktree builds through the `setup` script in `orca.yaml`, which runs the same three commands. That only works once the per-repository setup command in Orca's repository settings (today `npm install`) is cleared, because it overrides the committed `orca.yaml`; clear it once per machine. Until then, run `npm run build && node dist/cli.js build` in the new worktree by hand. CI's `factory` job runs the same recipe, then `git diff --exit-code` on the committed integration files and both checks, as the [build spec](../docs/specs/building.md#repeatability) requires.

After you add, rename or remove a workflow or skill, or edit `.factory/AGENTS.md` or `factory.yaml`, run `node dist/cli.js build` and commit the result. `metafab check` fails when a file that `build` would write is out of date.

Restart any agent session after a change: Claude Code and Codex read `AGENTS.md` and the skill list once, at session start.

## The words

| Word | What it is | Where it lives |
|---|---|---|
| **Spec** | What v1 does. The acceptance standard | `docs/specs/*.md` |
| **Roadmap** | Every plan in build order, a checkbox each, plus open questions and decisions | `docs/roadmap.md` |
| **Plan** | How we build one pull request, with its `needs`, `owns` and `proves` | `docs/plans/<round>.<NNN>-<slug>.md`, such as `1.004-build.md` |
| **Task** | One sub-agent's share of a plan's build. Never leaves the branch | The pull request's build log |
| **Intake note** | A bug, idea, spec gap or follow-up waiting for a decision | `docs/intake/YYYY-MM-DD-<slug>.md` |
| **Changelog entry** | What one landed pull request made true | `docs/changelog/YYYY-MM-DD-<slug>.md` |

## The pipeline

```text
idea / bug / spec gap / follow-up ──► file-work ──► docs/intake/
                                                        │
                       prioritise-roadmap ◄─────────────┘   (orders docs/roadmap.md, decides intake)
                                │
                       plan-feature                         (a roadmap line with no plan: one plan per PR)
                                └── review-plan             (cold review of the plans, always a fresh sub-agent)
                                │
                       start-plan                           (orchestrator: cuts waves, one worker per plan: an Amp thread, or an Orca worktree + OpenCode worker)
                                │
   build-plan ──► land (plan merged, roadmap ticked, changelog) ──► draft PR + TL;DR ──► finish-plan (feedback) ──► ready ──► merge
        └── review-branch (cold review, always a fresh sub-agent)
```

| Workflow | Starts from | Produces | Who decides |
|---|---|---|---|
| `file-work` | A bug, idea, spec gap, follow-up | An intake note, or an addition to an unbuilt plan; a bug plan when the fix is clear | Nobody: it only files |
| `prioritise-roadmap` | "What's next" | Roadmap order, new lines, a decision on each intake note and open question raised | The person running it |
| `plan-feature` | A roadmap line with no plan | Edge cases and gaps raised with the person, one plan per pull request linked by `needs`, a `review-plan` sub-agent and its fixes, plans added to the roadmap | A person approves the plans |
| `review-plan` | Draft plans and the specs they serve, in a fresh sub-agent | A graded report of gaps, each as a question with a proposal, and a verdict; it never edits | `plan-feature` triages each finding; the person answers the open choices |
| `start-plan` | On `main`: "start the next plan", "keep going" | Waves of plans whose `owns` do not collide, one worker per plan running `build-plan` (an Amp thread in its own orb, or an Orca worktree and OpenCode session), and clean-up of merged plans on the next run | A person confirms each wave |
| `build-plan` | A picked plan, on a feature branch (usually as the worker in its worktree) | Branch rename, claim, tasks by sub-agents, `npm run verify`, a `review-branch` sub-agent and its fixes, proof, the landing commit, a merge-safe draft PR and a TL;DR handoff | Nobody: it stops at draft |
| `review-branch` | A branch, a base and a goal, in a fresh sub-agent | A graded findings report and a verdict; it never edits | The calling workflow triages each finding |
| `finish-plan` | The draft PR and its TL;DR | Feedback applied, landing and TL;DR kept current, branch merged with `main`, PR ready, review comments answered | **The developer** says done; a person merges |

People keep five decisions: what is next, the plan, each wave, "done", and the merge.

## The folder

```text
.factory/
  README.md                    this file
  factory.yaml                 factory name and pipeline (Metafab format 1)
  metafab.yaml                 targets and hook setting (Metafab format 1)
  AGENTS.md                    standing instructions, the source of the root AGENTS.md block
  workflows/<name>/SKILL.md    how work moves; installed as skills
  templates/                   plan.md, plan-bug.md, pr-body.md, intake.md, changelog.md
  scripts/                     dependency-free Node: check, next
```

| Script | Does |
|---|---|
| `check.mjs` | Validates plans with frontmatter (title, status, kind, `needs`, `owns`, `proves`), roadmap links, intake notes and changelog entries. Skills, the pipeline and the installed output are checked by `metafab check` |
| `next.mjs` | Ready plans in roadmap order, skipping claimed ones and `owns` collisions with open PRs. `--ref origin/main`, `--json` |

## Claims

A plan is claimed by its draft pull request. The body's first line, `**Plan:** docs/plans/<plan>.md`, is what `next.mjs` reads through `gh`, so a claim is visible the moment the draft opens. The plan's `status: building` and `pr:` follow on the branch.

`build-plan` builds on whatever feature branch it runs on; it never builds on `main`. A second plan built on the same branch joins its open pull request: the `Plan:` line lists both, and `build-plan` lands both. Say *stack it* to give the new plan its own branch and pull request instead.

## Workers

`start-plan` is the orchestrator. It runs on `main`, cuts the ready plans into waves whose `owns` paths do not collide (four plans, five at the most), and after the person approves, proves `main` green once with `npm run verify`. Then it starts one worker per plan, in one of two runtimes.

**In Amp** (the orchestrator runs in an Amp thread):

- **Thread.** One new Amp thread per plan, each in its own orb, started with `create_thread`. A fresh orb checks out `main` and runs `.agents/setup` (`npm ci`, build `dist/`, `node dist/cli.js build`), so the skills are installed and nothing needs setting up by hand. The brief tells the worker to create `<type>/<plan-file-stem>` from its base, then run `build-plan`.
- **Sub-agents.** The worker dispatches every task, fix and review to a Task sub-agent. Amp sub-agents run on the thread's model.
- **Clean up.** There is no worktree to remove; the orb belongs to the worker thread, which the person can archive after the merge.

**With Orca and OpenCode:**

- **Worktree.** `orca worktree create --repo id:<MetaFab repo id> --base-branch origin/main --no-parent --setup run --agent opencode`. Orca names the branch `<git user>/<flattened name>`; the worker renames it to `<type>/<plan-file-stem>`, such as `feat/1.005-check`, before the claim. Without Orca, `git worktree add` is the fallback, and the Orca board cannot see that worktree.
- **Session.** The worker is an OpenCode session that reads a short brief and runs `build-plan`. The orchestrator never follows it: it does not read the worker's terminal or open its worktree.
- **Sub-agents.** The worker stays thin and dispatches every task, fix and review to the `agent-coding` sub-agent that `opencode.json` defines, on a cheaper coding model. The heavy build context ends with each sub-agent.
- **Clean up.** The orchestrator does not watch the pull requests. It stops once the workers are started. On its next run it reads origin with `gh`, removes the worktree of each merged plan with `orca worktree rm`, and cuts the next wave.

The landing bookkeeping stays on the branch: `build-plan` writes it before the handoff, and `finish-plan` keeps it current, so the branch is safe to merge the moment the developer is happy and the orchestrator writes nothing on `main`. A developer who reviews and merges without saying a word still leaves `main` correct.
