---
title: A dangling alias in skill frontmatter, or too many aliases in factory.yaml, crashes with a stack
kind: follow-up
status: new
filed: 2026-10-29
reported-by: Cold review of PR #11 (plan 1.013), 29 Oct
source: "#11"
links: [docs/specs/factory-format.md, docs/plans/1.013-factory-edge-cases.md]
---

# YAML alias errors outside the factory.yaml checks crash instead of reporting a problem

## What happened, or what is wanted

Two inputs print a Node stack instead of a grammar problem (rule 6, [YAML and frontmatter grammar](../specs/factory-format.md#yaml-and-frontmatter-grammar)):

- A skill `SKILL.md` with `description: *missing` makes `metafab map` throw `ReferenceError: Unresolved alias`.
- A `factory.yaml` that aliases one anchor more than 100 times (one `&gate` entry and 120 `*gate` entries) makes `metafab map` and `metafab pipeline add` throw `ReferenceError: Excessive alias count`.

Both should report a problem on the right line and exit 1.

## What we know

- `parseYaml` in `src/util/yaml.ts:88` calls `document.toJS()`, which throws on both cases. `src/util/frontmatter.ts:46` does not catch it.
- Plan 1.013 added an unresolved-alias check (`unresolvedAliasProblems`) for `factory.yaml` only; frontmatter could reuse it. `src/util/` was outside 1.013's `owns`.
- Both behaviours are the same on `main` before 1.013; 1.013 made aliases a supported `factory.yaml` input, which makes the alias-count limit easier to reach.
