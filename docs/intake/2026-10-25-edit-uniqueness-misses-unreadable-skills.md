---
title: create can reuse a name held by a skill discovery dropped
kind: follow-up
status: new
filed: 2026-10-25
reported-by: build-plan cold review, PR #5, 25 Oct
source: https://github.com/Traction-Team/meta-harness/pull/5
links: [docs/specs/cli.md, docs/plans/07-authoring-commands.md]
---

# Name uniqueness only sees skills the loader could read

## What happened, or what is wanted

With `.factory/skills/security/` unreadable (`chmod 000`) or its `SKILL.md` unparseable, `metafab create review/security --description x` exits 0. Once the directory is readable again the factory has two `security` skills and is invalid. `cli.md#edit-a-factory` says `create` refuses a name that already exists anywhere in the factory.

## What we know

`src/core/edit/create.ts:136` checks uniqueness against `factory.skills`, which omits directories discovery reported as problems. Fix: also refuse when a loader problem names a skill directory with the same last segment, or walk directory names directly.
