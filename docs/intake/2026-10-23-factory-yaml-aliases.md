---
title: YAML aliases in factory.yaml are rejected as grammar errors
kind: bug
status: new
filed: 2026-10-23
reported-by: build-plan cold review, PR #3, 23 Oct
source: https://github.com/Traction-Team/meta-harness/pull/3
links: [docs/specs/factory-format.md]
---

# Valid YAML 1.2 aliases do not work in a pipeline

## What happened, or what is wanted

`factory.yaml` is parsed as YAML 1.2, but the pipeline reader inspects the raw nodes and does not resolve aliases. This is valid YAML 1.2:

```yaml
format: 1
name: mark4
x-build: &build build-slice
pipeline:
  - *build
```

Metafab reports "Pipeline entry must be a workflow name or a mapping". The same happens to an aliased `format` or `name`.

## What we know

`src/core/factory/factory-yaml.ts` reads `pair.value` and `item` nodes directly; an alias node needs `resolve()`. The review that found it ran after the two fix rounds, so it was not changed in Plan 02.

## Parked

Not parked. Low frequency, but a valid factory is refused.
