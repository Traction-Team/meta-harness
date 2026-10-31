---
title: metafab check fails on this repository because link.mjs installs skills as symlinks
kind: idea
status: new
filed: 2026-10-29
reported-by: review-branch cold reviews, PR #9, 29 Oct
source: "#9"
links: [docs/specs/building.md, docs/plans/1.005-check.md]
---

# metafab check fails on this repository because link.mjs installs skills as symlinks

## What happened, or what is wanted

Running `node dist/cli.js check` in this repository reports about 20 errors: `.claude/skills/*` and `.agents/skills/*` are symlinks made by `.factory/scripts/link.mjs`, which `build` treats as unowned conflicts (exit 5). So the repository cannot dogfood its own `check` or `build`.

## What we know

Expected behaviour under [Building: Ownership](../specs/building.md#ownership). The choice is whether to replace `link.mjs` with `metafab build` once `init` and adoption (plan 1.006) land, or to keep the symlink layout and leave `check` out of this repository's own checks.
