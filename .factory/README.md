# The factory

How work moves from idea to merged code in this repository. It was copied from the Dragonfly factory and adapted to building the Metafab CLI.

The factory is written in the [Metafab v1 factory format](../docs/specs/factory-format.md), so it doubles as our first real fixture: once `metafab build` exists ([plan 04](../docs/plans/04-build.md)), it replaces `scripts/link.mjs`.

## Installing it

Until Metafab can build itself, `node .factory/scripts/link.mjs` stands in for `metafab build`:

- **Skills.** Every skill under `.factory/` is linked into `.claude/skills/<name>` and `.agents/skills/<name>` as a relative symlink. The links are committed, so a fresh clone works with no setup.
- **`AGENTS.md`.** The block between `<!-- factory:start -->` and `<!-- factory:end -->` in root `AGENTS.md` is generated from `.factory/AGENTS.md` and the pipeline in `.factory/factory.yaml`, in the shape the [build spec](../docs/specs/building.md#root-agentsmd) defines. It is committed.

After you add, rename or remove a workflow or skill, or edit `.factory/AGENTS.md` or `factory.yaml`, run `link.mjs` and commit the result. `check.mjs` fails when the links or the block are stale.

Restart any agent session after a change: Claude Code and Codex read `AGENTS.md` and the skill list once, at session start.

## The words

| Word | What it is | Where it lives |
|---|---|---|
| **Spec** | What v1 does. The acceptance standard | `docs/specs/*.md` |
| **Roadmap** | Every plan in build order, a checkbox each, plus open questions and decisions | `docs/roadmap.md` |
| **Plan** | How we build one pull request, with its `needs`, `owns` and `proves` | `docs/plans/NN-<slug>.md` |
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
                       start-plan                           (orchestrator: cuts waves, one Orca worktree + OpenCode worker per plan)
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
| `start-plan` | On `main`: "start the next plan", "keep going" | Waves of plans whose `owns` do not collide, one Orca worktree and OpenCode worker per plan running `build-plan`, and worktree removal for merged plans on the next run | A person confirms each wave |
| `build-plan` | A picked plan, on a feature branch (usually as the worker in its worktree) | Branch rename, claim, tasks by sub-agents, `npm run verify`, a `review-branch` sub-agent and its fixes, proof, the landing commit, a merge-safe draft PR and a TL;DR handoff | Nobody: it stops at draft |
| `review-branch` | A branch, a base and a goal, in a fresh sub-agent | A graded findings report and a verdict; it never edits | The calling workflow triages each finding |
| `finish-plan` | The draft PR and its TL;DR | Feedback applied, landing and TL;DR kept current, branch merged with `main`, PR ready, review comments answered | **The developer** says done; a person merges |

People keep five decisions: what is next, the plan, each wave, "done", and the merge.

## The folder

```text
.factory/
  README.md                    this file
  factory.yaml                 factory name and pipeline (Metafab format 1)
  AGENTS.md                    standing instructions, put into root AGENTS.md by link.mjs
  workflows/<name>/SKILL.md    how work moves; installed as skills
  templates/                   plan.md, plan-bug.md, pr-body.md, intake.md, changelog.md
  scripts/                     dependency-free Node: link, check, next
```

| Script | Does |
|---|---|
| `link.mjs` | Stand-in for `metafab build`: links every skill into `.claude/skills/` and `.agents/skills/` and regenerates the root `AGENTS.md` block |
| `check.mjs` | Validates skills and the pipeline, that links and the block are current, plans with frontmatter (title, status, kind, `needs`, `owns`, `proves`), roadmap links, intake notes and changelog entries |
| `next.mjs` | Ready plans in roadmap order, skipping claimed ones and `owns` collisions with open PRs. `--ref origin/main`, `--json` |

## Claims

A plan is claimed by its draft pull request. The body's first line, `**Plan:** docs/plans/<plan>.md`, is what `next.mjs` reads through `gh`, so a claim is visible the moment the draft opens. The plan's `status: building` and `pr:` follow on the branch.

`build-plan` builds on whatever feature branch it runs on; it never builds on `main`. A second plan built on the same branch joins its open pull request: the `Plan:` line lists both, and `build-plan` lands both. Say *stack it* to give the new plan its own branch and pull request instead.

## Workers

`start-plan` is the orchestrator. It runs on `main`, cuts the ready plans into waves whose `owns` paths do not collide (four plans, five at the most), and after the person approves, proves `main` green once with `npm run verify`. Then it starts one worker per plan:

- **Worktree.** `orca worktree create --repo id:<MetaFab repo id> --base-branch origin/main --no-parent --setup run --agent opencode`. Orca names the branch `<git user>/<flattened name>`; the worker renames it to `<type>/<slug>` before the claim. Without Orca, `git worktree add` is the fallback, and the Orca board cannot see that worktree.
- **Session.** The worker is an OpenCode session that reads a short brief and runs `build-plan`. The orchestrator never follows it: it does not read the worker's terminal or open its worktree.
- **Sub-agents.** The worker stays thin and dispatches every task, fix and review to the `agent-coding` sub-agent that `opencode.json` defines, on a cheaper coding model. The heavy build context ends with each sub-agent.
- **Clean up.** The orchestrator does not watch the pull requests. It stops once the workers are started. On its next run it reads origin with `gh`, removes the worktree of each merged plan with `orca worktree rm`, and cuts the next wave.

The landing bookkeeping stays on the branch: `build-plan` writes it before the handoff, and `finish-plan` keeps it current, so the branch is safe to merge the moment the developer is happy and the orchestrator writes nothing on `main`. A developer who reviews and merges without saying a word still leaves `main` correct.
