---
title: The CLI spec's --json example omits the exitCode field every command prints
kind: spec
status: new
filed: 2026-10-25
reported-by: build-plan task sub-agent, PR #4, 25 Oct
source: https://github.com/Traction-Team/meta-harness/pull/4
links: [docs/specs/cli.md]
---

# The `--json` example in the CLI spec has no `exitCode`

## What happened, or what is wanted

`docs/specs/cli.md` (the `--json` output example near line 166) shows `{ ok, command, problems }`. Every command renders its JSON through `src/output.ts`, which always adds `exitCode` (`src/output.ts:7`). `metafab build --json` prints `{ "ok": true, "command": "build", "exitCode": 0, "changed": [], "problems": [] }`. The spec and the code disagree.

## What we know

The field comes from plan 01's shared renderer, not from any one command. Either the spec documents `exitCode` as part of every JSON result, or the renderer drops it. Documenting it is the smaller change and keeps scripts that already read it working.
