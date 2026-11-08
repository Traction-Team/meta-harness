---
title: a second prompt hangs when answers arrive on one piped stdin chunk
kind: bug
status: new
filed: 2026-11-08
reported-by: build-plan task sub-agent, PR #17, 8 Nov
source: "#17"
links: [docs/plans/1.016-git-hooks.md]
---

# A second prompt hangs when answers arrive on one piped stdin chunk

## What happened, or what is wanted

With 1.016, `init --adopt` in a terminal can ask two questions (adoption, then git hooks). A test feeding both answers through one piped stdin chunk hung on the second question, so the test passes `--no-git-hooks` instead.

## What we know

Reported by the sub-agent that built `init`'s hooks question, not reproduced by hand. Likely cause: `src/input.ts` opens a new `readline` interface per question, and the first one consumes the buffered input that holds the second answer. In a real TTY each answer arrives separately, so users are probably not affected. Fix: share one interface across questions in a run.
