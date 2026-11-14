---
title: The publish summary prints a Windows drive publish.git with part of the path cut out
kind: follow-up
status: new
filed: 2026-11-14
reported-by: cold review of PR #20 (Plan 1.021), 14 Nov
source: "#20"
links: [docs/plans/1.021-source-hardening.md, docs/specs/sharing.md]
---

# The publish summary label mangles `file://C:\…@…` paths

## What happened, or what is wanted

With `publish.git: file://C:\Users\bob@corp\fab.git`, `metafab publish --dry-run` prints `git (file://C@corp\fab.git)`. The publish itself uses the right repository; only the label is wrong.

## What we know

`targetLabel` in `src/commands/publish.ts:52` runs `stripSourceCredentials` on the raw `publish.git`, which reads `C:\Users\bob` as userinfo. Plan 1.021 added `sourceWithoutCredentials` in `src/core/sources/parse.ts` for exactly this case; `targetLabel` should use it. `src/commands/publish.ts` was outside 1.021's `owns`.
