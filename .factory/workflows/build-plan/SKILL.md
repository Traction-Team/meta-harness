---
name: build-plan
description: Builds one plan on the current feature branch, usually as the worker start-plan started in its own workspace. It renames the branch, claims the plan with a draft pull request, or adds it to the branch's open pull request, stacking it when stacking is on, delegates implementation tasks to coding sub-agents, runs the narrower checks when they are set and verify otherwise, always runs the review-branch workflow in a fresh sub-agent, triages its findings and sends accepted ones to a fix sub-agent, re-reviews the fix commits, records proof, and writes the landing commit (plan merged, roadmap ticked, changelog, feature table), so the branch is safe to merge as it stands. It stops with a draft pull request and a TL;DR handoff for the developer. On the trunk it does not build; it sends the person to start-plan. Use it for "build <plans>/<plan>.md". It never marks a pull request ready and never merges.
---

# build-plan

Manage one plan. Pass concise reports between sub-agents, not complete transcripts. You own the task order, checks, and pull request.

You are usually a **worker**: `start-plan` started you with a short brief, in a workspace of its own. Stay thin. Do not read the source, the specs in depth, or the diff in full yourself; the sub-agents hold that context and it ends with them. Read the diff from git only when a later step needs it.

<!-- factory:import ../../partials/sub-agents.md -->

The current feature branch is where the plan is built. A plan usually gets its own pull request, but when the branch already has one, the plan joins it. Never build on the trunk.

The run is always: check the branch → claim → task sub-agents → checks → **review sub-agent (`review-branch`)** → handle findings → proof → **land** → draft and TL;DR. The review is not optional. Do not push the final branch, fill the pull request's review section, or report done until a `review-branch` sub-agent has returned a verdict for this plan's work.

The plan's file name follows `plan-names`: `numbered` (`<round>.<NNN>-<slug>.md`, such as `1.005-check.md`) or `dated` (`YYYY-MM-DD-[<code>-<n>-]<slug>.md`). Its **stem** is the file name without `.md`, and the branch carries it. When `features` is set and the plan belongs to a feature, its code (`<CODE>-<n>`) is in its frontmatter and in the pull request title; use the code to refer to the plan.

**The branch is always merge-safe when you hand it over.** The developer may review the diff and merge it straight away, without running `finish-plan`. So the landing bookkeeping (step 8) goes on the branch before the handoff, not later.

**Never** mark the pull request ready or merge it. Do not edit `.factory/`, or a plan the pull request does not list, or the roadmap beyond the landing edits in step 8. Change only paths in the `owns` lists of the plans the pull request lists, those plans, and the spec sections they implement when the code has to differ (say so in the pull request). If the implementation requires another path, add it to `owns` in the plan and explain why in the pull request.

The settings are read from `docs/factory.md`: `trunk`, `setup`, `verify`, `check-changed`, `test-file`, `stacking`, `features`, `dev-server`, `plans`, `roadmap`, `changelog`, the sub-agent keys, `amp-model-coding` and `amp-model-review`.

## 0. Check the branch

Run these in parallel:

```bash
git fetch origin
git branch --show-current && git status --short
gh pr view --json number,state,body,baseRefName,headRefName   # the pull request for this branch, if any
node .factory/scripts/next.mjs --json                         # inFlight shows every open pull request that claims a plan
```

If the body's first line says the branch is **Stacked on** a pull request but `baseRefName` is now `trunk`, the parent has merged: run *Restack after the parent merged* before anything else.

<!-- factory:import ../../partials/worker-setup.md -->

`start-plan` proved the trunk green before it started you, so do not run `verify` as a baseline.

Then take the first case that matches:

1. **On the trunk or a detached HEAD: stop.** Do not branch, claim, commit, or build. Tell the person in two or three lines that build-plan builds on a feature branch, and offer `start-plan` (the plan exists and is ready) or `plan-feature` (no plan yet). Continue only if the person or `start-plan`'s brief explicitly asks to build in this session anyway: create the branch as `start-plan` names it (`git switch -c <type>/<plan-file-stem> origin/<trunk>`) and go to case 3.
2. **Another branch's open pull request claims this plan:** stop. Report the pull request and branch that own it.
3. **On a feature branch with no open pull request:** build here. Claim the plan with a new draft pull request (step 1a).
4. **On a feature branch whose pull request already lists this plan:** resume. Read the build log and go to the first task not done.
5. **On a feature branch whose open pull request lists other plans:** build here, in that pull request (step 1b). Tell the person in one line, for example "Adding this plan to #12 on `feat/x`. Say *stack it* if you want its own pull request." Do not wait. If they say *stack it*, run `git switch -c <type>/<plan-file-stem>` and claim with step 1a, with `--base <current branch>`.
6. **On a feature branch whose pull request is merged or closed:** stop. Offer `start-plan`.

## 1. Read and claim the plan

Read the whole plan, every spec section it links, and the merged diff (or the branch) of every plan in `needs`.

**1a. New pull request.**

- Set the plan to `status: building`. Commit as `docs: claim <plan-slug>` and push with `-u`.
- Create the pull request body from `.factory/templates/pr-body.md`. Keep `**Plan:** <plans>/<plan>.md` as the first line: other sessions read it as the claim.
- `gh pr create --draft --title "<plan title>" --body-file <body>`.
- Set `pr: <n>` in the plan, commit, and push.

**A stacked plan (`stacking` is `on`, and the plan's `needs` is not merged).** Create the branch from `origin/<branch below>` (the plan's `stackedOn`), pass `--base <branch below>`, and put **Stacked on:** on the first body line: `**Plan:** <plans>/<plan>.md · **Stacked on:** #<pr> (`<branch below>`)`. Then link the stack as the `stacked-prs` skill says, and say so in the build log if the host refuses and the pull request stays unlinked. The parent's worker wakes this one when its draft is pushed; if the parent's plan still reads `building` on its branch, say in two lines that this plan is claimed and waits, then end the turn. A plan whose two unmerged needs are on separate branches does not stack: say so and stop.

**1b. Join the open pull request.**

- Record the current commit as `<plan base sha>`. This plan's review starts from it.
- Set the plan to `status: building` and `pr: <n>`, commit as `docs: claim <plan-slug>`, and push.
- Add the plan to the first body line, comma-separated. Keep every plan already there.
- In **What changes**, add a paragraph for this plan.
- If the title no longer describes the work, rewrite it to cover all its plans and say so in your final report.
- Edit the body with `gh pr view --json body -q .body > <body>`, then `gh pr edit --body-file <body>`.

### Catching up with the base

Do this before step 2 and again before step 4. A branch in a stack catches up by rebasing; a branch on its own merges `origin/<trunk>` and is never rebased. The `stacked-prs` skill has the commands. After catching up, `git diff origin/<base>...HEAD --stat` must show only this branch's own work. If it shows the base's files, stop and tell the developer.

## 2. Divide the plan into tasks

Use the plan's **Steps** as the starting point. Group them into two to four tasks, in this order where it applies:

1. Shared types, data shapes and utilities, with unit tests.
2. Core logic, with unit tests and fixtures.
3. Command wiring: argument handling, human and `--json` output, exit codes, with in-process tests.
4. Spec and plan updates the build turned out to need.

Add the task list to the pull request's build log before implementation starts. When the pull request carries several plans, start each row with the plan's slug or code.

## 3. Use one sub-agent for each task

Run tasks in order, one `sub-agent-coding` sub-agent each, started as the sub-agents section says. The sub-agent reads the plan sections, specs and source itself, writes the code and tests, and commits. Do not re-read the files it read or restate its work. Give each sub-agent:

- The plan's title, `owns`, and `proves`.
- The plan's opening paragraph, the plan sections the task touches, and the spec sections they link. When `specs` is empty, say so and give no spec sections.
- The task goal and the reports from completed tasks. For a joined plan, a two-line summary of what the branch's other plans changed.
- The requirement to change only paths in `owns` and follow `AGENTS.md`.
- The requirement to run the checks: `check-changed` when it is set, so only the changed scope is checked, and the `verify` command otherwise. If it wrote or changed a test file and `test-file` is set, run that file with its path in place of `<path>`.
- The requirement to create a short commit, and to push only when the sub-agents section says it must.
- That it is already a sub-agent: it does the work itself and dispatches no sub-agent of its own. Its role ends at the commit and the report; it does not edit the pull request or review.

Require a report of fewer than 20 lines: what it built, which files changed, what it could not complete, and any out-of-scope work it found. Add one build-log row per report, and tick the plan's **Steps** checkboxes it completed.

## 4. Run the checks

After the final task, run the checks once: `check-changed` when it is set, so only the changed scope is checked, and the `verify` command otherwise. If it fails, give the output to a new fix sub-agent. Do not fix it directly. If two fix attempts fail for the same problem, stop fixing it, put the problem at the top of the pull request body, and go on to step 5.

## 5. Run the cold review in a sub-agent

Start this step as soon as step 4 ends, including when step 4 stopped on a failure.

Start one **new** review sub-agent, as the sub-agents section says. Do not review the branch yourself, and do not reuse a task or fix sub-agent. Give it only this prompt:

```text
Load the review-branch workflow and follow it. Return its report as your final message.

Branch: <branch>. Worktree: <absolute path>. Base: <review base>.
Goal: <the plan title and the first sentence of its opening paragraph>.
Specs: <the spec files and sections the plan links>.
Proves: <the plan's proves line>.
```

When `specs` is empty, leave the `Specs:` line out. The review base is the pull request's base (`origin/<trunk>` or the stacked branch) for step 1a, and `<plan base sha>` for step 1b.

If the sub-agent cannot load skills, replace the first line with the body of `.factory/workflows/review-branch/SKILL.md` (without its frontmatter). Do not give the reviewer the plan, your reasoning, or implementation difficulties.

If the report does not end with a `VERDICT:` line, start a new reviewer once more. If that also fails, put "cold review did not complete" at the top of the pull request body and continue to step 6.

## 6. Handle the review

1. **Triage.** Read each finding against the code it names. Accept it if the failure can happen. Decline it if it has no concrete failure, is out of the plan's scope, or contradicts a plan decision or the spec; write a one-line reason a reviewer can check. Decline a BLOCKER only if you can show the failure cannot happen.
2. **Clean report.** If nothing is accepted, go to step 7.
3. **Fix.** Record the current commit as `<pre-fix sha>`. Give every accepted BLOCKER and RISK to **one** new fix sub-agent, with the finding IDs and text exactly as written, the files, the plan's `owns`, and the step 3 rules. Require a report listing each finding ID as *fixed* with its commit, or *not fixed* and why. Cheap accepted NOTEs go to the same sub-agent; others go under *Found while building*.
4. **Re-check.** Run the checks again, under the same two-attempt limit.
5. **Re-review.** Start another **new** `review-branch` sub-agent with `Base: <pre-fix sha>`. Triage it the same way.
6. **Limit.** At most two fix-and-re-review rounds. Then put every unresolved BLOCKER at the top of the pull request body and set the verdict from the last review.
7. **Record.** Fill the **Review** section: the final verdict, each fixed finding with its commit, each declined finding with its reason. One verdict per plan when the pull request carries several. Add a build-log row per round.

## 7. Record proof

Run the plan's `proves` command yourself. Paste the actual output into the pull request. Do not state that a check passed unless you ran it. Put each check you could not run under **For the developer** as a *try this* item.

## 8. Land on the branch

Check first: if **Review** has no verdict from a `review-branch` sub-agent for this plan, go back to step 5.

Write the landing bookkeeping now, as the last commit, so that a merge at any moment leaves the trunk correct. Do each step for every plan the `**Plan:**` line lists:

- Set the plan to `status: merged` and check that `pr:` names this pull request. Tick its **Steps** checkboxes that were done. (`next.mjs` reads status from `origin/<trunk>` and the claim from the open pull request, so the plan stays in flight until the merge.)
- In the roadmap, tick the plan's checkbox. Do not add lines or reorder: only `prioritise-roadmap` does that.
- For each open question the build answered, move it from **Open questions** to **Decisions** in the roadmap with today's date and this pull request.
- When `features` is set and the plan has a code, run `node .factory/scripts/feature.mjs <CODE> --write` so the feature doc's plan table shows the plan merged, and keep the feature doc's dated status line true.
- Write one changelog entry from `.factory/templates/changelog.md`: `<changelog>/YYYY-MM-DD-<pr-slug>.md`. Say what a user can do now that they could not before.
- Record each *Found while building* note with `file-work`. A note the build already fixed needs no intake file; say so beside it.

First merge the pull request's base: `git fetch origin && git merge origin/<base>`, where `<base>` is the trunk, or the branch below for a stacked plan, so unrelated trunk commits never enter a stacked pull request's diff (never rebase a pushed branch). If `git rev-parse --is-shallow-repository` prints `true`, run `git fetch --unshallow origin` before the merge. A conflict in the roadmap is usually another plan's tick on a neighbouring line: keep both. Then run `node .factory/scripts/check.mjs`, commit as `docs: land <plan-slug>`, and push.

## 9. Stop at the draft pull request with a TL;DR

Complete the body sections: TL;DR, changes, proof, review, **For the developer**, build log, found while building. In **For the developer**, include uncertainties and a short *try this* list of commands. Leave the pull request as a draft. CI does not run on the draft: do not wait for it, and do not report its skipped checks as passing.

Leave the workspace clean so the orchestrator can remove it after the merge: `git status --porcelain` must print nothing. Ignored files do not block removal, so clean nothing more.

### Screenshots, when `dev-server` is set

When the change shows on screen and `dev-server` is set, run that command and take one screenshot for each screen or state a reviewer would otherwise have to run the app to see. Save them outside the repository, in the session's temp directory, and never commit them.

Attach them with `gh`'s `--attach` flag, which needs `gh` 2.99 or later (`gh --version`). Reference each file by its local path in the body, then attach the same files:

```bash
# in <body>: ![The new report tab](/tmp/…/report.png)
gh pr edit <n> --body-file <body> --attach /tmp/…/report.png
```

`gh` uploads each file and rewrites the reference to the hosted URL, so later rounds keep the images without attaching them again. When `dev-server` is empty, or you cannot run the app, leave the section out and add the screen to *try this* instead. Never put images in the repository to link to them.

The developer switches between several worker sessions and reads each one cold. End with this handoff as your final message, and put the same text (without the last line) in the body's **TL;DR** section. Write it for someone who has not read the plan, in user terms, not file lists. Keep it under 20 lines.

**Where it runs.** For `<where it runs>` in the TL;DR:

<!-- factory:switch env.workspace -->
<!-- factory:case orca worktree -->
the worktree's absolute path.
<!-- factory:case orb -->
`this thread in Amp`.
<!-- factory:endswitch -->

```text
## <plan number and name>: ready for your review
#<pr> (draft) · <branch> · <where it runs>

**What the plan was for:** one or two sentences: the problem and what could not be done before.
**What it does now:** two to four bullets a user would notice.
**How it was proved:** the proves result, the verify result, and the review verdict (n fixed, n declined).
**Needs your eye:** decisions you made that the plan did not, spec changes, uncertainties, open
questions you answered. Write "nothing" if there is nothing.
**Try it:** two to four commands, runnable from a checkout of this branch.
**Setup notes:** only if something unexpected happened (a hand-run setup command, a fallback sub-agent).

The landing bookkeeping is already on the branch, so it is safe to merge as it is. Give feedback
here and I will apply it, or say "looks good" and I will bring it up to date with the trunk, re-run
the checks and mark it ready for you to merge.
```

If a check failed, the cold review did not complete, or a BLOCKER is unresolved, put it first under **Needs your eye** and replace the last paragraph with: "Do not merge yet: <the problem>. Tell me how you want to handle it."

When the developer replies, continue with `finish-plan` in this session.

### Restack after the parent merged

Use this on a stacked branch whose parent pull request has merged, before anything else. The `stacked-prs` skill has the steps; restack from the bottom of the stack up, and name any pull request stacked on this one, which can then restack in turn.
