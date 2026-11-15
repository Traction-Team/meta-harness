---
title: import's validation problems use native absolute paths on Windows
kind: bug
status: new
filed: 2026-11-15
reported-by: build-plan, CI verify job on windows-latest, 15 Nov
source: "#27"
links: [docs/plans/1.022-verification.md, docs/specs/cli.md, docs/verification.md, test/cli/contract.test.ts]
---

# Native Windows paths in `import` problems

## What happened, or what is wanted

`metafab import <path> --json` on Windows reports each validation problem's `file` as the absolute path the source label gives, with backslashes: `D:\a\meta-harness\meta-harness\test\fixtures\fabs\invalid-fab/.factory/skills/broken/SKILL.md`. [CLI: Command behaviour](../specs/cli.md#command-behaviour) rule 4 says a problem's `file` has no `\`, so the result breaks the JSON contract on that platform only. The person expected `…/invalid-fab/.factory/skills/broken/SKILL.md`, as `/`-separated as every other problem.

## What we know

The CI run [43661843108](https://github.com/Traction-Team/meta-harness/actions/runs/43661843108) failed in `test/cli/contract.test.ts`, case "import: an invalid fab exits 4", on `windows-latest` with Node 20 and 22: `expected 'D:\a\meta-harness\meta-harness\test\f…' not to contain '\'`.

The cause is the source label, not the factory loader:

- `parseSource` records the argument as written in `SourceSpec.source` (`src/core/sources/parse.ts:311`).
- `validateFab` prefixes every problem from `loadFactory` with that label and nothing else (`prefixedFile`, `src/core/sources/validate.ts:15`; used at `:112`–`:115`), so a native absolute path source keeps its backslashes.
- The same label reaches `--json` through the `MetafabError`'s problems.

Path sources only: a Git, npm or HTTPS source label is a URL or package name and has no backslashes.

Until it is fixed, the contract case skips rule 4's `\` check on Windows, and a Windows-only `test.fails` case in `test/cli/contract.test.ts` pins the defect. POSIX still asserts the rule in full. Plan 1.022 records the row under [JSON and terminal](../verification.md#json-and-terminal) as `filed`.

A fix belongs in `src/core/sources/**`, which Plan 1.022 does not own. The likely shape is to normalise the label's separators once, where the problem file is built, so the message still echoes the path the person typed.
