---
title: a symbolic link at a hook path gets the foreign-hook warning, which can be wrong
kind: follow-up
status: new
filed: 2026-11-08
reported-by: review-branch, PR #17, 8 Nov
source: "#17"
links: [docs/specs/building.md]
---

# A symbolic link at a hook path gets the foreign-hook warning, which can be wrong

## What happened, or what is wanted

`syncGitHooks` leaves a hook path that is not a regular file (a symbolic link, dangling or not) alone and, with `git-hooks: true`, reports it as `<file> exists and was not written by Metafab` with the fix `Add this line to <file>: ...`. When the link points at an older Metafab hook the message is false, and when it dangles the fix names a file that does not exist.

## What we know

`src/core/hooks/sync.ts` (the non-regular-file branch reuses `foreignWarning`). A dedicated message, such as `<file> is a symbolic link, so Metafab did not change it`, would be accurate and still satisfy rule 2 of [Git hooks](../specs/building.md#git-hooks).
