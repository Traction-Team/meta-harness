**Plan:** docs/plans/<plan>.md[, docs/plans/<plan joined later>.md] · **Stacked on:** none | #<pr> (`<branch>`)

## What changes

The plan's opening paragraph, rewritten for a reviewer who has not read the plan: what `metafab` does after this merges that it did not before, and what is left for a later plan. List any spec section this PR changes, and why.

## Proof

<!-- The real output of the plan's `proves` line. Never write that a check passed without running it. -->

```
$ <command>
<output, trimmed to what shows the result>
```

- [ ] `npm run verify`

## Review

Verdict: <merge | merge after the blockers | block>

- Fixed: <one line per blocker or accepted risk the fixer closed>
- Declined: <finding> — <why it is not a defect here>

## For the developer

- What the agent was unsure of.
- **Try this:** the manual checks worth doing, with the commands to run them in a scratch repository.

## Build log

| Task | Built | Notes |
|---|---|---|
| 1. <task> | <files> | <what it could not do, what it found out of scope> |

## Found while building

Out-of-scope problems and follow-ups. `finish-plan` files each one with `file-work` before the PR merges.
