---
title: "feat: git hooks find the main worktree's metafab, so git worktree add builds the new worktree"
date: 2026-11-15
pr: 44
plan: docs/plans/1.028-worktree-hooks-find-metafab.md
---

# `git worktree add` now builds the new worktree's skills from the main checkout's installed metafab

With `git-hooks: true`, a hook now looks for `metafab` in four places: the factory root's `node_modules/.bin/metafab`, then the same path in the repository's main worktree, then `PATH`, then `npx`. A project that has `@seasb/metafab` only as a devDependency, installed in the main checkout, now gets `.claude/skills/` and `.agents/skills/` built in every new worktree, with no network and no global install. A bare repository has no main worktree, and a main worktree whose path contains a newline is skipped, so both fall through to `PATH` as before.

The first `build`, `init`, `import` or `update` with this version rewrites the three hooks Metafab owns and reports each as updated. A lookup line you pasted by hand into a hook Metafab does not own, or under `core.hooksPath`, is not rewritten: `build` keeps printing its warning with the new line, which you paste in place of the old one.

## Still to come

This repository's own hooks run the published devDependency, so it gets the new lookup once that moves to a 2.0 prerelease (Plans 2.016 and 2.015). The CI `hooks` job proves the new step on Linux and Windows when this pull request is marked ready.
