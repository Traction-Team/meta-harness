---
title: "fix: compare file identity exactly on Windows"
date: 2026-11-14
pr: 21
plan: docs/plans/1.019-fix-windows-file-identity.md
---

# Windows no longer mistakes two different directories or files for the same one

`metafab` now compares the full 64-bit NTFS file IDs when it checks whether two paths are the same file. Before, two directories created close together could look identical, so a link stored under `assets/` could be checked as if it were inside `.factory/`, and `metafab build` could think `CLAUDE.md` was a link to `AGENTS.md` when it was not. Nothing changes on macOS or Linux.
