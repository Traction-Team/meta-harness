---
title: Adoption refuses symlinks into .factory/, and some init messages name the wrong cause
kind: follow-up
status: new
filed: 2026-10-29
reported-by: cold review (review-branch, round 3), PR #10, 29 Oct
source: https://github.com/Traction-Team/meta-harness/pull/10
links: [docs/specs/cli.md, docs/plans/1.006-init-and-adoption.md]
---

# Adoption polish after 1.006

## What happened, or what is wanted

Four small follow-ups from the last review of PR #10. None loses data; they refuse too much or report the wrong cause.

## What we know

- `src/core/adopt.ts:228`: a symlink in a candidate skill must resolve inside the skill directory. `build` accepts any target inside `.factory/`, so `.claude/skills/release/notes.md -> ../../../.factory/shared/notes.md` is refused with exit 5 although it would build after the move.
- `src/core/adopt.ts:292`: problems taken from `compileSkill` keep build's wording ("points outside .factory/", fix "inside .factory/") because the skill directory is passed as `factoryDir`.
- `src/core/init/run.ts:112`: every `loadConfig` failure, including `EIO` or an internal error, is reported as "Cannot read file .factory/metafab.yaml / Check its permissions". Map the filesystem codes and let other errors through.
- `src/core/adopt.ts`: `BUILTIN_SKILL_NAMES` repeats the built-in skill list from `src/core/build/plan.ts`, which was outside the plan's `owns`. Export the list from build and import it.
- `src/core/init/run.ts:113`: `init` spots an unreadable `metafab.yaml` by matching the problem text that `src/core/config/load.ts` builds. Rewording that message disables the guard. Export an `isUnreadableConfig()` predicate from `load.ts` instead.
- `src/core/init/run.ts:259`: an unreadable `.factory/factory.yaml` is not refused early. `init` creates `.factory/AGENTS.md` and `.gitattributes` and only then fails in the build, so the failed run leaves new files behind.
