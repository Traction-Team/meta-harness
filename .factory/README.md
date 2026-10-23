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
                                │
                       start-plan                           (picks the next ready plan, opens a worktree)
                                │
   build-plan ──► draft PR ──► finish-plan ──► ready ──► land (plan merged, roadmap ticked, changelog) ──► merge
        └── review-branch (cold review, always a fresh sub-agent)
```

| Workflow | Starts from | Produces | Who decides |
|---|---|---|---|
| `file-work` | A bug, idea, spec gap, follow-up | An intake note, or an addition to an unbuilt plan; a bug plan when the fix is clear | Nobody: it only files |
| `prioritise-roadmap` | "What's next" | Roadmap order, new lines, a decision on each intake note and open question raised | The person running it |
| `plan-feature` | A roadmap line with no plan | One plan per pull request, linked by `needs`, added to the roadmap | A person approves the plans |
| `start-plan` | On `main`: "start the next plan" | A picked plan and a worktree session running `build-plan` | A person confirms each pick |
| `build-plan` | A picked plan, on a feature branch | Claim, tasks by sub-agents, `npm run verify`, a `review-branch` sub-agent and its fixes, proof, a draft PR | Nobody: it stops at draft |
| `review-branch` | A branch, a base and a goal, in a fresh sub-agent | A graded findings report and a verdict; it never edits | The calling workflow triages each finding |
| `finish-plan` | The draft PR | Feedback applied, PR ready, review comments answered, a landing commit that marks the plan merged, ticks the roadmap and writes the changelog | **The developer** says done; a person merges |

People keep five decisions: what is next, the plan, each pick, "done", and the merge.

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

`build-plan` builds on whatever feature branch it runs on; it never builds on `main`. A second plan built on the same branch joins its open pull request: the `Plan:` line lists both, and `finish-plan` lands both. Say *stack it* to give the new plan its own branch and pull request instead.
