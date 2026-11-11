---
title: "fix: update, import and check edge cases, with one copy of each shared helper"
date: 2026-11-08
pr: 19
plan: docs/plans/1.018-sharing-polish.md
---

# update, import and check now behave the same on every operating system

`metafab update` keeps a CRLF file as CRLF, writes a link conflict as a plain `<path>.upstream` text file, ignores permission changes other than the executable bit, and puts `.factory/` back exactly as it was if a write fails partway (exit 1, `update-write-failed`). `metafab import --force` renames a case-only clash to the fab's spelling on macOS, Linux and Windows alike, and refuses two local entries that differ only in case. `metafab diff` with no edits prints `No local edits since <source> <version>.`, and `metafab check` finds conflict markers in a Latin-1 file that happens to start with `ÿþ`. Adopting skills accepts a link into a sibling skill adopted in the same run. The fetch cache key did not change, so existing caches stay valid.

## Still to come

Follow-ups filed to intake: tree readers that trust `Dirent` on `DT_UNKNOWN` filesystems, and restore around special entries in a local-only directory.
