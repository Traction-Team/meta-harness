---
title: Prove a created skill passes check after build
kind: follow-up
status: new
filed: 2026-10-25
reported-by: build-plan, PR #5, 25 Oct
source: https://github.com/Traction-Team/meta-harness/pull/5
links: [docs/plans/07-authoring-commands.md, docs/plans/05-check.md]
---

# Plan 07's "passes check after build" test uses loadFactory instead

## What happened, or what is wanted

Plan 07 asks that `create workflows/review-slice --description "..."` produce a file that passes `check` after `build`. `build` and `check` were stubs when Plan 07 was built, so `test/core/edit/create.test.ts:49` validates with `loadFactory`. Once Plans 04 and 05 land, add the end-to-end test (Plan 05 is the natural home).
