---
title: update and import do not print the git hook changes their build made
kind: follow-up
status: new
filed: 2026-11-08
reported-by: build-plan worker, PR #17, 8 Nov
source: "#17"
links: [docs/specs/building.md, docs/plans/1.018-sharing-polish.md]
---

# update and import do not print the git hook changes their build made

## What happened, or what is wanted

`build` and `init` print `+ git hook post-merge` lines and carry `hooks` in `--json`. `update` and `import` also run `applyBuild`, which syncs hooks, and since PR #17 they show its hook warnings, but they do not print the hook changes or include `hooks` in `--json`.

## What we know

The change belongs in `src/commands/update.ts` and `src/commands/import.ts` (outside 1.016's `owns`), reading `report.hooks` from `applyBuild`. Plan 1.018 already owns `src/commands/update.ts` and `src/core/update/**`, so it could carry this.
