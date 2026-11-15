# The process

How work moves from an idea to merged code, and then to a release. One plan is one pull request, and a person keeps each decision that matters.

`.factory/` is the factory. This doc is the process; the files in `.factory/workflows/` are its steps, installed as skills. Everything a repository decides for itself lives in one settings file, `docs/factory.md`, so this doc and the workflows read the same in every repository that uses them.

`.factory/docs/` is a team-added top-level directory. Metafab allows one, and nothing in it installs as a skill. It travels with every import and every update, so the process stays one click from the roadmap.

## The words

| Word | What it is | Where it lives |
|---|---|---|
| **Spec** | What the product must do. The acceptance standard for every change | The `specs` setting; `docs/specs/` by default. Empty skips the spec steps |
| **Roadmap** | Every plan in build order, one line each, plus open questions and decisions | The `roadmap` setting |
| **Plan** | How one pull request gets built, with its `needs`, `owns` and `proves` | The `plans` setting, named by `plan-names` |
| **Task** | One sub-agent's share of a plan's build. Never leaves the branch | The pull request's build log |
| **Intake note** | A bug, tooling problem, spec gap, feedback, idea or follow-up waiting for a decision | The `intake` setting: `YYYY-MM-DD-<slug>.md` |
| **Sighting** | One more time an intake note's problem was hit. A new file, never an edit to the note | The `intake` setting: `<note stem>/<id>.md` |
| **Feature** | Work that takes several pull requests, under a short code | The `features` setting: `<code>-<slug>.md`. Empty turns features and plan codes off |
| **Changelog entry** | What one landed pull request made true, in plain words | The `changelog` setting: `YYYY-MM-DD-<slug>.md` |

`plan-names` picks the plan file name. With `numbered` it is `<round>.<NNN>-<slug>.md`, such as `1.014-publish-dry-run.md`: `<round>` is the planning round and matches the major version the plans build towards, `<NNN>` numbers on from the highest plan in that round, and the first plan of a new round is `<round>.001`. With `dated` it is `YYYY-MM-DD-<slug>.md`, and `YYYY-MM-DD-<code>-<n>-<slug>.md` when `features` is set. Refer to a plan by its number or code, as in "Plan 1.014" or "ONB-4".

## The pipeline

```text
idea / bug / spec gap / follow-up ──► file-work ──► intake note
                                                         │
                        prioritise-roadmap ◄─────────────┘   (orders the roadmap, decides intake)
                                 │
                        plan-feature                         (a roadmap line with no plan: one plan per pull request)
                                 └── review-plan             (cold review of the plans, always a fresh sub-agent)
                                 │
                        start-plan                           (orchestrator: cuts waves, one worker per plan)
                                 │
   build-plan ──► land (plan merged, roadmap ticked, changelog) ──► draft pull request + TL;DR
        └── review-branch (cold review, always a fresh sub-agent)
                                 │
                        finish-plan ──► ready ──► a person merges
```

| Workflow | Starts from | Produces | Who decides |
|---|---|---|---|
| `file-work` | A bug, idea, feedback, spec gap, follow-up | An intake note, a sighting, or an addition to an unbuilt plan; a bug plan when the fix is clear | Nobody: it only files |
| `prioritise-roadmap` | "What's next" | Roadmap order, new lines, a decision on each intake note and open question raised | The person running it |
| `plan-feature` | A roadmap line with no plan | Edge cases and gaps raised with the person, one plan per pull request linked by `needs`, a `review-plan` sub-agent and its fixes, plans added to the roadmap | A person approves the plans |
| `review-plan` | Draft plans and the specs they serve, in a fresh sub-agent | A graded report of gaps, each as a question with a proposal, and a verdict; it never edits | `plan-feature` triages each finding; the person answers the open choices |
| `start-plan` | On `trunk`: "start the next plan", "keep going" | Waves of plans whose `owns` do not collide, one worker per plan running `build-plan`, and clean-up of merged plans on the next run | A person confirms each wave |
| `build-plan` | A picked plan, on a feature branch, usually as the worker | Branch rename, claim, tasks by sub-agents, `verify`, a `review-branch` sub-agent and its fixes, proof, the landing commit, a merge-safe draft pull request and a TL;DR handoff | Nobody: it stops at draft |
| `review-branch` | A branch, a base and a goal, in a fresh sub-agent | A graded findings report and a verdict; it never edits | The calling workflow triages each finding |
| `finish-plan` | The draft pull request and its TL;DR | Feedback applied, landing and TL;DR kept current, branch merged with `trunk`, pull request ready, review comments answered | **The developer** says done; a person merges |
| `release` | Everything merged to `trunk` since the last release, when `release` is `on` | The release pull request into `release-branch` opened or reused, its checks watched, then merged with a merge commit and the deploys watched | **The person** says go |

People keep five decisions: what is next, the plan, each wave, "done", and the merge. A release adds a sixth: the go-ahead to ship. `release` is standalone, so it is never part of the pipeline and no workflow suggests it. `review-plan`, `review-branch` and `release` are called by a workflow or by the person, not by the pipeline.

## The folder

```text
.factory/
  factory.yaml                 factory name, pipeline, environments and required files (Metafab format 2)
  AGENTS.md                    standing instructions, the source of the root AGENTS.md block
  metafab.yaml                 tools and publishing; never copied by import
  docs/process.md              this file
  workflows/<name>/SKILL.md    how work moves; installed as skills
  skills/<name>/SKILL.md       reusable know-how, such as stacked pull requests
  partials/*.md                one procedure per environment, imported by the workflows and AGENTS.md
  templates/                   plan.md, plan-bug.md, feature.md, intake.md, intake-sighting.md, changelog.md, pr-body.md, release-body.md
  templates/setup/             factory.md, opencode.json, orca.yaml, roadmap.md and claude-agents/: copied once by import, when missing
  scripts/                     dependency-free Node: check, next, feature, merge-stack
```

| Script | Does |
|---|---|
| `check.mjs` | Validates `docs/factory.md`, plans with frontmatter (title, status, kind, `needs`, `owns`, `proves`, code), the roadmap, feature docs, intake notes and sightings, changelog entries, and the release settings. Skills, the pipeline and the installed output are checked by `metafab check` |
| `next.mjs` | Ready plans in roadmap order, skipping claimed ones and `owns` collisions with open pull requests. `--ref origin/<trunk>`, `--json`. With `stacking` on it names the branch a plan stacks on |
| `feature.mjs` | Where each feature stands. With a code, its plans in code order with stage, status, pull request, stack and needs; `--write` regenerates the plan table in the feature doc |
| `merge-stack.mjs` | For a person, never a workflow: merges a stacked pull request and every unmerged one below it, bottom first. Refuses while `stacking` is `off`, and refuses drafts and unfinished or failing checks. `--dry-run` |

## Settings

The repository owns one file, `docs/factory.md`, created on import from `.factory/templates/setup/factory.md`. The workflows and scripts read it; nothing in `.factory/` holds a branch name, a command or a path of its own. An empty value means off or none.

| Setting | Default | Meaning |
|---|---|---|
| `trunk` | `main` | Branch plans start from and merge into |
| `verify` | `<set me>` | Command that proves a branch green |
| `setup` | empty | Command a new worktree runs before its first check; empty means the repository's install command from its README |
| `metafab` | `npx --yes @seasb/metafab@next` | How to run Metafab here |
| `agent` | `opencode` | Agent `start-plan` starts in an Orca worktree; empty uses the harness the person names |
| `orca-repo` | empty | `--repo` for `orca worktree create`; empty means `git worktree add` |
| `sub-agent-coding` | `agent-coding` | Sub-agent that builds tasks and fixes |
| `sub-agent-review` | `agent-review` | Sub-agent that reviews plans and branches |
| `sub-agent-planning` | `agent-planning` | Sub-agent that plans |
| `amp-model-coding` | empty | Model for an Amp task or fix thread; empty keeps the thread's own mode |
| `amp-model-review` | empty | Model for an Amp review thread; empty keeps the thread's own mode |
| `specs` | empty | Specs directory; empty skips the spec steps |
| `plans` | `docs/plans` | Where plans live |
| `plan-names` | `dated` | `numbered` (`<round>.<NNN>-<slug>.md`) or `dated` (`YYYY-MM-DD-[<code>-<n>-]<slug>.md`) |
| `roadmap` | `docs/roadmap.md` | The roadmap `prioritise-roadmap` writes and `start-plan` reads |
| `roadmap-max-lines` | empty | Most open roadmap lines; empty means no limit |
| `intake` | `docs/intake` | Where intake notes and their sightings folders live |
| `changelog` | `docs/changelog` | Where changelog entries live |
| `features` | empty | Feature docs directory; empty turns feature docs and plan codes off |
| `stacking` | `off` | `on`: a plan whose need is still building stacks on its branch; `off`: it waits for the need to merge |
| `review-bots` | empty | Comment that asks a bot to review, such as a bot handle plus `review`; empty skips the remote review loop |
| `docs-changes` | `pull-request` | `direct` pushes docs to `trunk`; `pull-request` opens a docs pull request |
| `approvers` | empty | Who approves, quoted by the workflows |
| `check-changed` | empty | Command that checks only what changed; empty means `verify` |
| `test-file` | empty | Command for one test file, with `<path>`; empty means sub-agents run `verify` |
| `dev-server` | empty | Command that serves the app for screenshots; empty skips them |
| `release` | `off` | `on`: the `release` workflow merges `trunk` into `release-branch` |
| `release-branch` | `production` | Branch a release merges into; must differ from `trunk` |
| `release-guide` | `docs/releasing.md` | Repository doc the `release` workflow follows for deploys, hotfixes and repairs |
| `release-risky-paths` | `none` | Comma-separated path prefixes the release lists as risky; `none` lists nothing |
| `release-announce` | `none` | Where the release's team update is posted; `none` leaves the section out |

How the file is read:

- The settings table is the first table whose header row is `| Setting | Value |`. More columns are allowed and ignored. Rows are split on unescaped `|` only, so a literal `|` in a command is written `\|`. Each value is trimmed and one pair of backticks is stripped. CRLF and a BOM are accepted.
- A key set twice is an error that names both lines, and the first value is used. An unknown key is a warning with "did you mean". A value left as `<set me>` is an error naming the key.
- A missing `docs/factory.md` is reported with the path of the template to copy.
- `--ref origin/<trunk>` reads the settings through the ref too, so a run on a branch sees what is merged.
- When `release` is `on`, `check.mjs` errors unless `release-branch` differs from `trunk` and `release-guide` exists.
- Anything below the table is this repository's own notes. An update never touches the file.

## Claims

A plan is claimed by its draft pull request. The body's first line, `**Plan:** <plans>/<plan>.md`, is what `next.mjs` reads through `gh`, so a claim is visible the moment the draft opens. The plan's `status: building` and `pr:` follow in the branch.

`build-plan` builds on whatever feature branch it runs on and never on `trunk`. When work on a branch turns up a second plan, building it on that branch adds it to the branch's open pull request: the `Plan:` line lists both paths, comma-separated, and every path on it is a claim. Each plan still gets its own cold review, its own proof and its own verdict, and one landing commit covers all of them. Say *stack it* to give the new plan its own branch and pull request instead.

Once a pull request claims a plan, the plan's path and title are on it, so they are frozen: never rename a claimed plan's file, and change its title only together with the pull request's.

## Landing

A plan's pull request carries its own bookkeeping: the plan set to `merged` (or `live`), its roadmap line ticked, a changelog entry, the feature doc's plan table when `features` is set, and an intake note for each tooling problem and existing bug the build ran into.

`build-plan` writes this landing commit before it hands over the draft, and `finish-plan` refreshes it on every later push. It reaches `trunk` only when the pull request merges, so it is true the moment it lands and no last step can be forgotten. On the branch the plan reads `merged` before it is; that is fine, because claims come from the pull request and `next.mjs` counts a plan an open pull request claims as in flight whatever its status says.

So a developer who reviews and merges without running `finish-plan` still leaves `trunk` correct.

## Features and codes

When `features` names a directory, work that takes several pull requests becomes a **feature**: a short code of 2 to 5 capitals, a feature doc in the features directory, and one plan per pull request numbered in the order you expect to build them. A number is never reused.

| Where | Form | Example |
|---|---|---|
| Plan file | `<plans>/YYYY-MM-DD-<code>-<n>-<slug>.md` | `docs/plans/2026-10-22-onb-6-compliance-tab.md` |
| Frontmatter | `code: <CODE>-<n>` | `code: ONB-6` |
| Pull request title (the plan's `title`) | `<type>: <CODE>-<n> <description>` | `feat: ONB-6 add the compliance tab` |
| Branch | `<type>/<code>-<n>-<slug>` | `feat/onb-6-compliance-tab` |

A plan outside a feature has no code. The feature doc is the feature's home: the shared what and why, the decisions every plan relies on, follow-ups, and a plan table generated by `node .factory/scripts/feature.mjs <CODE> --write`. Its optional `priority: <number>` orders features in `next.mjs`, lowest first; without one, features come in code order. When two feature pull requests land close together the generated table can conflict: run `--write` again rather than resolving it by hand.

`plan-feature` writes the feature doc and the plans when it adds work to a feature; `build-plan` writes the table in each landing commit.

## Stacking

`stacking` decides what happens to a plan whose `needs` has not merged.

- **`off`** (the default): the plan is blocked until its need merges. `next.mjs` lists it as blocked, and `start-plan` leaves it for a later wave.
- **`on`**: the plan is ready, and it is built stacked on the need's branch. Its pull request names **Stacked on:** #<pr> (`<branch>`) on the first line. A chain of unmerged needs stacks on the top of the chain; two unmerged needs on separate branches still block the plan, because a branch has one base.

With `stacking` on, the `stacked-prs` skill has the git side: linking a GitHub stack, catching up with the base, and restacking after the parent merges. The rules it carries:

- A branch in a stack catches up by rebasing and force-pushing with `--force-with-lease`; a branch on its own merges `origin/<trunk>`. Stacks need a linear history.
- Each session rewrites only its own branch. Never run `gh stack rebase`, `gh stack sync` or `gh stack push`: they rewrite every branch in the stack under the other sessions' feet.
- When a parent merges, the pull request is retargeted to `trunk` and its branch restacks from the bottom of the stack up.
- `merge-stack.mjs` is for a person who must merge their own stack, once every pull request in it has passed. No workflow runs it.

## Releases

`release` is `off` by default, and the workflow stops at once when it is. With `release` on:

- Merging the release pull request is the only thing that deploys, so it is the person's decision and never the agent's.
- The workflow works from `origin/<trunk>` and `origin/<release-branch>`, checks that the release branch's history is intact, and shows what ships before it opens anything.
- It follows the `release-guide` document for what deploys, how to watch it, how to ship a hotfix and how to repair the release branch. The fab ships no deploy steps of its own, because they differ per repository.
- It lists the path prefixes in `release-risky-paths` that the release touches, and says what each one does in plain words. `none` lists nothing.
- It writes the release body from `.factory/templates/release-body.md`. The `## Team update` section holds only the lines the person chose to tell the team, and is left out when `release-announce` is `none`.
- It never merges on its own initiative, never squashes, and never rolls back. A failed deploy is fixed forward on `trunk` with an ordinary pull request, then released again.

## Workers

`start-plan` is the orchestrator. It runs on `trunk`, cuts the ready plans into waves whose `owns` paths do not collide (four plans, five at the most), gets the person's approval, proves `trunk` green once with the `verify` command, then starts one worker per plan. The worker runs `build-plan` on the plan's branch. The orchestrator never follows a worker: it does not read its workspace or transcript.

Every plan gets a workspace of its own, and neither the worker nor the orchestrator watches the pull requests. Two things decide what a workflow says to you:

- The **workspace** is where a worker's checkout comes from: an Amp orb, an Orca worktree, or a plain `git worktree`.
- The **harness** is the agent tool that runs the session: OpenCode, Claude Code or Amp.

They are independent: an OpenCode session can run in an Orca worktree, a plain worktree or an orb, and so can Claude Code or Amp. The factory declares both, and ships one procedure per case, so each session reads only its own. With nothing selected you get every case, labelled, so a repository that has not chosen yet still works.

### Choosing what your agents read

A selection is personal, so it is never committed. It lives in Git config, which every worktree of a clone shares:

```bash
metafab env set harness=opencode           # or harness=amp, or harness=claude
metafab env set harness=opencode,claude    # if you use more than one
metafab env set workspace=orca             # or workspace=orb, workspace=worktree
metafab env set harness=opencode --global  # every repository on this machine
metafab env                                 # the selection, and where each value came from
```

`metafab env set` and `metafab env unset` write `factory.env.*` to Git config and rebuild the installed skills. `FACTORY_ENV_HARNESS` and `FACTORY_ENV_WORKSPACE` do the same for one process, which is what a CI job or a setup script uses. `metafab build --env harness=claude --out <dir>` writes what a teammate on another harness receives, and `metafab check` validates every case whatever the selection is.

An Amp orb is the one place the selection is written for you: `.agents/setup` sets `harness` to `amp` and `workspace` to `orb` in the orb's own Git config before it builds.

### The workspace

- **An Amp orb.** One new thread per plan, each in its own orb, started with `create_thread` (`executor: orb`, `intent: parallel-work`). A fresh orb checks out the trunk and runs `.agents/setup`, so the skills are installed and nothing needs setting up by hand. The brief tells the worker to create the plan's branch from its base, then run `build-plan`. There is no worktree to remove: after the merge the orchestrator offers to archive the worker's thread.
- **An Orca worktree.** `orca worktree create --repo <orca-repo> --base-branch origin/<trunk> --no-parent --setup run --agent <agent>`. `--setup run` runs the repository's Orca setup hook; when that hook is empty or failed, run the `setup` command by hand and say which. Orca names the branch `<git user>/<flattened name>`; the worker renames it to `<type>/<plan-file-stem>` before the claim. After the merge the orchestrator removes the worktree with `orca worktree rm`.
- **A plain git worktree.** `git worktree add ../<repository directory name>-<branch with / as -> -b <branch> origin/<trunk>`. Run the `setup` command, then show the person the `cd` and the command that starts their harness. No setup hook ran, and the Orca board cannot see the worktree. After the merge the orchestrator removes it with `git worktree remove`.

### The harness

- **OpenCode.** Sub-agents start with the Task tool, `subagent_type` set to the `sub-agent-coding`, `sub-agent-review` or `sub-agent-planning` value; `opencode.json` defines all three. The opencode-claude-bridge plugin replaces the Task tool's list with Claude Code's fixed one, so the names may not appear: call them anyway, and fall back to `general-purpose` only on an unknown-agent error.
- **Claude Code.** Sub-agents start with the Agent tool, choosing the sub-agent of that name; `.claude/agents/` defines all three and pins no model, so each runs on the session's model.
- **Amp.** A sub-agent is a new Amp thread started with `create_thread`, on `amp-model-coding` for a task or fix and `amp-model-review` for a review (empty keeps the thread's own mode). Each thread checks out the plan's branch in its own orb, pushes its commits, and sends its report back with `send_thread_message`. If a thread stops without reporting, `read_thread` reads its last message.

### An Amp orb setup script

Each repository can keep a setup script at `.agents/setup`, which a new orb runs before its first command. It is repository-local: it is not a fab template and not under `requires`, because it holds the repository's own build commands.

An orb setup script must:

- Be idempotent. A second run on the same orb must be safe.
- Be non-interactive. There is nobody to answer a prompt.
- Unshallow the clone when it is shallow (`git rev-parse --is-shallow-repository` prints `true`, then `git fetch --unshallow origin`), because `build-plan` and `finish-plan` merge the base and that fails in a shallow clone.
- Install dependencies with the repository's own command.
- Build the CLI when the repository builds one.
- Run `metafab build`, through the `metafab` setting, so every workflow is installed as a skill.

The repository's `.gitignore` should ignore `.amp/portals/*`, which Amp writes into the checkout.

## Docs changes and upstream

Docs are `docs/` and `.factory/` outside `scripts/`. The `docs-changes` setting says whether they go straight to `trunk` (`direct`) or through a pull request (`pull-request`); `.factory/AGENTS.md` has both round trips. A repository with its own "Publishing docs changes" section in root `AGENTS.md` follows that section instead.

A repository that takes this factory from a fab does not edit `.factory/` by hand. A change to a workflow, a template, an `.factory/AGENTS.md` rule or `factory.yaml` is made in the fab, released, and taken with `metafab update`; a direct local edit is a stopgap that `metafab diff` lists until it is upstreamed. `.factory/scripts/` is code and always goes in a pull request.
