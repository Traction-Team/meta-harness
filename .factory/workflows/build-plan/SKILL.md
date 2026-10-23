---
name: build-plan
description: Builds one plan on the current feature branch. It claims the plan with a draft pull request, or adds it to the branch's open pull request, delegates implementation tasks to sub-agents, runs npm run verify, always runs the review-branch workflow in a fresh sub-agent, triages its findings and sends accepted ones to a fix sub-agent, re-reviews the fix commits, and records proof. It stops with a draft pull request for the developer. On main it does not build; it sends the person to start-plan. Use it for "build docs/plans/<plan>.md". It never marks a pull request ready and never merges.
---

# build-plan

Manage one plan. Delegate implementation and review to sub-agents. Pass concise reports between sub-agents, not complete transcripts. You own the task order, checks, and pull request.

The current feature branch is where the plan is built. A plan usually gets its own pull request, but when the branch already has one, the plan joins it. Never build on `main`.

The run is always: check the branch → claim → task sub-agents → checks → **review sub-agent (`review-branch`)** → handle findings → proof → draft. The review is not optional. Do not push the final branch, fill the pull request's review section, or report done until a `review-branch` sub-agent has returned a verdict for this plan's work.

**Never** mark the pull request ready or merge it. Do not edit `.factory/`, `docs/roadmap.md`, or a plan the pull request does not list. Change only paths in the `owns` lists of the plans the pull request lists, those plans, and the spec sections they implement when the code has to differ (say so in the pull request). If the implementation requires another path, add it to `owns` in the plan and explain why in the pull request.

## 0. Check the branch

Run these in parallel:

```bash
git fetch origin
git branch --show-current && git status --short
gh pr view --json number,state,body,baseRefName,headRefName   # the pull request for this branch, if any
node .factory/scripts/next.mjs --json                         # inFlight shows every open pull request that claims a plan
```

Then take the first case that matches:

1. **On `main` or a detached HEAD: stop.** Do not branch, claim, commit, or build. Tell the person in two or three lines that build-plan builds on a feature branch, and offer `start-plan` (the plan exists and is ready) or `plan-feature` (no plan yet). Continue only if the person then explicitly asks to build in this session anyway: create the branch as `start-plan` names it (`git switch -c <type>/<plan-slug-without-number> origin/main`) and go to case 3.
2. **Another branch's open pull request claims this plan:** stop. Report the pull request and branch that own it.
3. **On a feature branch with no open pull request:** build here. Claim the plan with a new draft pull request (step 1a).
4. **On a feature branch whose pull request already lists this plan:** resume. Read the build log and go to the first task not done.
5. **On a feature branch whose open pull request lists other plans:** build here, in that pull request (step 1b). Tell the person in one line, for example "Adding this plan to #12 on `feat/x`. Say *stack it* if you want its own pull request." Do not wait. If they say *stack it*, run `git switch -c <type>/<plan-slug-without-number>` and claim with step 1a, with `--base <current branch>`.
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

Run tasks in order. Give each sub-agent:

- The plan's title, `owns`, and `proves`.
- The plan's opening paragraph, the plan sections the task touches, and the spec sections they link.
- The task goal and the reports from completed tasks. For a joined plan, a two-line summary of what the branch's other plans changed.
- The requirement to change only paths in `owns` and follow `AGENTS.md`.
- The requirement to run `npm run verify`.
- The requirement to create a short commit and not push it.

Require a report of fewer than 20 lines: what it built, which files changed, what it could not complete, and any out-of-scope work it found. Add one build-log row per report, and tick the plan's **Steps** checkboxes it completed.

## 4. Run the checks

After the final task, run `npm run verify` once. If it fails, give the output to a new fix sub-agent. Do not fix it directly. If two fix attempts fail for the same problem, stop fixing it, put the problem at the top of the pull request body, and go on to step 5.

## 5. Run the cold review in a sub-agent

Start this step as soon as step 4 ends, including when step 4 stopped on a failure.

Start one **new** sub-agent (in Claude Code, the Agent tool with `general-purpose`; elsewhere, the harness's sub-agent). Do not review the branch yourself, and do not reuse a task or fix sub-agent. Give it only this prompt:

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

## 8. Stop at the draft pull request

Check first: if **Review** has no verdict from a `review-branch` sub-agent for this plan, go back to step 5.

Push the branch. Complete the body sections: changes, proof, review, **For the developer**, build log, found while building. In **For the developer**, include uncertainties and a short *try this* list of commands. Leave the pull request as a draft. Report the pull request link, the plans it carries, and the verdict in no more than three lines.
