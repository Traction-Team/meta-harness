---
title: check misses conflict markers after a BOM and in files that are not UTF-8
kind: follow-up
status: new
filed: 2026-10-29
reported-by: review-branch cold review, PR #9, 29 Oct
source: "#9"
links: [docs/specs/sharing.md, docs/plans/1.005-check.md]
---

# check misses conflict markers after a BOM and in files that are not UTF-8

## What happened, or what is wanted

[Sharing: Merge rules](../specs/sharing.md#merge-rules) says `check` fails while a file contains conflict markers. Two cases pass silently:

- A UTF-8 BOM followed by `<<<<<<< HEAD` on line 1: the decoder keeps the BOM (`ignoreBOM: true`, `src/core/check/markers.ts:12`), so `startsWith` does not match.
- A text file in another encoding (`café` saved as ISO-8859-1): the fatal UTF-8 decode (`markers.ts:96`) treats it as binary and skips it.

## What we know

Strip a leading BOM before matching, and match the ASCII marker prefixes on the raw bytes (or a lenient decode) so the encoding does not matter. Binary detection can stay on the NUL probe alone.
