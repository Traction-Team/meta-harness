---
title: create can make a skill at a reserved container such as workflows
kind: spec
status: new
filed: 2026-10-25
reported-by: build-plan cold review, PR #5, 25 Oct
source: https://github.com/Traction-Team/meta-harness/pull/5
links: [docs/specs/cli.md, docs/specs/factory-format.md]
---

# `metafab create workflows` turns the workflows container into a skill

## What happened, or what is wanted

`metafab create workflows --description x` writes `.factory/workflows/SKILL.md`. After that, `create workflows/review-slice` fails as "inside the skill workflows", and `map` lists the container as a standalone workflow. `cli.md#edit-a-factory` does not say which top-level names `create` must refuse (`workflows`, `scripts`, `templates`?).

## What we know

`src/core/edit/create.ts:81` has no reserved-container guard. The spec should list the reserved top-level directories; then `create` (and probably the loader) can refuse them.
