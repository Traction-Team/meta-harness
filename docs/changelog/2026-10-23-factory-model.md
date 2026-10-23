---
title: feat: load and validate the factory format
date: 2026-10-23
pr: 3
plan: docs/plans/02-factory-model.md
---

# Metafab can load a `.factory/` and report every format problem in one pass

`metafab` now has a factory loader that reads `.factory/factory.yaml`, its pipeline, `AGENTS.md`, and every skill, then reports format problems with a file, line and suggested fix instead of stopping at the first one. It enforces the Agent Skills name rules and the reserved `metafab` prefix.

No command consumes the loader yet: `metafab check` (Plan 05) is the first caller. The format itself is unchanged apart from the stricter name rules and the reserved-prefix validation rule.

## Still to come

Plan 03 adds `metafab.yaml` loading; Plan 05 wires the loader into `metafab check`.
