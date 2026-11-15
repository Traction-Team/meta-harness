---
title: "fix: every error names a fix, every json result has problems, and problem files use /"
date: 2026-11-15
pr: 36
plan: docs/plans/1.026-error-and-json-contract.md
---

# Every failed command now tells you what to do next

When a command fails (exit 1, 3, 4 or 5), standard error now shows at least one `fix:` line: a failed fetch, an invalid fab, a bad configuration value, a rejected path or a failed publish target all name the next step. With `--json`, every result has `problems`, including `map`, `create`, `pipeline add`, `pipeline remove` and `metafab --version --json`, where it is empty. Problem `file` values use `/` on every platform, so `import` of a local fab on Windows no longer reports backslash paths. Exit codes, messages and error codes are unchanged.

## Still to come

The type change means a new error with no fix, or a result with no `problems`, no longer compiles, so the contract holds for new commands too.
