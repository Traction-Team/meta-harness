---
title: isolateGitConfig() never removes the temporary directory it creates
kind: tooling
status: new
filed: 2026-11-15
reported-by: build-plan worker for 2.011, task 2 of PR #32, 15 Nov
source: https://github.com/Traction-Team/meta-harness/pull/32
links: []
---

# isolateGitConfig() leaks one temporary directory per call

## What happened, or what is wanted

`isolateGitConfig()` in `test/core/hooks/helpers.ts` creates a temporary directory for the isolated Git config and never removes it, so every test that calls it leaves one directory behind in the system temp folder. Plan 2.011 added many more callers (the env Git config and `env set` tests). Expected: the directory is removed when the test ends.

## What we know

The helper is shared by the hooks and env tests. A fix registers cleanup with vitest's `onTestFinished` or returns a disposer that the callers' `afterEach` already run.
