---
title: "chore: the factory gives each harness and workspace only its own instructions"
date: 2026-11-24
pr: 43
plan: docs/plans/2.015-dogfood-environments.md
---

# Each agent now reads only the workflow steps for its own tool and workspace

This repository's factory is fab-basic 0.2.0, which declares `harness` (`opencode`, `claude`, `amp`) and `workspace` (`orca`, `orb`, `worktree`). A developer runs `node dist/cli.js env set harness=opencode` and `node dist/cli.js env set workspace=orca` once, and the installed skills then hold only those procedures. With nothing selected, every variant shows, labelled, as before. A new Amp orb selects `amp` and `orb` in `.agents/setup`. Claude Code sessions get real `agent-coding`, `agent-review` and `agent-planning` sub-agents in `.claude/agents/`, and the `agent-harnesses` skill is gone. The `@seasb/metafab` devDependency is pinned to `2.0.0-next.1`, which reads format 2, so the Git hooks keep rebuilding the skills.

## Still to come

`OPENCODE=1` and `CLAUDECODE=1` are not yet confirmed in real sessions, and no plan has yet been built end to end by an OpenCode worker on this factory: [docs/intake/2026-11-24-confirm-environments-in-real-sessions.md](../intake/2026-11-24-confirm-environments-in-real-sessions.md). The pin moves back to a plain range when 2.0.0 ships.
