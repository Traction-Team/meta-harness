**Plan:** <plans>/<plan>.md[, <plans>/<plan joined later>.md] · **Stacked on:** none | #<pr> (`<branch>`)

<!--
Written for a developer who has not read the plan and is about to review the diff. Write everything above the build record from the finished diff, before the draft is handed over. Delete every comment and any section this pull request does not need.
-->

## TL;DR

<!-- build-plan writes this at handoff and finish-plan keeps it current: what the plan was for, what it does now, how it was proved, what needs the developer's eye, and how to try it. Under 20 lines. -->

## Why

What is wrong or missing today, for whom, and what it causes. Two to four sentences in product terms.

## What this does

One or two sentences on the change as a whole: the new thing, and where it lives (`path/to/entry.ts`).

- **<aspect>:** how it behaves, with the numbers and names a reviewer needs.
- **<aspect>:** …

## What changes for you

What a developer, user or operator notices after this merges, and what stays the same. "Nothing, unless …" is a good answer.

## Screenshots

<!-- Only when the change shows on screen. Reference a local file here and upload it with `gh pr edit --body-file <body> --attach <file>`; keep the file outside the repository. Delete this section when nothing changes on screen. -->

![<what the screenshot shows>](<path/to/local.png>)

## Worth a look

- **<the risky or surprising change>** in `<file>`: what it does, and why it is safe.
- Config, migration or infrastructure changes, and what they need (a container recreate, a backfill, a switch turned on).
- Where most of the diff is, and what is safe to skim.

## Before merge

- [ ] <a one-time step a person must do, and who>. Delete this section when there is none.

## Try it

1. <command or step>, and what you should see.
2. …

<details>
<summary>Build record: proof, cold review, build log</summary>

### Proof

<!-- The real output of the plan's `proves` line. Never write that a check passed without running it. -->

```
$ <command>
<output, trimmed to what shows the result>
```

- [ ] the `verify` command

### Review

Verdict: <merge | merge after the blockers | block>

- Fixed: <one line per blocker or accepted risk the fixer closed>
- Declined: <finding> — <why it is not a defect here>

### Build log

| Task | Built | Notes |
|---|---|---|
| 1. <layer> | <files> | <what it could not do, what it found out of scope> |

### Found while building

**Tooling problems.** What failed or needed a workaround for a reason other than this code: the command, the error, the workaround, how often. Each is filed as a `kind: tooling` intake note in the landing commit.

- <none>

**Existing bugs.** Defects outside this work that a user or operator can hit. Each is filed as a `kind: bug` intake note in the landing commit.

- <none>

**Not done here.** Edges of this work left for later: tests, polish, a workaround to remove, the next step. Not filed to intake; for a plan with a code they go to the feature doc's *Follow-ups, not yet planned* as unchecked `- [ ]` lines naming this pull request.

- <none>

</details>
