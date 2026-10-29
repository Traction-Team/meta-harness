---
name: build-plan
description: Builds one plan on the current feature branch, usually as the OpenCode worker start-plan started in an Orca worktree. It renames the Orca branch, claims the plan with a draft pull request, or adds it to the branch's open pull request, delegates implementation tasks to agent-coding sub-agents, runs npm run verify, always runs the review-branch workflow in a fresh sub-agent, triages its findings and sends accepted ones to a fix sub-agent, re-reviews the fix commits, records proof, and writes the landing commit (plan merged, roadmap ticked, changelog), so the branch is safe to merge as it stands. It stops with a draft pull request and a TL;DR handoff for the developer. On main it does not build; it sends the person to start-plan. Use it for "build docs/plans/<plan>.md". It never marks a pull request ready and never merges.
---

# build-plan

Manage one plan. Delegate implementation and review to sub-agents. Pass concise reports between sub-agents, not complete transcripts. You own the task order, checks, and pull request.

You are usually a **worker**: `start-plan` started you in your own Orca worktree with a short brief. Stay thin. Do not read the source, the specs in depth, or the diff in full yourself; the sub-agents hold that context and it ends with them. Read the diff from git only when a later step needs it.

**Sub-agents run as `agent-coding`.** Dispatch every task, fix and review sub-agent with `subagent_type: "agent-coding"`. The repo's `opencode.json` defines it, on a cheaper coding model than yours. It exists even when the Agent tool does not list it: the OpenCode bridge plugin replaces the tool description with Claude Code's fixed list (`general-purpose`, `Explore`, `Plan`...). Pass `agent-coding` anyway. Never fall back to `general-purpose`, which runs on your own model, unless an `agent-coding` call fails; then say so in the final report.

The current feature branch is where the plan is built. A plan usually gets its own pull request, but when the branch already has one, the plan joins it. Never build on `main`.

The run is always: check the branch → claim → task sub-agents → checks → **review sub-agent (`review-branch`)** → handle findings → proof → **land** → draft and TL;DR. The review is not optional. Do not push the final branch, fill the pull request's review section, or report done until a `review-branch` sub-agent has returned a verdict for this plan's work.

**The branch is always merge-safe when you hand it over.** The developer may review the diff and merge it straight away, without running `finish-plan`. So the landing bookkeeping (step 8) goes on the branch before the handoff, not later.

**Never** mark the pull request ready or merge it. Do not edit `.factory/`, a plan the pull request does not list, or `docs/roadmap.md` beyond the landing edits in step 8. Change only paths in the `owns` lists of the plans the pull request lists, those plans, and the spec sections they implement when the code has to differ (say so in the pull request). If the implementation requires another path, add it to `owns` in the plan and explain why in the pull request.

## 0. Check the branch

Run these in parallel:

```bash
git fetch origin
git branch --show-current && git status --short
gh pr view --json number,state,body,baseRefName,headRefName   # the pull request for this branch, if any
node .factory/scripts/next.mjs --json                         # inFlight shows every open pull request that claims a plan
```

**The Orca branch.** Orca names a new worktree's branch `<git user>/<flattened name>`, for example `sebastiankade/feat-1.005-check`. If the branch has that shape, has no commit beyond its base, and has no pull request, rename it now, before the claim, and treat it as case 3:

```bash
git branch -m <type>/<plan-file-stem>   # the type comes from the plan's title; the stem is the file name without .md, e.g. feat/1.005-check
git branch --show-current                         # must print the new name
```

**The setup.** `start-plan` created the worktree with `--setup run`. If the first command fails on missing dependencies (`ERR_MODULE_NOT_FOUND`, no `node_modules`), read the repo's hook with `orca repo list --json` (`hookSettings.scripts.setup`) and run it. Run `npm install` by hand only when the hook is empty or failed, and say which in the final report. `start-plan` proved `main` green before it started you, so do not run `npm run verify` as a baseline.

Then take the first case that matches:

1. **On `main` or a detached HEAD: stop.** Do not branch, claim, commit, or build. Tell the person in two or three lines that build-plan builds on a feature branch, and offer `start-plan` (the plan exists and is ready) or `plan-feature` (no plan yet). Continue only if the person then explicitly asks to build in this session anyway: create the branch as `start-plan` names it (`git switch -c <type>/<plan-file-stem> origin/main`) and go to case 3.
2. **Another branch's open pull request claims this plan:** stop. Report the pull request and branch that own it.
3. **On a feature branch with no open pull request:** build here. Claim the plan with a new draft pull request (step 1a).
4. **On a feature branch whose pull request already lists this plan:** resume. Read the build log and go to the first task not done.
5. **On a feature branch whose open pull request lists other plans:** build here, in that pull request (step 1b). Tell the person in one line, for example "Adding this plan to #12 on `feat/x`. Say *stack it* if you want its own pull request." Do not wait. If they say *stack it*, run `git switch -c <type>/<plan-file-stem>` and claim with step 1a, with `--base <current branch>`.
6. **On a feature branch whose pull request is merged or closed:** stop. Offer `start-plan`.

## 1. Read and claim the plan

Read the whole plan, every spec section it links, and the merged diff (or the branch) of every plan in `needs`.

**1a. New pull request.**

- Set the plan to `status: building`. Commit as `docs: claim <plan-slug>` and push with `-u`.
- Create the pull request body from `.factory/templates/pr-body.md`. Keep `**Plan:** docs/plans/<plan>.md` as the first line: other sessions read it as the claim.
- `gh pr create --draft --title "<plan title>" --body-file <body>`. For a stacked plan, add `--base <branch below>` and name it in **Stacked on**.
- Set `pr: <n>` in the plan, commit, and push.

**1b. Join the open pull request.**

- Record the current commit as `<plan base sha>`. This plan's review starts from it.
- Set the plan to `status: building` and `pr: <n>`, commit as `docs: claim <plan-slug>`, and push.
- Add the plan to the first body line, comma-separated. Keep every plan already there.
- In **What changes**, add a paragraph for this plan.
- If the title no longer describes the work, rewrite it to cover all its plans and say so in your final report.
- Edit the body with `gh pr view --json body -q .body > <body>`, then `gh pr edit --body-file <body>`.

## 2. Divide the plan into tasks

Use the plan's **Steps** as the starting point. Group them into two to four tasks, in this order where it applies:

1. Shared model, types and utilities, with unit tests.
2. Core logic (`src/core/...`), with unit tests and fixtures.
3. Command wiring: argument handling, human and `--json` output, exit codes, with in-process CLI tests.
4. Spec and plan updates the build turned out to need.

Add the task list to the pull request's build log before implementation starts. When the pull request carries several plans, start each row with the plan's slug.

## 3. Use one sub-agent for each task

Run tasks in order, one `agent-coding` sub-agent each (`run_in_background: false`). The sub-agent reads the plan sections, specs and source itself, writes the code and tests, and commits. Do not re-read the files it read or restate its work. Give each sub-agent:

- The plan's title, `owns`, and `proves`.
- The plan's opening paragraph, the plan sections the task touches, and the spec sections they link.
- The task goal and the reports from completed tasks. For a joined plan, a two-line summary of what the branch's other plans changed.
- The requirement to change only paths in `owns` and follow `AGENTS.md`.
- The requirement to run `npm run verify`.
- The requirement to create a short commit and not push it.
- That it is already a sub-agent: it does the work itself and dispatches no sub-agent of its own. Its role ends at the commit and the report; it does not push, edit the pull request, or review.

Require a report of fewer than 20 lines: what it built, which files changed, what it could not complete, and any out-of-scope work it found. Add one build-log row per report, and tick the plan's **Steps** checkboxes it completed.

## 4. Run the checks

After the final task, run `npm run verify` once. If it fails, give the output to a new fix sub-agent. Do not fix it directly. If two fix attempts fail for the same problem, stop fixing it, put the problem at the top of the pull request body, and go on to step 5.

## 5. Run the cold review in a sub-agent

Start this step as soon as step 4 ends, including when step 4 stopped on a failure.

Start one **new** `agent-coding` sub-agent (`subagent_type: "agent-coding"`, `run_in_background: false`). Do not review the branch yourself, and do not reuse a task or fix sub-agent. Give it only this prompt:

```text
Load the review-branch workflow and follow it. Return its report as your final message.

Branch: <branch>. Worktree: <absolute path>. Base: <review base>.
Goal: <the plan title and the first sentence of its opening paragraph>.
Specs: <the spec files and sections the plan links>.
Proves: <the plan's proves line>.
```

The review base is the pull request's base (`origin/main` or the stacked branch) for step 1a, and `<plan base sha>` for step 1b.

If the sub-agent cannot load skills, replace the first line with the body of `.factory/workflows/review-branch/SKILL.md` (without its frontmatter). Do not give the reviewer the plan, your reasoning, or implementation difficulties.

If the report does not end with a `VERDICT:` line, start a new reviewer once more. If that also fails, put "cold review did not complete" at the top of the pull request body and continue to step 6.

## 6. Handle the review

1. **Triage.** Read each finding against the code it names. Accept it if the failure can happen. Decline it if it has no concrete failure, is out of the plan's scope, or contradicts a plan decision or the spec; write a one-line reason a reviewer can check. Decline a BLOCKER only if you can show the failure cannot happen.
2. **Clean report.** If nothing is accepted, go to step 7.
3. **Fix.** Record the current commit as `<pre-fix sha>`. Give every accepted BLOCKER and RISK to **one** new fix sub-agent, with the finding IDs and text exactly as written, the files, the plan's `owns`, and the step 3 rules. Require a report listing each finding ID as *fixed* with its commit, or *not fixed* and why. Cheap accepted NOTEs go to the same sub-agent; others go under *Found while building*.
4. **Re-check.** Run `npm run verify` again, under the same two-attempt limit.
5. **Re-review.** Start another **new** `review-branch` sub-agent with `Base: <pre-fix sha>`. Triage it the same way.
6. **Limit.** At most two fix-and-re-review rounds. Then put every unresolved BLOCKER at the top of the pull request body and set the verdict from the last review.
7. **Record.** Fill the **Review** section: the final verdict, each fixed finding with its commit, each declined finding with its reason. One verdict per plan when the pull request carries several. Add a build-log row per round.

## 7. Record proof

Run the plan's `proves` command yourself. Paste the actual output into the pull request. Do not state that a check passed unless you ran it. Put each check you could not run under **For the developer** as a *try this* item.

## 8. Land on the branch

Check first: if **Review** has no verdict from a `review-branch` sub-agent for this plan, go back to step 5.

Write the landing bookkeeping now, as the last commit, so that a merge at any moment leaves `main` correct. Do each step for every plan the `**Plan:**` line lists:

- Set the plan to `status: merged` and check that `pr:` names this pull request. Tick its **Steps** checkboxes that were done. (`next.mjs` reads status from `origin/main` and the claim from the open pull request, so the plan stays in flight until the merge.)
- In `docs/roadmap.md`, tick the plan's checkbox. Do not add lines or reorder: only `prioritise-roadmap` does that.
- For each open question the build answered, move it from **Open questions** to **Decisions** in `docs/roadmap.md` with today's date and this pull request.
- Write one changelog entry from `.factory/templates/changelog.md`: `docs/changelog/YYYY-MM-DD-<pr-slug>.md`. Say what a user of `metafab` can do now that they could not before.
- Record each *Found while building* note with `file-work`. A note the build already fixed needs no intake file; say so beside it.

Run `git fetch origin && git merge origin/main` first (never rebase a pushed branch). A conflict in `docs/roadmap.md` is usually another plan's tick on a neighbouring line: keep both. Then run `node .factory/scripts/check.mjs`, commit as `docs: land <plan-slug>`, and push.

## 9. Stop at the draft pull request with a TL;DR

Complete the body sections: TL;DR, changes, proof, review, **For the developer**, build log, found while building. In **For the developer**, include uncertainties and a short *try this* list of commands. Leave the pull request as a draft.

Leave a worktree the orchestrator can remove after the merge: `git status --porcelain` must print nothing. Ignored files do not block removal, so clean nothing more.

The developer switches between several worker sessions and reads each one cold. End with this handoff as your final message, and put the same text (without the last line) in the body's **TL;DR** section. Write it for someone who has not read the plan, in user terms, not file lists. Keep it under 20 lines:

```text
## <plan number and name>: ready for your review
#<pr> (draft) · <branch> · <worktree path>

**What the plan was for:** one or two sentences: the problem and what metafab could not do before.
**What it does now:** two to four bullets a metafab user would notice.
**How it was proved:** the proves result, npm run verify, and the review verdict (n fixed, n declined).
**Needs your eye:** decisions you made that the plan did not, spec changes, uncertainties, open
questions you answered. Write "nothing" if there is nothing.
**Try it:** two to four commands, runnable from this worktree.
**Setup notes:** only if something unexpected happened (hand-run npm install, general-purpose fallback).

The landing bookkeeping is already on the branch, so it is safe to merge as it is. Give feedback
here and I will apply it, or say "looks good" and I will bring it up to date with main, re-run the
checks and mark it ready for you to merge.
```

If a check failed, the cold review did not complete, or a BLOCKER is unresolved, put it first under **Needs your eye** and replace the last paragraph with: "Do not merge yet: <the problem>. Tell me how you want to handle it."

When the developer replies, continue with `finish-plan` in this session.
