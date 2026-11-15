---
title: "chore: turn on git hooks in this repository with the published metafab"
date: 2026-11-15
pr: 33
plan: docs/plans/1.025-git-hooks-on.md
---

# A pull, branch switch or rebase here keeps the installed skills current by itself

This repository now depends on `@seasb/metafab@^1.0.0` and has `git-hooks: true`, so after `npm install && npm run factory` the `post-checkout`, `post-merge` and `post-rewrite` hooks run `metafab build` from `node_modules/.bin`. A `git pull` that changes a workflow updates `.claude/skills/` and `.agents/skills/` with no manual step. `npm run factory`, the `setup` setting and `orca.yaml` still build with this checkout's `node dist/cli.js`. A plain `git worktree add` builds the new worktree only when `metafab` is on `PATH` (`npm link`); Orca and Amp worktrees build through their setup scripts as before.

## Still to come

Letting a new worktree's hook use the main checkout's `node_modules` is planned in [Plan 1.028](../plans/1.028-worktree-hooks-find-metafab.md).
