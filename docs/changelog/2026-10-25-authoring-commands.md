---
title: "feat: create, rename, pipeline and map commands"
date: 2026-10-25
pr: 5
plan: docs/plans/07-authoring-commands.md
---

# Metafab can create, rename and order skills, and print a map of the factory

`metafab create workflows/review-slice --description "..."` writes a new skill with valid frontmatter, after checking the name, its uniqueness and nesting. `metafab rename <old> <new>` moves a skill and updates its frontmatter and pipeline entry, and warns about other files that still mention the old name. `metafab pipeline add <workflow> [--after <workflow>] [--stop "..."]` and `pipeline remove` edit `factory.yaml` with its comments kept, creating it when missing. `metafab map` (and `map --json`) shows the pipeline, standalone workflows and skill groups, even for an invalid factory.

None of these runs `build`; each says to run `metafab build`, which is still to come.

## Still to come

Plan 04 installs the factory with `metafab build`. Follow-ups filed to intake on 2026-10-25.
