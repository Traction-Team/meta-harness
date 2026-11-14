---
title: Errors thrown without `problems` reach the person with no fix line
kind: bug
status: new
filed: 2026-11-15
reported-by: build-plan, contract sweep for Plan 1.022, 15 Nov
source: "#27"
links: [docs/plans/1.022-verification.md, docs/specs/cli.md, test/cli/contract.test.ts]
---

# Errors with no `fix:` line

## What happened, or what is wanted

A `MetafabError` thrown without `problems` renders only its message. With `--json` the result has `problems: []`, and without `--json` stderr has no `  fix: ` line, so the person is told what went wrong but not what to do. Plan 1.022, Design → Contract sweep, rule 7 makes that a finding.

The sweep found one site:

- `metafab import <local path>` for a path whose `.factory/` does not exist exits 3 with `Cannot read local fab "<path>": the .factory directory does not exist` and no fix line. The same helper (`fetchError` in `src/core/sources/path.ts:26`) also reports a bare Git repository and a path that is not a directory, and none of the three carries a problem. Every fix is at hand: name `metafab import <source>` forms, or `git+file://…` for the bare repository.

The same class of site, found while reading every error site for the plan's review table (they need a row each there too):

- The source fetchers, which throw with no problems: `fetchError` in `src/core/sources/path.ts:27`, `src/core/sources/npm.ts:68`, `src/core/sources/npm-cli.ts:53`, `src/core/sources/https.ts:36`, and the two Git fetch failures at `src/core/sources/git.ts:179` and `:195`. Each exits 3 with only Git's or npm's own text.
- The invalid-fab paths with no problems: `tarballError` at `src/core/sources/extract.ts:542`, the npm tarball limits at `src/core/sources/npm.ts:337`, `:346`, `:357` and `:368`, and the oversize download at `src/core/sources/https.ts:193`. Each exits 4 with only the reason.
- A few local failures: `invalidSource` in `src/core/sources/parse.ts:40` (exit 1), the publish Git helper at `src/core/publish/git-target.ts:72`, the npm publish helper at `src/core/publish/npm-target.ts:38`, the staging helper at `src/core/publish/stage.ts:69`, and the missing `publish.version` at `src/core/publish/publish.ts:77`.

That is 16 sites in all. [The verification record](../verification.md#error-messages-and-exit-codes) gives each one's row, message and exit code. Problems that are present but carry no `fix` are a separate class in [Problems without a fix line](2026-11-15-problems-without-fixes.md).

## What we know

`test/cli/contract.test.ts` pins the path case as `test.fails` under "contract sweep": `import` of a path that does not exist must print `  fix: ` on stderr. The case starts to pass when the fix lands; flipping it to `test` and deleting this note is the fix's last step.

Two result-shape changes were made in Plan 1.022 (`renderBug`, `fromMetafabError`), which is why these results at least carry `problems: []`. They still carry no fix.

A fix is one small object at each site, but every site outside `src/cli.ts`, `src/output.ts`, `src/errors.ts`, `src/input.ts` and `src/commands/**` is outside the plan's scope, so it is filed rather than fixed.
