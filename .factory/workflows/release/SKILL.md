---
name: release
description: Ships everything merged to the trunk since the last release, through a release pull request into the release branch. It works from the remote branches in any clone, checks the release branch's history is healthy, shows what ships and what it deploys, opens or reuses the release pull request, waits for its checks, merges it with a merge commit only after the person says go, then watches the deploys and reports them. It never merges on its own initiative, never squashes, and never rolls back. It is standalone, so the pipeline never suggests it, and it stops at once when the `release` setting is `off`. Use it to cut a release, deploy, or ship a hotfix.
---

# release

**First, read the `release` setting in `docs/factory.md`. When it is `off`, say the release flow is not set up in this repository, and stop.** Do not open a pull request, merge, or change anything.

Merging the release pull request is the only thing that deploys, and it deploys with real data. The steps and the reasons behind them are in the `release-guide` document; this workflow runs them. It adds two rules of its own: it reads the remote branches and never local ones, and **it never merges without the person's explicit go-ahead**.

The settings it reads: `trunk`, `release-branch`, `release-guide`, `release-risky-paths`, `release-announce`.

## 1. Read the state from origin

```bash
git fetch origin
git log --oneline -1 origin/<release-branch>
git log --first-parent --oneline origin/<release-branch>..origin/<trunk>
```

Never switch branches, pull, or read a local copy: they are stale, and the release is about what origin holds. Anything that needs a branch is done in a throwaway worktree or not at all.

## 2. Check the release branch's history is healthy

```bash
git log --first-parent --oneline origin/<trunk>..origin/<release-branch>
```

That lists commits on the release branch that the trunk does not have. Expect nothing, or one merge commit from the previous release, which leaves the trunk one commit behind until the next release and is normal. Do not merge it back.

Anything else means the history is broken, and a release now makes it worse:

- **A hotfix merged to the release branch and not brought back**: a merge commit from a `fix/…` branch. It is on the release branch only, and the next release would revert it.
- **A squashed release**: the tip reads `… (#<n>)` rather than `Merge pull request #<n> from …`. The release branch should take merge commits only; if it has a squash, its rules were changed.

Stop. The repair for both is the back-merge in the `release-guide` ("Hotfixes", or "Repairs" when it has one): it may need a repository admin's `gh` login, so ask the person before pushing. Then run this workflow again from step 1. Say plainly which of the two you found.

## 3. Show what ships

`git log --first-parent --oneline origin/<trunk>..origin/<release-branch>` is the release: one line per merged pull request. If it prints nothing, there is nothing to release. Say so and stop.

```bash
git diff --name-only origin/<release-branch>...origin/<trunk>
```

Check the diff against `release-risky-paths`: a comma-separated list of path prefixes, or `none`. For each prefix the diff touches, say in plain words what it changes and what to watch. `none` lists nothing.

Then say what the release starts, from what the `release-guide` says a release deploys: the parts whose paths changed, and anything that runs on every release. Never name a deploy step the guide does not name.

## 4. Open or reuse the release pull request

```bash
gh pr list --base <release-branch> --head <trunk> --state open
```

An open one is this release: reuse it, rewrite its body as below (`gh pr edit <n> --body-file <file>`), and do not open a second. Say you reused it.

Otherwise write the body (see "Writing the release body") to a file in the harness's temp directory, and open it:

```bash
gh pr create --base <release-branch> --head <trunk> --title "release: $(date +%F) <headline change>" --body-file "$TMPDIR/release.md"
```

The title is the date and a few words on the headline change, taken from the log: `release: 2026-11-02 hide the old settings page`. There can be several releases a day, so the words are what tells them apart; when nothing stands out, say what it is (`fixes and docs`), and if two on one day still read the same, add the time to the second.

### Writing the release body

Create the body from `.factory/templates/release-body.md`. Write it for the person who approves the release and has not read every pull request in it. Show it to them before you open or update the pull request.

- **Team update: ask the person what the team should hear.** Write this section only when `release-announce` names a place. List each change someone outside engineering would notice, one plain line each: what someone can now do or will notice, with no plan codes, pull request numbers, table names or tool names. Ask the person which of them to tell the team about, and wait for the answer. The section holds only the lines they said yes to, in the wording they agreed. When they choose none, or the release has nothing for users, it says "Fixes and upkeep, nothing new to see." When `release-announce` is `none`, delete the section: nothing is posted.
- **Read what ships, not only the titles.** For each `feat:` and `fix:` pull request, read its body (`gh pr view <n>`) and, when it claims a plan, that plan's `switch:` and **Release:** lines. Those fill *Before you merge*: access someone must grant, a person who must be told, a switch to have ready.
- **Risky paths from the diff.** Use step 3's list. Say what each one changes for the person who runs the release.
- **Deploys from the guide.** Fill the *Deploys* section from the `release-guide`, and say what to watch after the merge.
- **Ships is the first-parent log, grouped.** Plain list items, never a code block, so the host links each commit and pull request.
- **No title line and no merge instructions.** The pull request title carries the date; the body starts with the line that links the previous release (`gh pr list --base <release-branch> --head <trunk> --state merged --limit 1`).

## 5. Wait for the checks

```bash
gh pr checks <n> --watch --required
```

Wait for the release pull request's required checks only. A check the guide says is not required and adds nothing at release can be left out.

A failure means the trunk is not releasable. Do not fix anything in this workflow: stop, report which check failed, and say the fix is an ordinary pull request into `trunk` followed by a release again.

## 6. Get the go-ahead, then merge

Show the person, before anything merges:

- what ships, the first-parent log, with the headline changes in your own words
- the `## Team update` lines word for word, when the section is there, and that they are the ones the person chose
- every item under *Before you merge* in the release body, and whether it is done
- the risky paths from step 3 and what each one changes
- what the guide says this release deploys
- the checks result
- the pull request URL

Then ask for an explicit yes to merge and deploy. **Stop and wait for it.** Being asked to cut a release is the instruction to open the pull request, not the go-ahead to merge: that comes only after the person has seen this list and the checks. Never merge on your own initiative, and never treat silence or an earlier enthusiasm as the answer.

```bash
gh pr merge <n> --merge
```

Always name the pull request by number: a bare `gh pr merge` in a feature worktree merges that worktree's own pull request, or fails when it has none. Never `--squash`, because a squashed release drops the ancestry the next release depends on, and never `--delete-branch`, because the head branch is the trunk and it stays.

## 7. Verify the merge, immediately

```bash
git fetch origin
git log --oneline -1 origin/<release-branch>
```

It must read the merge commit (`Merge pull request #<n> from …`). If it reads `… (#<n>)`, the release was squashed: repair it now, before the next release, with the back-merge in the `release-guide`, on the person's say-so. Tell the person it happened and that it is repaired.

## 8. Watch the deploys

Follow the `release-guide` for what a release starts and how to watch it:

```bash
gh run list --branch <release-branch> --limit 20
gh run watch <run-id> --exit-status
```

Report to the person, in plain words, each result the guide says to report and whether the release is live. A failed deploy usually leaves the previous version serving. Fix forward on the trunk with an ordinary pull request and release again; nothing re-runs a deploy on its own, and there is no rollback workflow.

## Hotfixes

A hotfix is a fix that must deploy now. The two routes are in the `release-guide` ("Hotfixes"); pick the one that fits and say which.

**Route 1: the trunk is safe to ship.** The fix is an ordinary pull request into the trunk. Then run this workflow straight away instead of waiting for the next release.

**Route 2: the trunk holds work that must not ship yet.** Branch the fix from `origin/<release-branch>` and follow the guide's steps for it, including how it opens its pull request and the one-commit check when the guide asks for it. Merge it with `--merge` once the person says go: that merge is the fix deployed.

Then bring the release branch back into the trunk immediately, following the guide's back-merge steps, because the next release would otherwise revert the fix. Ask the person for a yes first when the guide's steps need an admin or a rule change. Confirm it landed with `git log --first-parent --oneline origin/<trunk>..origin/<release-branch>`, which is empty afterwards, then say so. If the push or a rule change is refused, say so and stop.

Never squash, rebase or cherry-pick the fix onto the trunk instead: each puts a single-parent commit on the trunk, the release branch never becomes an ancestor of the trunk, and every later release is wrong in the same way.

## Repairs

A broken release branch is repaired by the `release-guide`'s own repair steps, run on the person's say-so. Never rewrite the release branch by hand, and never start a release from a history step 2 called broken.
