---
title: Check marker scan has two encoding edges left after 1.015
kind: follow-up
status: new
filed: 2026-11-02
reported-by: cold review (review-branch, round 3), PR #15, 2 Nov
source: https://github.com/Traction-Team/meta-harness/pull/15
links: [docs/plans/1.015-check-markers-and-tidy.md, docs/specs/sharing.md]
---

# Check marker scan: encoding edges after 1.015

## What happened, or what is wanted

Small follow-ups from the last review of PR #15. Neither affects UTF-8 files.

## What we know

- `src/core/check/markers.ts:102`: a non-UTF-8 text file (for example Latin-1) whose first two characters are `ÿþ` or `þÿ` starts with the bytes of a UTF-16 BOM, so it is decoded as UTF-16 and its markers are missed. Before PR #15 the lenient UTF-8 decode found them. Declined in the build because such a file is far-fetched; a stricter probe (NUL bytes at consistent odd or even positions) would cover both cases.
- `test/core/check/markers.test.ts:164`: the UTF-16LE and UTF-16BE tests put the marker after line 1, so no test pins BOM stripping for UTF-16. It works today; add a line-1 case.
- UTF-32 files and UTF-16 files without a BOM are still skipped as binary, by design (plan 1.015 Decisions).
