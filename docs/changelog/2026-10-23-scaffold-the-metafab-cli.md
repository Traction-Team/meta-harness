---
title: "chore: scaffold the metafab cli package and command runner"
date: 2026-10-23
pr: 1
plan: docs/plans/1.001-foundation.md
---

# The `metafab` CLI exists, with every v1 command stubbed

`npx . --help` lists every v1 command, and `--version` and `--json` work. Each command still exits 1 with "not implemented". An unknown command suggests the closest one (`metafab chek` → "Did you mean check?"). With `--json`, every run writes exactly one JSON object to stdout and exits with the spec's exit codes. CI runs `npm run verify` on Node 20 and 22 on Linux, macOS and Windows.

## Still to come

[1.002 Factory model](../plans/1.002-factory-model.md) and [1.003 Configuration](../plans/1.003-configuration.md) build on this and can run in parallel.
