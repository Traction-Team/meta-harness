---
title: "feat: a factory declares the repository files it needs"
date: 2026-11-15
pr: 23
plan: docs/plans/1.023-factory-requires.md
---

# A fab can declare the repository files its workflows need, and import creates them from templates

`factory.yaml` accepts `requires`: a list of files outside `.factory/` (such as `opencode.json` or `docs/roadmap.md`), each with a description and an optional template in `.factory/templates/`. `metafab import <fab> --setup` creates each missing file from its template, byte for byte. In a terminal, `import` asks first. Without a terminal it exits 2 and names `--setup`, and `--no-setup` skips the step. The review summary lists every requirement under "Repository files the factory needs". `metafab update` offers only requirements that are new upstream. `metafab check` warns about each required file that is missing and does not change the exit code. Metafab never overwrites an existing file, writes through a link, creates a case variant of an existing path, or runs a script. `build` ignores `requires`.

## Still to come

Plan 1.024 (the first fab) uses `requires` for its settings file. The remaining review edge cases are in `docs/intake/2026-11-15-requires-review-leftovers.md`.
