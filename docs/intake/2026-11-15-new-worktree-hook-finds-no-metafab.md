---
title: A new worktree's hook cannot find the project's metafab, so git worktree add does not build it
kind: idea
status: new
filed: 2026-11-15
reported-by: build-plan worker for 1.025, cold review of PR #33, 15 Nov
source: https://github.com/Traction-Team/meta-harness/pull/33
links: [docs/plans/1.025-git-hooks-on.md, docs/specs/building.md]
---

# A new worktree's hook cannot find the project's metafab

## What happened, or what is wanted

Plan 1.025's `proves` expected `git worktree add` in a clone to build `.claude/skills/` and `.agents/skills/` with `@seasb/metafab` as a devDependency. It does not. In a clean clone after `npm install && npm run factory`, `git worktree add ../meta-harness-hooks-check -b hooks-check` exits 0 but prints `sh: 1: metafab: not found` and `metafab: build failed. Run metafab build.`, and neither skills directory exists. With `metafab` on `PATH` (a global install or `npm link`) the same command builds 24 files.

## What we know

This matches [building.md, Git hooks](../specs/building.md#git-hooks): a new worktree has no `node_modules/`, so the hook tries `PATH` and then `npx --yes @seasb/metafab@<version>`. In this repository the `npx` fallback fails for a second reason: the worktree's own `package.json` is `@seasb/metafab@1.0.0`, so `npx` resolves the unbuilt local package (no `dist/`). The same `npx` call works from outside the repository.

A possible change: let the hook also try the main worktree's `node_modules/.bin/metafab`, found through `git rev-parse --git-common-dir`, before `PATH`. That would build a new worktree in any project that has the dependency installed in its main checkout. It changes the hook script and the spec's lookup order, so it needs its own plan. Orca and Amp worktrees are unaffected: their setup scripts run `node dist/cli.js build`.
