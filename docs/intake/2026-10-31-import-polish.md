---
title: Import duplicates init helpers, and some summary and test details need tightening
kind: follow-up
status: new
filed: 2026-10-31
reported-by: cold review (review-branch, rounds 1 and 3), PR #12, 31 Oct
source: https://github.com/Traction-Team/meta-harness/pull/12
links: [docs/plans/1.009-import.md, docs/specs/sharing.md]
---

# Import polish after 1.009

## What happened, or what is wanted

Small follow-ups from the reviews of PR #12. None loses data.

## What we know

- `src/core/import/run.ts`: `cliVersion`, `unreadableFactory`, `assertFactoryDirectoryUsable`, `unreadableConfig`, `readConfig`, `selectedTargets` and a `preflightBuild` helper are copied from `src/core/init/run.ts`, which was outside the plan's `owns`. Export them from init (or a shared module) and import them.
- `src/core/summary.ts:77-81`: `modeDiffers` compares every 0o777 bit, though its comment says "permission bits that matter". A permission-only change shows as `M <path>` with no detail. Compare only the executable bit, or annotate the row.
- `test/core/summary/trees.ts`: the link fixture takes `LINK_HASH_PREFIX` from production code, so no test pins the link hash format.
- `test/core/import/import.test.ts:471-481`: the empty-directory conflict test does not compare the repository snapshot before and after, unlike its sibling tests.
- Pre-existing HTTPS fetch tests in `test/core/sources/` leave fetched temporary directories behind (tests only).
