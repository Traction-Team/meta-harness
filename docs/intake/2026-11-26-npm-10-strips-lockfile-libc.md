---
title: npm 10 in an Amp orb drops the libc fields from package-lock.json on install
kind: tooling
status: new
filed: 2026-11-26
reported-by: build-plan worker for 2.018, task B thread, PR #49, 26 Nov
source: https://github.com/Traction-Team/meta-harness/pull/49
links: []
---

# npm 10 in an Amp orb drops the libc fields from package-lock.json on install

## What happened, or what is wanted

In PR #49, `npm install --save-dev @seasb/metafab@^2.0.0` with the orb's npm 10.9.11 rewrote `package-lock.json` without its `libc` fields (the lockfile has 10, written by a newer npm). The task restored them by hand so the lockfile diff kept only the dependency change, and checked the result with `npm ci`. Seen once, on every install that rewrites the lockfile. Expected: a dependency change in an orb touches only that dependency's lockfile entries.

## What we know

The lockfile on `main` was last written by npm 11, which records `libc` for platform-specific optional packages; npm 10 does not. Options: install npm 11 in `.agents/setup`, or pin the npm version in `package.json` `packageManager`/`engines` so every environment writes the same lockfile.
