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

- `invalidSource` in `src/core/sources/parse.ts:39`: an unsupported or malformed source exits 1 with no problems, although [Supported sources](../specs/sharing.md#supported-sources) lists the forms it accepts.

## What we know

`test/cli/contract.test.ts` pins the path case as `test.fails` under "contract sweep": `import` of a path that does not exist must print `  fix: ` on stderr. The case starts to pass when the fix lands; flipping it to `test` and deleting this note is the fix's last step.

Two result-shape changes were made in Plan 1.022 (`renderBug`, `fromMetafabError`), which is why these results at least carry `problems: []`. They still carry no fix.

A fix is one small object at each site, but every site outside `src/cli.ts`, `src/output.ts`, `src/errors.ts`, `src/input.ts` and `src/commands/**` is outside the plan's scope, so it is filed rather than fixed.
