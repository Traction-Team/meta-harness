---
title: import --force does not say which local-only factory files it kept
kind: bug
status: new
filed: 2026-11-15
reported-by: Sebastian, building Plan 1.024 (PR #28), 15 Nov
source: https://github.com/Traction-Team/meta-harness/pull/28
links: [docs/plans/1.024-first-fab.md, docs/specs/sharing.md]
---

# import --force does not say which local-only factory files it kept

## What happened, or what is wanted

`metafab import github:Traction-Team/fab-basic#semver:^0.1.0 --force --setup` into this repository kept `.factory/README.md`, which the fab does not ship, but the review summary has no line for it. The only way to find it was to compare the fab's file list with `.factory/` by hand. Plan 1.024 step B2 expected the summary to show local-only files so they could be removed.

## What we know

The summary groups (Runs code, Changes every agent session, Repository files, Workflows, Other) list only files the fab adds or changes. A "Kept, not in the fab" group, or one line per kept file, would close it. Check [Sharing: Importing a fab](../specs/sharing.md#importing-a-fab) for whether the spec already asks for this.
