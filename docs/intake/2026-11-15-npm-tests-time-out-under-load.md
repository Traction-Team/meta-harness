---
title: Two npm integration tests time out at 5000 ms in a full verify under load
kind: tooling
status: new
filed: 2026-11-15
reported-by: build-plan worker for 2.011, cold review 1 of PR #32, 15 Nov
source: https://github.com/Traction-Team/meta-harness/pull/32
links: []
---

# Two npm integration tests time out at 5000 ms in a full verify under load

## What happened, or what is wanted

In the first cold review of PR #32, `npm run verify` failed with 2 of 1688 tests timing out at vitest's 5000 ms default: `test/core/import/npm.test.ts:58` and the ENOSPC case in `test/core/sources/fs-errors.test.ts:255`. Both files are unchanged from `origin/main`. Rerun alone, both files passed all 19 tests, and full `npm run verify` runs in two other orbs on the same branch passed. Seen once in four full runs. Expected: a full verify does not depend on how loaded the machine is.

## What we know

Both tests start a local registry and run npm, which is slow when the whole suite runs in parallel. Options: a longer per-test timeout for the npm integration tests, or running those files in a separate, less parallel vitest project.
