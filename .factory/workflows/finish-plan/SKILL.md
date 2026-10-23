---
name: finish-plan
description: Completes the developer-led stages of a plan after build-plan creates a draft pull request. It briefs the developer, applies feedback through agent-coding sub-agents in the plan's worktree, runs final checks, and marks the pull request ready when the developer approves it. It also handles review comments and, in the final pre-merge commit, marks the plan merged, ticks its line in docs/roadmap.md, records answered open questions, and writes the changelog entry. Use it for testing feedback, "looks good" or "done", pull request review comments, or "land it".
---

# finish-plan

The developer decides when the plan's pull request is complete. Manage the process around that decision. Give each fix to a sub-agent with a precise brief. Do not make fixes directly in this session.

Run in the plan's worktree, where `build-plan` left it. Dispatch every fix and review sub-agent with `subagent_type: "agent-coding"`, as `build-plan` describes: it exists even when the Agent tool does not list it, and `general-purpose` is only the fallback when an `agent-coding` call fails.

**Never** merge the pull request. **Never** resolve a review thread. Mark the pull request ready only after the developer says the work is complete.

Run `gh pr view --json number,isDraft,state,reviewDecision,reviews`. Use the result and the person's request to select the section below.

## A. Brief and feedback

Use this section when the pull request is a draft.

1. Give the developer a brief that fits on one screen: what changed, how it was proved, unresolved blockers, declined findings, builder uncertainties.
2. Add a *try this* list that exercises the change in a scratch repository, for example:

   ```bash
   npm run build
   cd "$(mktemp -d)" && git init -q
   node <worktree>/dist/cli.js init --agents claude,codex
   node <worktree>/dist/cli.js check --json
   ```

3. Send each in-scope feedback point to a fix sub-agent with the feedback, the files, the `owns` of the plans the pull request lists, and `npm run verify`.
4. If a fix changes behaviour, start a new `review-branch` sub-agent with the prompt from build-plan step 5 and `Base: <sha before the fix>`. Handle its report as in build-plan step 6.
5. Send out-of-scope feedback to `file-work`, and add it to *Found while building*.
6. Repeat until the developer approves.
7. Run `git fetch && git merge origin/main`. Do not rebase a pushed branch.
8. Run `npm run verify` and the `proves` command of every plan the pull request lists. Update the proof in the body.
9. After the developer says the work is complete, push and run `gh pr ready`. Report the pull request link.

## B. Review comments

Use this section when the pull request is open for review.

1. Read every unresolved thread with `gh api repos/{owner}/{repo}/pulls/<n>/comments` and `gh pr view <n> --comments`.
2. Classify each as **fix**, **decline**, or **question** for the developer. A decline needs a one-line reason a reviewer can assess.
3. Give all fixes to one fix sub-agent, naming the threads it must address. Run `npm run verify` after.
4. Draft one reply per thread: what changed and the commit, or why nothing changed.
5. Show the replies to the developer. Post them only when the developer says so.

## C. Prepare to merge

Use this section after approval and before merge. Put all bookkeeping in the final commit on the branch. Do each step for every plan the `**Plan:**` line lists.

- Set the plan to `status: merged` and check that `pr:` names this pull request. Tick its **Steps** checkboxes that were done.
- In `docs/roadmap.md`, tick the plan's checkbox. Do not add lines or reorder: only `prioritise-roadmap` does that.
- For each open question the build answered, move it from **Open questions** to **Decisions** in `docs/roadmap.md` with today's date and this pull request.
- Write one changelog entry for the pull request from `.factory/templates/changelog.md`: `docs/changelog/YYYY-MM-DD-<pr-slug>.md`. Say what a user of `metafab` can do now that they could not before.
- Use `file-work` to record each *Found while building* note. Include those files in this commit.

Run `node .factory/scripts/check.mjs`. Commit as `docs: land <plan-slug>` and push. Check `git status --porcelain` prints nothing, so the worktree can be removed. Tell the developer the pull request is ready to merge, and name the next ready plan from `node .factory/scripts/next.mjs`. Do not remove the worktree: after the merge, `start-plan` removes it on `main`.
