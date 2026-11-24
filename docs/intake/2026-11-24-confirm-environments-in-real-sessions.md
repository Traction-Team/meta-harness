---
title: Confirm the environments rendering in real OpenCode and Claude Code sessions, and with real plan builds
kind: follow-up
status: new
filed: 2026-11-24
reported-by: the person, through the 2.015 orchestrator thread, 24 Nov
source: https://github.com/Traction-Team/meta-harness/pull/43
links: [docs/plans/2.015-dogfood-environments.md]
---

# Confirm each harness label's variable and run real plan builds on the environments factory

## What happened, or what is wanted

Plan 2.015's B3a asks for one real plan built by an Amp worker and one by an OpenCode worker against the environments factory, each reading only its own procedure, and A2 asks to confirm each harness label's variable in a real session. The person agreed these are recorded as not done in #43, because an orb cannot run OpenCode or Claude Code:

- `OPENCODE=1` is not yet confirmed in a real OpenCode session (label `In OpenCode (OPENCODE=1 is set)`).
- `CLAUDECODE=1` is not yet confirmed in a real Claude Code session (label `In Claude Code (CLAUDECODE=1 is set)`).
- No plan has been built end to end by an OpenCode worker, or by an Amp worker started by `start-plan`, on the environments factory.

## What we know

`AMP_THREAD_ID` is confirmed in an Amp orb, and a fresh orb on #43's branch selects `amp` and `orb` through `.agents/setup`. #43's own finish-plan run loaded the Amp-only rendering. The labels live in fab-basic's `.factory/factory.yaml`, so a variable that does not exist is fixed in fab-basic (replace it with the tool's visible marker) and taken here with `metafab update`. To check one: `printenv OPENCODE` or `printenv CLAUDECODE` in that tool's session, then `node dist/cli.js env set harness=<value>` and build one plan from the roadmap.
