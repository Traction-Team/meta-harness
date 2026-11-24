---
title: metafab check could warn about a partial in .factory/partials/ that no file imports
kind: idea
status: new
filed: 2026-11-15
reported-by: Plan 2.013's open question 1, building PR #39, 15 Nov
source: https://github.com/Traction-Team/meta-harness/pull/39
links: [docs/plans/2.013-imports.md]
---

# `metafab check` warns about a partial in `.factory/partials/` that no file imports

## What happened, or what is wanted

Since Plan 2.013, a Markdown file in `.factory/` can be imported with `<!-- factory:import <path> -->`, and shared partials go in `.factory/partials/` by convention. A partial that no workflow, skill or `.factory/AGENTS.md` imports any more is dead text that nobody reads, and nothing points it out.

## What we know

The plan proposed a `check` warning for files in `.factory/partials/` only, because other `.md` files in `.factory/` may be notes. The person did not decide it before the build, so it was left out. `environmentProblems` in `src/core/env/validate.ts` already expands every import with one `ImportCache` per run, and the cache's `files` map holds every partial that was reached, so the unused ones are the `.factory/partials/*.md` files missing from it. Imports inside removed blocks are expanded too, so a partial used only by another environment would not be flagged.
