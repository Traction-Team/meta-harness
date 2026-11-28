---
title: "feat: metafab automations sync registers a factory's automations in orca and amp"
date: 2026-11-28
pr: 51
plan: docs/plans/2.020-automations-sync.md
---

# A factory's automations can be registered in Orca with one command, and in Amp by an agent

`metafab automations sync orca` makes this machine's Orca automations match the automations this git user owns: it creates, edits, disables or removes `automation: <name>` entries, always with the time zone, a fresh session per run and the stub as the prompt, and leaves anyone else's alone. `--dry-run` shows the changes first. `metafab automations plan amp --json` prints each Amp schedule (DTSTART with its time zone, RRULE and label), and the new built-in `metafab-automations` skill tells an Amp agent how to apply them. `build` installs that skill only when the factory has an automation.

## Still to come

The stub runs the published `metafab`, so a real run needs a release that has the `automations` command (filed to intake). fab-basic's `run.md` and its `sync-automations` automation come next on the roadmap.
