---
title: "feat: build --out previews another environment and the metafab skill teaches environments"
date: 2026-11-24
pr: 40
plan: docs/plans/2.014-preview-and-guidance.md
---

# You can see what a teammate on another harness receives, without changing your own setup

`metafab build --env harness=amp --out /tmp/preview-amp` writes the skills that selection would install, and the root `AGENTS.md` block, into `/tmp/preview-amp` and changes nothing in the repository. It never overwrites: a non-empty directory exits 5, and a directory inside `.factory/` or a skill destination exits 1. If a write fails, everything the run created is removed.

The built-in `metafab` skill now teaches agents to write one factory for several environments: `env`, `when`, `switch`, `import` and partials, conditional skills, `metafab env` and `build --out` previews. The workflow guidance now recommends `when`, `switch` and partials over a separate tool-specific skill in a format 2 factory.

## Still to come

2.016 publishes this as `@seasb/metafab@2.0.0-next.1` under the `next` dist-tag.
