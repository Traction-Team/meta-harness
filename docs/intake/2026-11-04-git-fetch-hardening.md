---
title: Git source cache errors render as internal bugs, and the verbatim attribute list is duplicated
kind: follow-up
status: new
filed: 2026-11-04
reported-by: cold review (review-branch), PR #16, 4 Nov
source: https://github.com/Traction-Team/meta-harness/pull/16
links: [docs/specs/sharing.md, docs/plans/1.009-import.md, docs/plans/1.011-publish.md]
---

# Git fetch hardening left after PR #16

## What happened, or what is wanted

PR #16 made Git fab fetches byte-exact and turned an `info/attributes` write failure into `fetch-failed`. The review found two neighbouring gaps that existed before the branch.

## What we know

- Raw filesystem errors elsewhere in the Git fetch escape as stack traces with exit 1 instead of a `fetch-failed` problem (exit 3). A read-only `METAFAB_CACHE` or a full disk makes `mkdir(<cache>/git)` in `cloneMirror`, `mkdir(fabDir)` (`src/core/sources/git.ts` ~507) or the renames in `replaceMirror` throw EACCES/ENOSPC, which `src/cli.ts` renders through `renderBug`.
- `src/core/sources/git.ts` (`VERBATIM_ATTRIBUTES`, `VERBATIM_CONFIG`) and `src/core/publish/git-target.ts:29` keep two attribute lists. Fetch also disables `export-ignore`/`export-subst` and pins `tar.umask`, and publish does not need those. Share one module, or note in both why they differ.
