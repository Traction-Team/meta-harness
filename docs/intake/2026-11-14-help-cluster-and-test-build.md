---
title: "-help is read as a help request, and the shared test build can skip or race a rebuild"
kind: follow-up
status: new
filed: 2026-11-14
reported-by: review-branch, PR #22, 14 Nov 2026
source: "#22"
links: [docs/plans/1.020-cli-fixes.md, docs/specs/cli.md]
---

# Help detection is too broad, and the end-to-end build helper trusts a stale dist/

## What happened, or what is wanted

The last cold review of PR #22 returned *merge* with these left open after two fix rounds:

1. `metafab init -help` prints help and exits 0. The plan's rule (Command behaviour, rule 9) names `--help` and `-h`; `-help` should be an unknown option, exit 1. `isHelpToken` in `src/cli.ts` accepts any single-dash letter cluster that contains `h`, so `-jh` and `-hx` count too, although `parseArgs` rejects them. The post-parse `parsed.values.help` safety net is unreachable as a result. The plan's Tests list has no entry for the `-hh` cluster or the `GIT_WORK_TREE` message test.
2. `test/cli/build.ts` (`buildIsCurrent`) skips `tsc` when its marker is newer than every source file and `dist/cli.js` exists, so a damaged `dist/` (a deleted module, an interrupted `npm run build`) makes the end-to-end tests fail with `ERR_MODULE_NOT_FOUND` instead of rebuilding.
3. The stale-lock takeover in `test/cli/build.ts` can still rename away a fresh lock when two test files both judge the same old lock stale, so two `tsc` runs can overlap on `dist/`.

## What we know

Fix 1 by narrowing `isHelpToken` to `-h`, `--help` and clusters made only of `h` (what `parseArgs` reads as `help: true`), and keep or drop the safety net to match. Fix 2 by also checking every compiled `.js` for `src/**/*.ts`, or by building into a per-run temporary `outDir`. Fix 3 is moot with a per-run `outDir`.

Also found while building: `src/commands/not-implemented.ts` is dead code (nothing imports it) and can be deleted by the next plan that owns `src/commands/`.

On 15 Nov 2026, one `npx vitest run` straight after `npm run verify` failed one test (1272 passed); nine further runs, including one straight after `npm run build`, all passed. The failing test was not captured. Item 2 or 3 above (the shared e2e build helper) is the likely cause.
