---
name: finish-plan
description: Completes the developer-led stages of a plan after build-plan hands over a merge-safe draft pull request with a TL;DR. It applies feedback through agent-coding sub-agents in the plan's worktree, keeps the landing commit (plan merged, roadmap ticked, changelog) and the TL;DR current with every change, brings the branch up to date with main, runs final checks, and marks the pull request ready when the developer approves it. It also handles review comments. Use it for testing feedback, "looks good" or "done", pull request review comments, or "land it".
---

# finish-plan

The developer decides when the plan's pull request is complete. Manage the process around that decision. Give each fix to a sub-agent with a precise brief. Do not make fixes directly in this session.

Run in the plan's worktree, where `build-plan` left it, usually in the same session. Dispatch every fix and review sub-agent with `subagent_type: "agent-coding"`, as `build-plan` describes: it exists even when the Agent tool does not list it, and `general-purpose` is only the fallback when an `agent-coding` call fails.

**Never** merge the pull request. **Never** resolve a review thread. Mark the pull request ready only after the developer says the work is complete.

**Keep the branch merge-safe.** `build-plan` already wrote the landing commit, so the developer may merge at any time. After every change you push, the landing bookkeeping and the **TL;DR** must still be true (section C).

Run `gh pr view --json number,isDraft,state,reviewDecision,reviews,body`. Use the result and the person's request to select the section below.

## A. Feedback

Use this section when the pull request is a draft.

1. If the developer has not seen the handoff in this session, show the body's **TL;DR**. If the body has none (a pull request built before this workflow changed), write one in the shape `build-plan` step 9 defines.
2. Send each in-scope feedback point to a fix sub-agent with the feedback, the files, the `owns` of the plans the pull request lists, and `npm run verify`.
3. If a fix changes behaviour, start a new `review-branch` sub-agent with the prompt from build-plan step 5 and `Base: <sha before the fix>`. Handle its report as in build-plan step 6.
4. Send out-of-scope feedback to `file-work`, and add it to *Found while building*.
5. Refresh the landing and the TL;DR (section C), push, and tell the developer in a few lines what changed.
6. Repeat until the developer approves.
7. When the developer says "looks good" or "done": run `git fetch && git merge origin/main` (never rebase a pushed branch; keep both ticks if `docs/roadmap.md` conflicts), then `npm run verify` and the `proves` command of every plan the pull request lists. Update the proof in the body.
8. Push and run `gh pr ready`. Report the pull request link, say it is ready to merge, and name the next ready plan from `node .factory/scripts/next.mjs`.

## B. Review comments

Use this section when the pull request is open for review.

1. Read every unresolved thread with `gh api repos/{owner}/{repo}/pulls/<n>/comments` and `gh pr view <n> --comments`.
2. Classify each as **fix**, **decline**, or **question** for the developer. A decline needs a one-line reason a reviewer can assess.
3. Give all fixes to one fix sub-agent, naming the threads it must address. Run `npm run verify` after.
4. Refresh the landing and the TL;DR (section C).
5. Draft one reply per thread: what changed and the commit, or why nothing changed.
6. Show the replies to the developer. Post them only when the developer says so.

## C. Keep the landing current

Do each check for every plan the `**Plan:**` line lists. If the branch has no `docs: land <plan-slug>` commit (built before `build-plan` wrote one), write the landing now exactly as `build-plan` step 8 describes.

- The plan says `status: merged`, `pr:` names this pull request, and its done **Steps** are ticked.
- Its `docs/roadmap.md` checkbox is ticked, and every open question the build answered, feedback included, is under **Decisions**.
- The changelog entry still says what is true after the feedback.
- Every *Found while building* note added since is filed with `file-work`.
- The **TL;DR** in the body describes the branch as it is now.

Run `node .factory/scripts/check.mjs`. Commit any change as `docs: update landing for <plan-slug>` and push. Check `git status --porcelain` prints nothing, so the worktree can be removed. Do not remove the worktree: after the merge, `start-plan` removes it on `main`.
