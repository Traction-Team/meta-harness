---
title: Publish and sources each carry their own Git environment helpers
kind: follow-up
status: new
filed: 2026-10-31
reported-by: build-plan worker, PR #13, 31 Oct
source: "#13"
links: [docs/plans/1.011-publish.md]
---

# Duplicate Git hook, identity and environment helpers

## What happened, or what is wanted

`src/core/publish/git-target.ts` repeats the hook-disabling, prompt and environment handling that `src/core/sources/git.ts` already has. One shared helper would keep the fetch hygiene rules in one place.

## What we know

1.011 could not change `src/core/sources/**` (outside its `owns`). A refactor-only plan can move both onto one helper.
