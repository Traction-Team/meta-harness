---
title: "fix: factory.yaml aliases, reserved containers and authoring edge cases"
date: 2026-10-29
pr: 11
plan: docs/plans/1.013-factory-edge-cases.md
---

# YAML aliases in factory.yaml work, and create and map handle reserved and unreadable directories

- A `factory.yaml` can share an options mapping with an anchor and alias (`- finish-slice: *gate`). It loads, and `metafab pipeline add` and `pipeline remove` edit it. `pipeline remove` refuses an entry whose anchor another entry uses, and an alias with no anchor, an alias that refers to itself, or one expanded more than 100 times is a clear error, in `factory.yaml` and in skill frontmatter, instead of a crash.
- A `SKILL.md` directly in `.factory/workflows/` (or `skills/`, `templates/`, `scripts/`, `scorers/`, `rules/`, `runtimes/`) is validation rule 11, and `metafab create workflows` is refused. The skills inside those directories still load.
- `metafab create` refuses a name that an unreadable skill may hold, and a path whose directories it cannot read, with a named problem instead of a stack.
- `metafab pipeline remove` on an empty `factory.yaml` reports the entry as missing. `metafab map` lists a top-level skill such as `.factory/hotfix/` under `(top level)`; `map --json` is unchanged.
- Every `--json` result, including missing input (exit 2) and unexpected errors (exit 1), has `exitCode`.
