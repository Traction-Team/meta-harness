---
title: Factory loading reports an unreadable file or directory as valid
kind: bug
status: new
filed: 2026-10-23
reported-by: build-plan cold review, PR #3, 23 Oct
source: https://github.com/Traction-Team/meta-harness/pull/3
links: [docs/specs/factory-format.md, docs/plans/05-check.md]
---

# An unreadable `.factory/` file or directory loads with no problems

## What happened, or what is wanted

`loadFactory` treats a filesystem read error the same as a missing file. A `factory.yaml` with mode 000, or a mode-000 `skills/` directory, produces `problems: []`, so a later `metafab check` would call the factory valid. An unreadable `SKILL.md` is worse: it rejects the whole load with EACCES instead of returning a problem.

The loader should report an unreadable path as an error with its file and line, in the same shape as a format problem.

## What we know

`src/core/factory/load.ts` (`readTextFile`) and `src/core/factory/discovery.ts` (the `readdir` and `readFile` calls) catch every error and either return "absent" or rethrow. The plan only promises "never throws for invalid content", so permission and I/O errors were left to the command layer. Plan 05 owns `metafab check` and should decide whether it reports them or the loader does.

## Parked

Not parked. The cold review raised it as a blocker; it is recorded here so it is not lost.
