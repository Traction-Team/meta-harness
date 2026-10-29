---
title: init moves a skill whose name clashes with a mis-named factory skill, then fails with exit 1
kind: bug
status: new
filed: 2026-10-29
reported-by: cold review (review-branch, round 3), PR #10, 29 Oct
source: https://github.com/Traction-Team/meta-harness/pull/10
links: [docs/specs/cli.md, docs/plans/1.006-init-and-adoption.md]
---

# Adoption checks factory names by directory, not by frontmatter name

## What happened, or what is wanted

`.factory/skills/alpha/SKILL.md` declares `name: beta` (an existing mismatch) and `.claude/skills/beta/SKILL.md` is adoptable. `metafab init --agents claude --adopt` moves `.claude/skills/beta` to `.factory/skills/beta`, writes the missing factory files, then exits 1 with `Duplicate skill name "beta"`. [CLI: Adopt existing skills](../specs/cli.md#adopt-existing-skills) rules 3 and 8 say a clash with a factory skill stops with exit 5 and changes nothing.

## What we know

`planAdoption` (`src/core/adopt.ts`, around line 571) compares candidate names with factory skill directory names from discovery. `validateFactory` rule 4 compares frontmatter names. Since `init` no longer stops on unrelated factory validation errors before writing (`src/core/init/run.ts`, preflight), an invalid factory reaches `applyAdoption`. Fix: also treat each factory skill's frontmatter `name` as taken, and add a regression test. Found after the two review rounds `build-plan` allows, so it was not fixed in PR #10.
