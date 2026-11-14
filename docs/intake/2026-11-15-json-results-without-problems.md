---
title: Some command results and `--version` leave out `problems` in JSON
kind: bug
status: new
filed: 2026-11-15
reported-by: build-plan, contract sweep for Plan 1.022, 15 Nov
source: "#27"
links: [docs/plans/1.022-verification.md, docs/specs/cli.md, test/cli/contract.test.ts]
---

# JSON results without `problems`

## What happened, or what is wanted

[JSON output](../specs/cli.md#json-output) says: "Every result contains `ok`, `command`, `exitCode` (the process exit code) and `problems`." Some results leave `problems` out when there is nothing to report, so a program that reads the result has to treat a missing key like an empty array.

| Command | Case | JSON now | Site |
| --- | --- | --- | --- |
| `map` | a valid factory, exit 0 | no `problems` key | `src/commands/map.ts:44` sets it only when the factory has problems |
| `create` | success, exit 0 | no `problems` key | the result at `src/commands/create.ts:73` |
| `pipeline add` | success, exit 0 | no `problems` key | the result at `src/commands/pipeline-add.ts:58` |
| `pipeline remove` | success, exit 0 | no `problems` key | the result at `src/commands/pipeline-remove.ts:39` |
| `--version` | `--json` | no `problems` key | the version result at `src/cli.ts:297` |

Nothing is broken for a person: the human output is unchanged. The fix is one line at each site (`problems: []` or `problems: data.problems`), but it changes a result shape outside the two named result-shape fixes in Plan 1.022, so the plan files it here instead.

## What we know

`test/cli/contract.test.ts` pins `map` on a valid factory as `test.fails` under "contract sweep". It starts to pass when the fix lands; flipping the case to `test` and deleting this note is the fix's last step. The other four sites have no contract case that reaches the success path, so they are recorded here only.

The `help` result already carries `problems: []` (`renderHelp` in `src/cli.ts`), and every error result in `src/commands/**` does too. `renderBug` and `fromMetafabError` were fixed in Plan 1.022.
