---
title: "feat: metafab init creates a factory and adopts existing skills"
date: 2026-10-29
pr: 10
plan: docs/plans/1.006-init-and-adoption.md
---

# `metafab init` sets up a factory and adopts existing skills

`metafab init [--agents <list>] [--adopt]` creates the missing `.factory/factory.yaml`, `.factory/AGENTS.md` and `.factory/metafab.yaml`, adds the Metafab lines to `.gitattributes`, and runs `build`. Running it again on a complete factory changes nothing and prints `Already initialised`.

Skills already in `.claude/skills/` or `.agents/skills/` move into `.factory/skills/` once you agree (in a terminal, or with `--adopt`). Without a terminal and without `--adopt`, `init` exits 2 and names the `--adopt` flag. Conflicting, stray or invalid entries stop it with exit 5 before it writes anything.

## Still to come

[Plan 1.009](../plans/1.009-import.md) reuses the adoption module for `import`. Follow-ups are in `docs/intake/2026-10-29-adoption-polish.md`.
