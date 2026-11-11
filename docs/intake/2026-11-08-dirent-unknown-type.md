---
title: snapshotTree and import copy trust Dirent type, so a DT_UNKNOWN filesystem looks empty
kind: follow-up
status: new
filed: 2026-11-08
reported-by: cold review of PR #19 (plan 1.018), 8 Nov
source: "#19"
links: [docs/specs/sharing.md]
---

# Tree readers skip every entry when readdir reports an unknown type

## What happened, or what is wanted

Plan 1.018 made `restore` classify entries with `lstat`, because some NFS and FUSE mounts report `DT_UNKNOWN` from `readdir`. The readers the merge depends on still trust the `Dirent` type. On such a mount `snapshotTree` returns no local entries, so `metafab update` plans an add or take-theirs at every path and overwrites local edits while reporting them as additions, and `import` copies nothing.

## What we know

- `src/core/import/file-tree.ts:86` (`snapshotTree`) and `src/core/import/copy.ts:74` branch on `Dirent.isFile()` / `isDirectory()` / `isSymbolicLink()`.
- Fix: fall back to `lstat` when no `Dirent` type predicate is true, as `src/core/update/restore.ts` now does. Other `readdir` walkers in `src/` may have the same pattern.
- Not reproducible on APFS or ext4.
