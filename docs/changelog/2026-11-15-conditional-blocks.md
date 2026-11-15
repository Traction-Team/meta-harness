---
title: "feat: when and switch blocks and conditional skills compile for the selected environment"
date: 2026-11-15
pr: 37
plan: docs/plans/2.012-conditional-blocks.md
---

# A format 2 factory can give each environment its own text and its own skills

In a `format: 2` factory, `<!-- factory:when env.<variable> == <value> -->` and `<!-- factory:switch env.<variable> -->` blocks in any skill's Markdown and in `.factory/AGENTS.md` now compile for the developer's selection: `metafab build` keeps the matching text, drops the rest, and labels a block that matches only some of the selected values (`**In Amp:**`). `skills:` in `factory.yaml` installs a whole skill only where its condition can be true, and adds an `**Applies only …**` line where it matches part of the selection. `metafab check` reports every bad directive, condition or switch with its file and line whatever the local selection, so every selection compiles. The root `AGENTS.md` block is rendered for every value, so it stays the same for everyone. A format 1 factory is unchanged: directive lines stay text, and `check` warns once per file that has one.

## Still to come

`factory:import` arrives in Plan 2.013. `metafab map` showing each skill's condition is filed in `docs/intake/2026-11-15-map-shows-skill-conditions.md`.
