---
title: Import duplicates init helpers, and some summary and test details need tightening
kind: follow-up
status: new
filed: 2026-10-31
reported-by: cold review (review-branch, rounds 1, 3 and 4), PR #12, 31 Oct
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
- `src/core/import/conflicts.ts:228-231`: one case-only clash on a high directory (local `Skills/`, incoming `skills/`) gives one conflict line per incoming file beneath it. Group them under the directory.
- `import --force` with a case-only clash writes in place: on macOS the fab content lands under the local spelling, on a case-sensitive filesystem a second directory appears beside it. The test at `test/core/import/import.test.ts:567` passes either way. Decide whether `--force` should rename the local entry to the fab's spelling (it must not delete unrelated local files under it), then pin the result.
- Pre-existing HTTPS fetch tests in `test/core/sources/` leave fetched temporary directories behind (tests only).
