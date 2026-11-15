---
name: stacked-prs
description: How to build a plan stacked on an unmerged plan's branch, link the stack in the host, catch up with the base and restack after the parent merges. Load it only when `stacking` is `on` in docs/factory.md and a plan's `needs` has not merged.
---

# Stacked pull requests

`stacking` decides what happens to a plan whose `needs` has not merged:

- **`off`**: the plan waits. `next.mjs` lists it as blocked, and `start-plan` leaves it for a later wave.
- **`on`**: the plan is ready, and it is built on the need's branch. That is a **stack**.

A stack is a chain of branches where each pull request's base is the branch below it. A chain of unmerged needs stacks on the top of the chain. Two unmerged needs on separate branches still block the plan, because a branch has one base. With `stacking` off this skill does not apply: stop and let the plan wait.

## Claim a stacked plan

1. Create the branch from the base the plan stacks on: `git switch -c <type>/<plan-file-stem> origin/<branch below>`.
2. Open the draft with the base named: `gh pr create --draft --base <branch below> --title "<plan title>" --body-file <body>`.
3. Put **Stacked on:** on the first body line, beside the plan: `**Plan:** <plans>/<plan>.md · **Stacked on:** #<pr> (`<branch below>`)`.

## Link the stack

Linking makes the host show a stack map, check every pull request against the trunk's rules, and rebase the next branch onto the trunk when the bottom one merges.

List the chain from the bottom up: follow each base branch down until it is `<trunk>` with `gh pr list --head <base branch> --json number,baseRefName`. Then link it:

```bash
gh stack link --base <trunk> <bottom pr> … <parent pr> <this pr>
```

`gh stack` comes from the `gh-stack` extension. When `gh stack --version` fails, run `gh extension install github/gh-stack` first; it uses the existing `gh` login. A stack is a single line, so `link` refuses when the parent already has another pull request stacked on it. Then leave this pull request unlinked and say so in the build log: it still works as a pull request based on the parent's branch, but nothing rebases it for you.

## Catch up with the base

A branch in a stack catches up by **rebasing**, because a stack merges only when its history is linear and a merge commit from the base breaks that. A branch on its own catches up by **merging** `origin/<trunk>` and is never rebased.

Each session rewrites only its own branch. **Never** run `gh stack rebase`, `gh stack sync` or `gh stack push`: each rewrites and pushes every branch in the stack, including the branches other sessions are building. A person may press **Rebase stack** in the host; that rewrites every branch there, and each session takes the change the next time it catches up.

```bash
git fetch origin
git pull --rebase    # takes any rewrite of this branch made by the host, and keeps local commits on top
```

Then:

- **In a stack:** `git rebase --fork-point origin/<base>`, then `git push --force-with-lease`. `--fork-point` leaves out the parent's old commits when the parent was rebased since this branch last caught up.
- **On its own:** `git merge origin/<trunk>`, then push.

Check that `git diff origin/<base>...HEAD --stat` shows only this branch's own work. If the base's files show up, stop and tell the developer. Resolve a generated file's conflict by running its generator again, and give any other conflict to a fix sub-agent with both sides and the plan's `owns`. `git rebase --continue` resumes after each resolution and `git rebase --abort` backs out.

## Restack after the parent merges

The host deletes a merged branch and retargets every pull request stacked on it to `<trunk>`. Restack from the bottom of the stack up: a branch stacked on this one waits until this one is done.

1. Check the base: `gh pr view --json baseRefName`. If it still names the merged parent's branch, run `gh pr edit --base <trunk>`.
2. Run `git fetch origin && git pull --rebase`. That takes the host's rebase of this branch, if it made one, and keeps local commits on top.
3. Run `git diff origin/<trunk>...HEAD --stat`. If it shows only this branch's own work, the host did the restack: go to step 5.
4. Otherwise the branch still carries the parent's original commits, which the trunk now holds as one squashed commit. Move this branch's own commits off the parent's: `git rebase --onto origin/<trunk> <parent's last head>`, where `gh pr view <parent pr> --json headRefOid -q .headRefOid` gives the parent's last head. Then `git push --force-with-lease`. Resolve a conflict in a file the parent changed by taking `<trunk>`'s side for the parent's lines and keeping this branch's own. Run step 3 again; if the parent's files still show up, the rebase went wrong: stop and tell the developer.
5. Update the first body line to `**Stacked on:** none`.
6. Run the checks against `origin/<trunk>`, refresh the landing commit, and name any pull request stacked on this one, which can restack in turn.

## Merge a stack

A stack normally merges from the bottom up, and the host allows it only when every pull request in it is ready, approved and passing. A person runs `node .factory/scripts/merge-stack.mjs <top pull request>` when they must merge their own stack and cannot approve it themselves; `--dry-run` lists what would merge first. The script refuses while `stacking` is `off`, and refuses drafts and unfinished checks. No workflow runs it: merging is the person's call.
