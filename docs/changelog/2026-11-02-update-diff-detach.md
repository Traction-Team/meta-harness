---
title: "feat: metafab update, diff and detach"
date: 2026-11-02
pr: 16
plan: docs/plans/1.010-update-diff-detach.md
---

# `metafab update` merges a newer fab with your local edits

`metafab update [--to <version|range|ref>] [--dry-run] [--no-build]` brings an imported fab up to date. For npm and Git sources it merges each file three ways (recorded base, your copy, the new upstream), keeps your edits, and writes conflict markers or `<file>.upstream` side files where changes collide; it builds only when nothing conflicts. For a local path or HTTPS tarball it replaces the source's files and keeps your local-only files. Update refuses to start while markers or `.upstream` files remain, and refuses before writing anything when a new file would clobber local content. Upstream restructures (a file becoming a directory, case-only renames of files and directories) are followed, and your edits inside a renamed directory are merged at the new spelling.

`metafab diff [<path>]` shows your local edits against the recorded upstream as unified diffs, and `metafab detach` removes the upstream link without touching factory files.

## Still to come

Follow-ups are in `docs/intake/2026-11-02-update-polish.md`.
