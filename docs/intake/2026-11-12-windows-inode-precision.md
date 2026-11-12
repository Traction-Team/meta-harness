---
title: The containment test fails on Windows CI now and then
kind: bug
status: new
filed: 2026-11-12
reported-by: Sebastian, PR #18 CI (windows-latest, Node 22), 12 Nov; also main run 42458407210, 8 Nov
source: "#18"
links: [docs/plans/1.019-fix-windows-file-identity.md]
---

# `containmentRootAbsolute` takes a sibling directory for `.factory` on Windows

## What happened, or what is wanted

`test/core/sources/containment.test.ts > roots a link at the destination when no ancestor is .factory` failed on `windows-latest`: it expected `...\out` and got `...\out\.factory`. The same commit passed on the run before, and the test also failed on Windows on 8 Nov. A link under `out\assets\` was treated as stored inside `.factory`.

## What we know

`src/core/sources/containment.ts:25` compares `stat().dev` and `stat().ino` as JavaScript numbers. On Windows the NTFS file ID is 64 bits and does not fit in a double, so two different directories can compare as equal. `src/core/build/plan.ts:439` uses the same comparison. The fix is in the bug plan in `links:`.
