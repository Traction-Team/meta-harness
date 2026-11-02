---
title: Update mishandles case-only renames of directories and paths that fold to one name
kind: bug
status: new
filed: 2026-11-02
reported-by: cold review (review-branch, round 3), PR #16, 2 Nov
source: https://github.com/Traction-Team/meta-harness/pull/16
links: [docs/plans/1.010-update-diff-detach.md, docs/specs/sharing.md]
---

# Case-only directory renames and case-folded paths in `metafab update`

## What happened, or what is wanted

The third review of PR #16 found two case-handling defects left after two fix rounds. The merge table (`docs/specs/sharing.md#merge-rules`) expects the working tree to match the recorded upstream after an update.

## What we know

- **Blocker, case-insensitive filesystems (macOS, Windows).** A versioned update that renames an upstream *directory* only by case (`Skills/guide/SKILL.md` → `skills/guide/SKILL.md`) leaves the old spelling on disk. `src/core/update/run.ts:259` writes with `mkdir` on the parent, which reuses `Skills/`. `metafab.yaml` records `skills/...`, so `metafab diff` reports a phantom add/delete and the next update drops upstream changes to that file as "you removed". `alignFactorySpelling` (`src/core/update/spelling.ts`) is only called by the unversioned flow (`run.ts:750`). A file-level case rename works. No test covers a case-only directory rename.
- **Risk, case-sensitive filesystems.** With local `.factory/agents.md` (local-only) and `.factory/AGENTS.md`, and a source holding `AGENTS.md`, the unversioned update's `spelling.ts:41-53` picks whichever `readdir` returns first and `rename` can overwrite the other. `findPathClashes` indexes one spelling per folded path (`clashes.ts:34-41`), so nothing is refused.
