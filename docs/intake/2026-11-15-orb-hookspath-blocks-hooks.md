---
title: Amp orbs set a global core.hooksPath, so metafab build installs no hooks there
kind: tooling
status: new
filed: 2026-11-15
reported-by: build-plan worker for 1.025, 15 Nov
source: https://github.com/Traction-Team/meta-harness/pull/33
links: [docs/plans/1.025-git-hooks-on.md]
---

# Amp orbs set a global core.hooksPath, so metafab build installs no hooks there

## What happened, or what is wanted

In an Amp orb, `git config --show-origin --get core.hooksPath` prints `file:/home/user/.gitconfig	/home/user/.config/git/hooks`. With `git-hooks: true`, `metafab build` (and `npm run factory`) follows rule 3 of [building.md, Git hooks](../specs/building.md#git-hooks): it installs no hooks and warns once. So hooks never run in an orb, and proving them needs `GIT_CONFIG_GLOBAL=/dev/null` or a clone with that setting removed. Hit by the task thread and the worker in every proof run of PR #33.

## What we know

The orb's setup (`.agents/setup`) runs `node dist/cli.js build`, so a new orb still gets its skills; only later branch switches and pulls inside the orb do not rebuild them. Worth a line in `docs/factory.md`'s Notes or the orb setup, or a question for Amp about what the global hooks directory is for.
