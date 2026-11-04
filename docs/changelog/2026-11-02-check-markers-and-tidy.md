---
title: "fix: check finds conflict markers in any encoding and cannot drift from build"
date: 2026-11-02
pr: 15
plan: docs/plans/1.015-check-markers-and-tidy.md
---

# `metafab check` finds conflict markers after a byte order mark and in non-UTF-8 text files

`metafab check` now fails on a conflict marker in a file under `.factory/` that starts with a UTF-8 byte order mark, in a Latin-1 or other non-UTF-8 text file, and in a UTF-16 file with a byte order mark. Before, these files passed silently. Only files with a NUL byte in their first 8 KiB and no UTF-16 byte order mark are skipped as binary. An unreadable directory under `.factory/` is reported once. `build`, `check` and `publish` now read the CLI version from one place, so the built-in skill's version check cannot drift from what `build` writes.

## Still to come

Plan 1.010 (`update`) writes conflict markers that `check` now catches in every text encoding. Two encoding edge cases are filed in `docs/intake/2026-11-02-check-encoding-edges.md`.
