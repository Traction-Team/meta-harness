---
title: A factory.yaml holding only --- is healed by pipeline add but fails pipeline remove
kind: follow-up
status: new
filed: 2026-10-25
reported-by: build-plan cold review, PR #5, 25 Oct
source: https://github.com/Traction-Team/meta-harness/pull/5
links: [docs/specs/factory-format.md, docs/plans/07-authoring-commands.md]
---

# Edit commands disagree on an empty factory.yaml

## What happened, or what is wanted

With `factory.yaml` = `---\n`, `metafab pipeline add a` rewrites it with `format` and `name`, while `metafab pipeline remove a` exits 1 with "factory.yaml must be a YAML map". The commands should treat it the same way.

## What we know

`src/core/edit/pipeline.ts:162` heals empty documents (null, `{}`, `---`); `pipeline.ts:202` (remove) uses the strict parser. Low frequency.
