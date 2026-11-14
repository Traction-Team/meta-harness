---
title: A failed update's restore removes a special entry inside a local-only directory
kind: follow-up
status: parked
revisit: 2027-03-01
filed: 2026-11-08
reported-by: cold review of PR #19 (plan 1.018), 8 Nov
source: "#19"
links: [docs/specs/sharing.md]
---

# Restore deletes a pipe or socket inside an unrecorded directory

## What happened, or what is wanted

`docs/specs/sharing.md` (Merge rules) and `src/core/update/restore.ts:55`, `:150` say a restore leaves a special entry (FIFO, socket) alone unless it sits on a recorded path. When the special entry is inside a directory the capture did not record (for example `Extra/events.pipe`, with `Extra/` created after capture), a failed update's restore deletes `Extra/` recursively and the pipe with it. Reproduced with `mkfifo`.

## What we know

- Either keep an unrecorded directory that holds a special entry, or narrow the spec and comments to say so.
- Tests: `test/core/update/restore.test.ts` covers only an unrecorded top-level pipe. Nothing exercises restoring over a pipe at a recorded path, or a planned write replacing one.
- Very unlikely in a real `.factory/`; no data in regular files is lost.

## Parked

12 Nov, prioritise-roadmap: parked until after v1. A pipe or socket inside `.factory/` is very unlikely, and no regular file data is lost.
