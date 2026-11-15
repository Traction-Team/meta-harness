---
title: metafab map should show each skill's skills condition and whether it is installed for the selection
kind: idea
status: new
filed: 2026-11-15
reported-by: Plan 2.012's open question 1, building PR #37, 15 Nov
source: https://github.com/Traction-Team/meta-harness/pull/37
links: [docs/plans/2.012-conditional-blocks.md]
---

# `metafab map` shows each skill's `skills` condition and whether it is installed for the selection

## What happened, or what is wanted

Since Plan 2.012, `skills:` in `factory.yaml` installs a skill only where its condition can be true for the developer's selection. `metafab map` lists the pipeline and skills, but not that condition, so a developer cannot see why a skill is missing from their installed output, nor which selection would install it.

## What we know

The plan proposed this as a small follow-up after Plan 2.014. The condition is parsed into `FactoryYaml.skills` (`src/core/factory/factory-yaml.ts`), and `classify(condition, [], selection, env)` in `src/core/env/scenarios.ts` already gives `all`, `none` or `some` with the label `build` uses for the `**Applies only <label>.**` line.
