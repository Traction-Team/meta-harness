---
title: The publish flow says a metafab.yaml change can regenerate .gitattributes, but build never writes it
kind: follow-up
status: new
filed: 2026-11-12
reported-by: cold review of PR #18 (round 3, note N1)
source: "#18"
links: [.factory/AGENTS.md]
---

# The publish flow names `.gitattributes` as build output, which it is not

## What happened, or what is wanted

"Publishing docs changes" in `.factory/AGENTS.md` (generated into root `AGENTS.md`) says a change to `.factory/metafab.yaml` "can regenerate `.gitignore` or `.gitattributes`". Only `init` and `import` write `.gitattributes`; `build` does not, and no `metafab.yaml` key reaches it. A maintainer who follows the text waits for a `.gitattributes` diff that cannot appear.

## What we know

`ensureGitattributes` is called only from `src/core/init/run.ts` and `src/core/import/run.ts`. The fix is to drop `or .gitattributes` from that sentence in `.factory/AGENTS.md` and rebuild. The `.gitignore` half is correct: changing `agents` rewrites the `.gitignore` block.
