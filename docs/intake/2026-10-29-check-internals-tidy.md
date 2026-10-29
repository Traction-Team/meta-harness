---
title: Tidy check internals so build and check cannot drift
kind: follow-up
status: new
filed: 2026-10-29
reported-by: review-branch cold reviews, PR #9, 29 Oct
source: "#9"
links: [docs/plans/1.005-check.md]
---

# Tidy check internals so build and check cannot drift

## What happened, or what is wanted

Three small duplications found in the PR #9 reviews. None fails today:

- `cliVersion()` in `src/commands/check.ts` is a copy of the one in `src/commands/build.ts`. One shared helper keeps the built-in skill version check honest.
- `SKILL_DIRECTORIES` in `src/core/check/drift.ts` is built from a hardcoded `["claude", "codex"]`. A new target with a new directory would report a stale install as "has no source" instead of "installed for an agent tool that is no longer configured". Derive it from every target in the destinations module.
- `check` walks `.factory/` twice (`scanConflictMarkers` and `scanUpstreamFiles`, `src/core/check/markers.ts`), and `scanUpstreamFiles` drops the walk's read problems, so it reports nothing on its own for an unreadable directory. One walk feeding both scanners fixes both.

## What we know

All in `src/core/check/**` and `src/commands/`. A small refactor plan, or fold it into the next plan that touches `check`.
