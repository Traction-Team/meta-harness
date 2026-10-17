# The Dragonfly factory: what Mark IV takes from it

Researched 16 Oct 2026, from the `docs/factory-proposal` branch of the Dragonfly repository (worktree `~/orca/workspaces/dragonfly/docs-factory-proposal`). The design is in that branch's `docs/rfcs/2026-10-15-software-factory.md`. The working version is the `.factory/` folder.

The question: Dragonfly has a factory that works with no runner. What made it work, what was hard, and what should Mark IV change?

> **Names.** Dragonfly calls its steps *programs*. Mark IV now calls them *jobs*, and adds *stages* (filters over existing work) and *scorers*. This document keeps Dragonfly's word when it describes Dragonfly, and uses Mark IV's words in the "Mark IV answer" columns.

## What it is

```
.factory/
  README.md                the process on one page
  AGENTS.md                the source of root AGENTS.md; install adds a programs table
  programs/<name>/SKILL.md file-work, prioritise-roadmap, plan-feature, pull-work,
                           build-slice, review-slice, finish-slice
  skills/                  empty for now
  templates/               plan, plan-bug, pr-body, roadmap, intake, changelog
  scripts/                 install.mjs, check.mjs, next.mjs, lib.mjs (plain Node, no build)
```

- **Programs are skills** with `name`, `description` and `when` in their frontmatter. `install.mjs` links each one into `.claude/skills/` and `.agents/skills/`.
- **Root `AGENTS.md` gets a programs table** (name, what it does, when to run it). So any session knows which program fits a request without loading them all. A person says "here is a bug Kat hit", and the agent loads `file-work`.
- **The words are fixed:** roadmap item, plan, slice, task, intake note, changelog entry, and where each one lives.
- **Scripts do what must be exact.** `check.mjs` validates frontmatter and the roadmap. `next.mjs` lists ready slices in priority order, without claimed slices or path collisions with open PRs. The programs keep the judgement.
- **A draft PR is the claim.** Its first line names the slices, and `next.mjs` reads it through `gh`.
- **People keep six decisions:** what is next, the plan, each pick, "done", the merge, and turning the switch on.
- **It is opt-in.** The install is local and git-excluded. Root `AGENTS.md` is overwritten and shows as modified, and must not be committed.

## What worked

1. **No runner was needed.** Programs that say what they take, what they make, where they stop and what comes next were enough for agents to move work forward.
2. **The programs table in `AGENTS.md`.** Routing by description and `when` let people speak normally. Nobody had to remember program names.
3. **Programs separate from skills.** `programs/` reads as the process. Domain know-how stays out of the way.
4. **Scripts for exact things, agents for judgement.** "What is ready" is a script, not a guess.
5. **Harness differences in one place.** The RFC moved Orca, nodeterm and plain Claude Code differences out of the programs into runtime files. agent-mail had them inside its skills, and they had drifted.
6. **Plain files and Git.** Plans are reviewed as PRs. The claim is a draft PR that people see on GitHub.

## What was hard

| Problem | Mark IV answer |
| --- | --- |
| **You cannot see the factory.** The flow is an ASCII drawing in a README | `stages:` in `fab.yaml`, drawn by `fab map` and the monitor's Work tab, with each job between two stages |
| **You must know what to ask.** A person who does not know "file-work" or "pull the next chunk" cannot start the work well | Jobs become buttons in the monitor's Jobs tab, and a ▶ on each stage. `inputs` become forms |
| **You cannot see what runs.** Sessions are spread across Orca worktrees and terminals | Agents show on the artifact they work on, in the Work tab, from run records and the session adapters |
| **You cannot see where the work is.** How many slices are ready, how many PRs wait for review, is a question for `next.mjs` and GitHub | Stages are filters over the plans, branches and PRs. The Work tab shows a bar of artifacts for each |
| **You cannot see if the work is good.** Review is a step, but nothing says how plans or PRs score over time | Scorers on stages: *edge cases* on plans, *tech debt* and *tests* on PRs |
| **Root `AGENTS.md` is generated and shows as modified.** It is easy to commit by mistake, and `check.mjs` must catch a stale copy | A marked block inside a committed `AGENTS.md`. Text outside the markers is the team's own |
| **Opt-in local install.** It was right for a proposal, but each person installs it, and alignment depends on them doing it | Committed install by default. `fab install --local` stays for trials |
| **Copy `.factory` into each new worktree.** `pull-work` has to `cp -R` it when the base branch does not have it | Once the fab is committed, every branch has it. `fab run --worktree new` runs `fab install --runtime` in the new folder |
| **Each repository writes its own install and check scripts** | `fab install` and `fab check` are generic. Project scripts such as `next.mjs` stay in `.fab/scripts/` |
| **The words live in a README table** | `stages:` in `fab.yaml`. Each word becomes a stage with a `find` and `where`, so the CLI and monitor can find the work |
| **The six decisions live in a README** | `decisions:` in `fab.yaml`, named by each job's `decides:` and each stage's `waits-for:` |

## Converting `.factory/` to `.fab/`

`fab init --import .factory` should do this:

| `.factory/` | `.fab/` |
| --- | --- |
| `programs/*/SKILL.md` | `jobs/*/SKILL.md`. Add `title`, `from`, `to`, `takes`, `inputs` and `decides` where they are clear from the text |
| `skills/`, `templates/`, `scripts/` | The same |
| `AGENTS.md` with `<!-- factory:programs -->` | `AGENTS.md`. The placeholder becomes the `fab:start` / `fab:end` block |
| README "The words" table | `stages:` in `fab.yaml`: intake notes, roadmap lines, plan PRs, ready slices, draft PRs, PRs in review, approved PRs, merged |
| README decisions list | `decisions:` in `fab.yaml` |
| RFC runtimes (not built yet) | `runtimes/orca.md`, `nodeterm.md`, `claude-code.md` |

Dragonfly's stages and jobs would be (the prototype's `dragonfly` fixture):

| Stage | Filter | Job out of it |
| --- | --- | --- |
| Intake | `files docs/roadmap/intake/*.md` where `status: open` | `prioritise` (reads all) |
| On the roadmap | `lines in docs/roadmap/roadmap.md` where no plan links the line | `plan-feature` |
| Plan in review | `prs label:plan` where open | `review-plan`, then the tech lead approves |
| Ready to build | `slices in docs/plans/*.md` where `status: ready` | `pull-work` |
| Building | `prs head:feat/*` where draft | `build-slice` |
| Needs review | `prs head:feat/*` where ready, not approved | `review-slice`, then the code owner approves |
| Ready to merge | `prs head:feat/*` where approved | `finish-slice` |
| Shipped | `prs head:feat/*` merged in the last 7 days | none |

`file-work` starts new work in Intake, with three buttons: Log bug, Log idea, Log feedback.

Two questions this research raised, and how Mark IV answers them:

- **One job, many buttons.** `file-work` handles bugs, ideas and feedback. Mark IV lets a job list `entries`, each with its own title and fixed inputs.
- **Inputs from files.** "Which roadmap line" was a choice from `roadmap.md`. With stages, it is not an input: `plan-feature` takes one artifact from *On the roadmap*, and the monitor lists that stage.
