---
title: An automation's stub fails until a published metafab has the automations command
kind: bug
status: new
filed: 2026-11-28
reported-by: build-plan worker for 2.020, from the Amp end-to-end run of 2.019, PR #51, 28 Nov
source: https://github.com/Traction-Team/meta-harness/pull/51
links: [docs/plans/2.019-automations-format-and-prompt.md, docs/plans/2.020-automations-sync.md]
---

# An automation's stub fails until a published metafab has the automations command

## What happened, or what is wanted

A real Amp run of a 2.019 stub in this repository found `node_modules/.bin/metafab`, which is 2.0.0, and failed with `Unknown command: automations`. So no automation registered by `sync orca` or `plan amp` can run end to end until a release carries the `automations` command. Expected: either release first, or let a repository that builds metafab itself (this one) run `node dist/cli.js` after building `dist/`.

## What we know

The stub's step 3 runs `metafabInvocation` (src/core/automations/stub.ts), which prefers the main checkout's installed CLI. 2.020's proof is against a fake Orca and unit tests of `plan amp`; neither runs the stub. Found in thread T-01a21c3f-274f-7274-a7fc-791f17cbd210.
