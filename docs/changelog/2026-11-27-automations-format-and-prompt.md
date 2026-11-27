---
title: "feat: a factory declares automations and metafab renders each run's prompt"
date: 2026-11-27
pr: 50
plan: docs/plans/2.019-automations-format-and-prompt.md
---

# A factory can declare work that runs on its own, and Metafab renders each run's instructions

A format 2 factory can hold `.factory/automations/<name>/automation.md`, with an owner, triggers (a cron schedule with a time zone, or `after` another automation) and a prose body, plus a shared `.factory/automations/run.md`. `metafab check` validates them with file and line. `metafab automations list` shows them, `metafab automations prompt <name>` renders one run's instructions for the selected environment, and `metafab automations stub <name> --target orca|amp` prints the short text a harness registers. Format 1 factories are unchanged; their `automations/` directory gets one warning.

## Still to come

Plan 2.020 registers the stubs in Orca (`sync orca`) and Amp (`plan amp` and the `metafab-automations` skill).
