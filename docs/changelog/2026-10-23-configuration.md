---
title: "feat: read, validate and write metafab.yaml"
date: 2026-10-23
pr: 2
plan: docs/plans/03-configuration.md
---

# `.factory/metafab.yaml` is read, validated and rewritten without losing comments

`metafab` now loads the configuration file, resolves `agents` (including `all`, absence and `[]`) and `metafab-skill`, and reports the eleven validation problems the configuration spec lists, each with its file and line. It also maps selected targets to `.claude/skills/` and `.agents/skills/`.

Commands can rewrite only what they own: `import`, `update` and `detach` write or remove the `upstream` key and keep every other key, its order and its comments. The commands themselves are still stubbed, so there is no new CLI output yet.

## Still to come

[04 Build](../plans/04-build.md) and [05 Check](../plans/05-check.md) use these modules.
