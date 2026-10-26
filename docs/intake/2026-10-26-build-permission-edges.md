---
title: metafab build mishandles some unreadable paths and file modes
kind: follow-up
status: new
filed: 2026-10-26
reported-by: review-branch, PR #4, 26 Oct
source: https://github.com/Traction-Team/meta-harness/pull/4
links: [docs/specs/building.md, docs/plans/04-build.md]
---

# `build` permission and mode edge cases

## What happened, or what is wanted

The last cold review of PR #4 gave the verdict "merge". It left these permission and mode cases open:

- `chmod 000 .agents`, then `metafab build`: `lstat('.agents/skills')` throws EACCES (`src/core/build/plan.ts:77`). The command prints a Node stack, and `--json` returns `{ ok: false, error }` with no `problems`. The other read paths already give a Problem.
- `chmod 000 .agents/skills`: `scanDestination` and `planEmptyDirectories` both report "Cannot read .agents/skills" (`plan.ts:548`).
- `chmod 000 .agents/skills/demo`: `isOwned` swallows EACCES, so the build stops with exit 5 and says "Unowned directory... run `metafab init`". It should say to fix the permissions (`plan.ts:563`).
- Modes: installed skill files are 0644 or 0755. Only the executable bit is compared, so an installed 0666 file is not corrected (`plan.ts:686`). A 0700 source installs as 0755 (`skill.ts:174`). The spec does not fix an exact mode.

## What we know

All are in `src/core/build/`. Most are a missing `try` around `lstat` and a dedupe. For modes, decide whether `build` installs the source mode exactly or the normalized 0644/0755. Plan 05 (`check`) compares against the planner, so its answer must be the same.
