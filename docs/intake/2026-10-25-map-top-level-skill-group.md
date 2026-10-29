---
title: map prints a top-level skill's own name as its group
kind: bug
status: new
filed: 2026-10-25
reported-by: build-plan cold review, PR #5, 25 Oct
source: https://github.com/Traction-Team/meta-harness/pull/5
links: [docs/specs/cli.md, docs/plans/07-authoring-commands.md]
---

# A skill directly under .factory/ shows as `hotfix/   hotfix` in map

## What happened, or what is wanted

`.factory/hotfix/SKILL.md` makes the human `map` output print `hotfix/   hotfix` under **Skills**. A top-level skill has no group; it should print without a group label (or under a `(top level)` label).

## What we know

`src/core/edit/map.ts:87` takes the first path segment as the group even when it is the skill itself.
