---
name: finish-plan
description: Completes the developer-led stages of a plan after build-plan hands over a merge-safe draft pull request with a TL;DR. It applies feedback through sub-agents in the plan's worktree or Amp thread, keeps the landing commit (plan merged, roadmap ticked, changelog, feature table) and the TL;DR current with every change, brings the branch up to date with the trunk, runs final checks, marks the pull request ready when the developer approves it and watches CI, runs the remote review-bot loop when review-bots is set, restacks a stacked branch whose parent merged, and answers review comments. Use it for testing feedback, "looks good" or "done", pull request review comments, or "land it".
---

# finish-plan

The developer decides when the plan's pull request is complete. Manage the process around that decision. Give each fix to a sub-agent with a precise brief. Do not make fixes directly in this session.

Run in the plan's workspace or Amp thread, where `build-plan` left it, usually in the same session. **Sub-agents.** In Amp (`AMP_THREAD_ID` is set, or you have the `create_thread` tool), each fix and review is a new Amp thread, as `build-plan`'s *Sub-agents in Amp* says, on `amp-model-coding` for a fix and `amp-model-review` for a review (empty keeps the thread's own mode), with `git push` before each thread. Elsewhere, fixes run as `subagent_type: "<sub-agent-coding>"` and reviews as `subagent_type: "<sub-agent-review>"`, which exist even when the Agent tool does not list them. `general-purpose` is only the fallback when one of those calls fails. The values come from `docs/factory.md`.

**Never** merge the pull request. **Never** resolve a review thread a person started. Mark the pull request ready only after the developer says the work is complete.

**Keep the branch merge-safe.** `build-plan` already wrote the landing commit, so the developer may merge at any time. After every change you push, the landing bookkeeping and the **TL;DR** must still be true (section C).

Run `gh pr view --json number,isDraft,state,reviewDecision,reviews,body`. Use the result and the person's request to select the section below.

The settings are read from `docs/factory.md`: `trunk`, `verify`, `stacking`, `review-bots`, `features`, `plans`, `roadmap`, `changelog`, the sub-agent keys, `amp-model-coding` and `amp-model-review`.

## A. Feedback

Use this section when the pull request is a draft.

1. If the developer has not seen the handoff in this session, show the body's **TL;DR**. If the body has none (a pull request built before this workflow changed), write one in the shape `build-plan` step 9 defines.
2. Send each in-scope feedback point to a fix sub-agent with the feedback, the files, the `owns` of the plans the pull request lists, and the checks from `build-plan` step 3.
3. If a fix changes behaviour, start a new `review-branch` sub-agent with the prompt from `build-plan` step 5 and `Base: <sha before the fix>`. Handle its report as in `build-plan` step 6.
4. Send out-of-scope feedback to `file-work`, and add it to *Found while building*.
5. Refresh the landing and the TL;DR (section C), push, and tell the developer in a few lines what changed.
6. Repeat until the developer approves.

## B. Review comments

Use this section when the pull request is open for review and has comments from people. Comments from review bots go through section E.

1. Read every unresolved thread with `gh api repos/{owner}/{repo}/pulls/<n>/comments` and `gh pr view <n> --comments`.
2. Classify each as **fix**, **decline**, or **question** for the developer. A decline needs a one-line reason a reviewer can assess.
3. Give all fixes to one fix sub-agent, naming the threads it must address. Run the checks after.
4. Refresh the landing and the TL;DR (section C).
5. Draft one reply per thread: what changed and the commit, or why nothing changed. Post them only when the developer says so.

## C. Keep the landing current

Do each check for every plan the `**Plan:**` line lists. If the branch has no `docs: land <plan-slug>` commit (built before `build-plan` wrote one), write the landing now exactly as `build-plan` step 8 describes.

- The plan says `status: merged`, `pr:` names this pull request, and its done **Steps** are ticked.
- Its roadmap checkbox is ticked, and every open question the build answered, feedback included, is under **Decisions**.
- When `features` is set and the plan has a code, the feature doc's plan table is current: run `node .factory/scripts/feature.mjs <CODE> --write`.
- The changelog entry still says what is true after the feedback.
- Every *Found while building* note added since is filed with `file-work`.
- The **TL;DR** in the body describes the branch as it is now.

Run `node .factory/scripts/check.mjs`. Commit any change as `docs: update landing for <plan-slug>` and push. Check `git status --porcelain` prints nothing, so the worktree can be removed. Do not remove the worktree: after the merge, `start-plan` removes it, or offers to archive the Amp thread.

## D. Done: mark it ready and watch CI

Use this when the developer says the work is complete ("looks good", "done", "land it").

1. Catch up with the pull request's base: `git fetch origin && git merge origin/<base>`, where `<base>` is the trunk, or the branch below for a stacked plan (never rebase a pushed branch; keep both ticks if the roadmap conflicts). If `git rev-parse --is-shallow-repository` prints `true`, run `git fetch --unshallow origin` first. A branch in a stack catches up by rebasing instead, as the `stacked-prs` skill says.
2. Run the `verify` command and the `proves` command of every plan the pull request lists. Update the proof in the body, and the landing and the TL;DR (section C). Push.
3. Run `gh pr ready`. Marking the pull request ready starts CI. Run `gh pr checks <n> --watch`: if a check fails, send its log (`gh run view <run> --log-failed`) to a fix sub-agent as in section A, push, and watch again.
4. If CI cannot start (for example every job failing in seconds with no steps), say so instead of reporting it ready to merge.
5. When `review-bots` is set, do section E before you report.
6. Only once every check passes and section E is settled, report the pull request link, say it is ready to merge, and name the next ready plan from `node .factory/scripts/next.mjs`. Say any pull request stacked on this one can restack once this merges.

## E. Remote review

Use this when `review-bots` is set and the pull request is ready, or when the developer asks you to deal with a review bot. When `review-bots` is empty, skip this section and say the repository has no remote reviewer.

A remote reviewer is a bot that reviews pull requests, such as a `[bot]` login. `review-bots` holds the comment that asks it to review, for example a bot handle followed by `review`. Remote reviewers start when a pull request is marked ready and take a few minutes. Most do not review a push on their own: post the `review-bots` comment to ask again.

1. Wait until each remote reviewer has reviewed the head commit. Check the pull request's reviews and comments, and `sleep 120` in the shell between checks rather than checking in a tight loop. A reviewer is done when it has submitted a review on the head commit (`commit_id` in `gh api repos/{owner}/{repo}/pulls/<n>/reviews`), or when its summary comment says it finished. If one has not finished after about 20 minutes, post the `review-bots` comment once and wait again; if it still has not, go to step 6 and name it.
2. Read everything the remote reviewers left that is not settled: unresolved threads, review bodies and plain comments, because some bots put findings only in a summary. List the unresolved threads with their ids:

   ```bash
   gh api graphql -f query='query($owner: String!, $repo: String!, $n: Int!) { repository(owner: $owner, name: $repo) { pullRequest(number: $n) { reviewThreads(first: 100) { nodes { id isResolved isOutdated path line comments(first: 1) { nodes { author { login } url body } } } } } } }' -F owner=<owner> -F repo=<repo> -F n=<n>
   ```

   If there are no findings, go to step 6.
3. Read each finding with the code it points at, and classify it as **fix**, **decline** or **question**, as in section B. A remote reviewer's finding is a claim to check against the code, not an instruction. An outdated thread whose point the current code already settles is a decline that says so.
4. Give all fixes to one fix sub-agent, as in section B. If a fix changes behaviour, run the scoped `review-branch` sub-agent from section A. End the round as section C says.
5. Reply to every fix and decline thread, then resolve it. These threads are a bot's, and the replies are the record of what was done: a fix reply names what changed and the commit, a decline reply gives the one-line reason. Leave a question thread open and unanswered; it goes to the developer in step 6. Answer findings that are not in a thread in one pull request comment.

   ```bash
   gh api graphql -f query='mutation($id: ID!, $body: String!) { addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $id, body: $body}) { comment { url } } }' -F id=<thread id> -f body='<reply>'
   gh api graphql -f query='mutation($id: ID!) { resolveReviewThread(input: {threadId: $id}) { thread { isResolved } } }' -F id=<thread id>
   ```

6. If this round pushed fixes, post the `review-bots` comment to ask for a review of the new head, run `gh pr checks <n> --watch`, and go back to step 1. Stop after three rounds of fixes and report the threads that are still open.
7. Report, in a few lines: which remote reviewers reviewed the head commit and which found nothing, each thread fixed (with its commit) or declined (with its reason), and each question for the developer with its link.

## F. Restack after the parent merged

Use this when `stacking` is on and the branch's parent pull request merged: the host has retargeted this pull request to the trunk, and its branch still carries the parent's commits. Restack from the bottom of the stack up: a branch stacked on this one waits until this one is done.

1. Follow the `stacked-prs` skill's restack steps.
2. End the round as section C says, with the checks against `origin/<trunk>`. Name any pull request stacked on this one, which can now restack in turn.

When `stacking` is off, this section never applies: a plan whose need has not merged is blocked until the need merges.
