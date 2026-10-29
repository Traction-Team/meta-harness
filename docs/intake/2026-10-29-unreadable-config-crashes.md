---
title: An unreadable metafab.yaml or .factory crashes check and build with a stack
kind: bug
status: new
filed: 2026-10-29
reported-by: review-branch cold review, PR #9, 29 Oct
source: "#9"
links: [docs/specs/building.md, docs/specs/cli.md, docs/plans/1.005-check.md]
---

# An unreadable metafab.yaml or .factory crashes check and build with a stack

## What happened, or what is wanted

`chmod 000 .factory/metafab.yaml && metafab check` prints `Error: EACCES ... at async loadConfig`, and `check --json` writes `{"ok":false,"error":...}` without `command`, `exitCode` or `problems`. `chmod 000 .factory` does the same. `build` has the same crash. [Building: Repeatability](../specs/building.md#repeatability) expects one `Cannot read <path>` error, fix `Check its permissions`, exit 1, and [CLI: JSON output](../specs/cli.md#json-output) expects the four keys.

## What we know

`loadConfig` rethrows every error except ENOENT (`src/core/config/load.ts:12`), and neither `runCheck` (`src/core/check/index.ts`) nor `src/commands/build.ts` catches it, so `src/cli.ts` renders it as an internal bug. Fix in `loadConfig` (return a `cannotReadProblem`), which covers both commands. Left unresolved in PR #9 after two review rounds; `src/core/config/**` was outside plan 1.005's `owns`.
