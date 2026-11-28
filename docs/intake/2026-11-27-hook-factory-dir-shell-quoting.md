---
title: Git hooks break for a factory directory holding ", $, ` or \
kind: bug
status: new
filed: 2026-11-27
reported-by: build-plan worker for 2.019, from the plan's Out of scope, PR #50, 27 Nov
source: https://github.com/Traction-Team/meta-harness/pull/50
links: [docs/plans/2.019-automations-format-and-prompt.md]
---

# Git hooks break for a factory directory holding ", $, ` or \

## What happened, or what is wanted

The hook's main-worktree lookup writes the factory directory inside double quotes unescaped (`"$main/<dir>/node_modules/.bin/metafab"`), so a nested factory directory whose name holds `"`, `$`, `` ` `` or `\` gives a hook that runs the wrong path or fails. Expected: the hook works for any directory name, as the automation stub (2.019) now does with `shQuote`.

## What we know

`cliLookup` in `src/core/hooks/script.ts` builds that text; 2.019 split out `metafabInvocation(mainCli, …)` and left the hook bytes unchanged. Fixing it means quoting with `shQuote` there and changing `hookFactoryDir` in `src/core/hooks/sync.ts`, which reads the directory back out of an installed hook to upgrade or remove it.
