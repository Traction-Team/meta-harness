---
title: "`metafab --json publish` does not tell the command it is in JSON mode"
kind: follow-up
status: new
filed: 2026-10-31
reported-by: build-plan worker, PR #13, 31 Oct
source: "#13"
links: [docs/specs/cli.md, docs/plans/1.011-publish.md]
---

# A global `--json` before the command never reaches `CommandContext.options`

## What happened, or what is wanted

The Git prompt rule (Decisions, 2026-10-29) lets Git prompt only when stdin is a terminal and `--json` is absent. `metafab publish --json` works, but `metafab --json publish` strips the flag in `src/cli.ts` before the command sees it, so a Git clone or push could still prompt in JSON mode.

## What we know

`src/cli.ts` handles a leading `--json` itself and does not put the effective mode into `CommandContext` (`src/commands/types.ts`). Both are outside 1.011's `owns`. Any command that passes JSON mode to a Git helper (`import`, `update`, `publish`) needs the effective mode in the context.
