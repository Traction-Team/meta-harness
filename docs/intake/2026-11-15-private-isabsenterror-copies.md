---
title: Four more private isAbsentError copies remain after Plan 1.027
kind: follow-up
status: new
filed: 2026-11-15
reported-by: Plan 1.027 build, PR #38, 15 Nov
source: https://github.com/Traction-Team/meta-harness/pull/38
links: [docs/plans/1.027-cli-and-source-fixes.md]
---

# Four more private isAbsentError copies remain after Plan 1.027

## What happened, or what is wanted

Plan 1.027 (C5) moved `isAbsentError` (code `ENOENT` or `ENOTDIR`) to `src/util/fs.ts`. It also replaced the private copies in its own `owns`: `src/core/sources/cache.ts`, `src/core/sources/git.ts` and `src/core/publish/readme.ts`. Four private copies outside its `owns` remain.

## What we know

The private copies are in `src/core/check/markers.ts:36`, `src/core/factory/load.ts:18`, `src/core/factory/requires.ts:9` and `src/core/factory/discovery.ts:21`. Check each one tests the same codes before replacing it with the import from `src/util/fs.ts`. This is a cleanup only, with no change in behaviour.
