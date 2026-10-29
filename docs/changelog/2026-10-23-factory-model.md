---
title: feat: load and validate the factory format
date: 2026-10-23
pr: 3
plan: docs/plans/1.002-factory-model.md
---

# Metafab can load a `.factory/` and report every format problem in one pass

`metafab` now has a factory loader that reads `.factory/factory.yaml`, its pipeline, `AGENTS.md`, and every skill, then reports format problems with a file, line and suggested fix instead of stopping at the first one. It reports a `.factory/` path it cannot read as a problem instead of treating it as absent (a path that is simply missing stays valid), and it enforces the Agent Skills name rules and the reserved `metafab` prefix.

No command consumes the loader yet: `metafab check` (Plan 1.005) is the first caller. The format itself is unchanged apart from the stricter name rules and the reserved-prefix validation rule.

## Still to come

Plan 1.005 wires the loader into `metafab check`.
