---
title: Plan 2.003 uses src/commands/not-implemented.ts, which Plan 1.027 deleted
kind: follow-up
status: new
filed: 2026-11-15
reported-by: Plan 1.027 build, PR #38, 15 Nov
source: https://github.com/Traction-Team/meta-harness/pull/38
links: [docs/plans/2.003-remote-backend-and-login.md, docs/plans/1.027-cli-and-source-fixes.md]
---

# Plan 2.003 uses src/commands/not-implemented.ts, which Plan 1.027 deleted

## What happened, or what is wanted

Plan 1.027 (A6) deleted `src/commands/not-implemented.ts`, because nothing imported it. Draft Plan 2.003 says its store commands return `notImplemented("store <name>")` from that file.

## What we know

When 2.003 is next planned or built, it should either add `src/commands/not-implemented.ts` to its `owns` and create it again, with an error problem that has a `fix` as Plan 1.026 requires, or choose another way to stub its commands. `docs/verification.md` also still has a historical row for `src/commands/not-implemented.ts:13`. That file says not to edit old rows, so the row stays.
