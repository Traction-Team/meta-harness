---
title: Problem objects with no `fix` line reach the person with no next step
kind: bug
status: new
filed: 2026-11-15
reported-by: build-plan, error review for Plan 1.022, 15 Nov
source: "#27"
links: [docs/plans/1.022-verification.md, docs/specs/cli.md, docs/verification.md, test/cli/contract.test.ts]
---

# Problems without a fix line

## What happened, or what is wanted

Many error sites build a `Problem` with `level: "error"` and a `message`, but no `fix`. The person sees what went wrong and not what to do, and [Contract sweep](../plans/1.022-verification.md#contract-sweep-testclcontracttestts-new), rule 7 makes that a finding. The error still carries `problems`, so the JSON and human results name the file and line; only the next step is missing.

The error review for Plan 1.022 found 74 such sites. They are grouped by the exit code they produce; every site has a row in [the verification record](../verification.md#error-messages-and-exit-codes).

**Invalid fab, exit 4 (35 sites).** The problems built while a fetched fab is inspected or unpacked: links, entry collisions, size limits, integrity, and the archive itself.

- `src/core/sources/extract.ts:327`, `:349`, `:404`, `:485`, `:494`, `:522`, `:530`, `:550`, `:553`, `:590`, `:610`, `:615`, `:630`, `:638`, `:648`, `:660`, `:672`, `:677`, `:685`, `:732`, `:753`
- `src/core/sources/path.ts:35`, `:96`, `:169`, `:185`, `:215`, `:224`, `:258`, `:284`, `:304`, `:316`, `:327`
- `src/core/sources/npm.ts:265`
- `src/core/sources/validate.ts:20`
- `src/core/publish/git-target.ts:332`

**Local validation, exit 1 (31 sites).** The configuration and factory files are read, edited, or checked.

- `src/core/config/parse.ts:123`, `:158`, `:186`; `src/core/config/writers.ts:24`, `:28`, `:43`, `:45`
- `src/core/factory/factory-yaml.ts:48`, `:286`, `:321`; `src/core/factory/discovery.ts:77`
- `src/core/edit/factory-yaml.ts:42`, `:56`, `:64`, `:83`, `:148`; `src/core/edit/paths.ts:42`
- `src/core/update/run.ts:165`, `:188`, `:242`, `:264`; `src/core/update/diff.ts:63`; `src/core/update/detach.ts:23`
- `src/core/sources/parse.ts:195`, `:198`; `src/core/sources/npm.ts:270`
- `src/core/init/run.ts:323`; `src/core/setup.ts:22`, `:25`; `src/core/publish/stage.ts:69`, `:78`; `src/core/import/run.ts:188`, `:344`

**Not owned, exit 5 (7 sites).** Adoption blockers and build conflicts forwarded from the build plan.

- `src/core/adopt.ts:623`, `:775`, `:788`
- `src/core/init/run.ts:316`; `src/core/update/run.ts:253`; `src/core/import/run.ts:334`; `src/core/setup.ts:113`

**Fetch, exit 3 (1 site).**

- `src/core/sources/cache.ts:137`

## What we know

Every site has a row in [the verification record](../verification.md#error-messages-and-exit-codes), with the command, the message, the exit code and the expected code. No contract case reaches most of them: the sweep's fixtures trigger only the no-factory, stale-skill, missing-path and missing-upstream cases. The counts above are the review's, not a test's.

A fix is usually one `fix` property with text that already appears in a neighbouring message or in the spec. Many sites in `src/core/sources/**` share a helper that could add one fix per class, so a fix plan may find fewer than 74 edits. Every site is outside `src/cli.ts`, `src/output.ts`, `src/errors.ts`, `src/input.ts` and `src/commands/**`, so Plan 1.022 files them instead of fixing them.

The two result-shape changes in Plan 1.022 (`renderBug`, `fromMetafabError`) do not add fix lines. `fromMetafabError` now passes `problems` through, so a `MetafabError` with problems shows them; these sites are the ones where those problems have no fix.
