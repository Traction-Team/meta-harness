---
title: "chore: the factory gives each harness and workspace only its own instructions"
date: 2026-11-15
pr: 43
plan: docs/plans/2.015-dogfood-environments.md
---

# Each agent now reads only the workflow steps for its own tool and workspace

This repository's factory comes from fab-basic's environments release, which declares `harness` (`opencode`, `claude`, `amp`) and `workspace` (`orca`, `orb`, `worktree`). A developer runs `metafab env set harness=opencode` and `metafab env set workspace=orca` once, and the installed skills then hold only those procedures. With nothing selected, every variant shows, labelled, as before. A new Amp orb selects `amp` and `orb` in `.agents/setup`. Claude Code sessions get real `agent-coding`, `agent-review` and `agent-planning` sub-agents in `.claude/agents/`, and the `agent-harnesses` skill is gone.

## Still to come

This repository still pins `@seasb/metafab` 1.x until `2.0.0-next.1` is published, and takes fab-basic from its `feat/environments` branch until `v0.2.0` is tagged. Then the pin moves to `2.0.0-next.1`, the fab source moves to `^0.2.0`, and the proofs run again.
