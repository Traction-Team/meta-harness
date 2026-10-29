---
title: Three build tests fail on Windows CI since Plan 04 merged
kind: bug
status: new
filed: 2026-10-29
reported-by: finish-plan, PR #5, 29 Oct
source: https://github.com/Traction-Team/meta-harness/actions/runs/40814563101
links: [docs/plans/04-build.md]
---

# main is red on windows-latest after #4

## What happened, or what is wanted

The CI run for 79e9193 (#4) fails `verify` on `windows-latest` (Node 20 and 22). Every other platform passes. The same three tests fail on every branch merged with main:

- `test/core/build/plan.test.ts` › golden mark4-like build: the expected `AGENTS.md` fixture is read with CRLF (`\r\n`), while `build` writes LF.
- `test/core/build/plan.test.ts` › writes LF, copies binary bytes and keeps executable bits: the executable bit reads as 0.
- `test/core/build/skill.test.ts` › sets an explicit mode for every file from its executable bit: mode 420 (0644) where 493 (0755) is expected.

## What we know

The CRLF failure is probably Git checking out the fixture with `core.autocrlf` (no `.gitattributes` rule for `test/fixtures/`), or the test reading it without normalising. The mode failures are Windows having no POSIX executable bit: the tests need a platform guard, or `build` needs to carry the bit from Git's index instead of `fs.stat`. CI was red at merge time, so this went in unnoticed.
