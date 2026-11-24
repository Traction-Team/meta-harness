---
title: The git-target test for a fab file whose name contains a newline failed once with ENOTEMPTY
kind: tooling
status: new
filed: 2026-11-24
reported-by: build-plan worker for 2.016, task 2 of PR #42, 24 Nov
source: https://github.com/Traction-Team/meta-harness/pull/42
links: []
---

# A git-target publish test failed once removing its temporary fab.git

## What happened, or what is wanted

In a full `npm run verify`, `test/core/publish/git-target.test.ts` ("publishes a fab file whose name contains a newline", line 452) failed once with `ENOTEMPTY` while removing a temporary `fab.git` directory. It passed when run alone and in the next full run. PR #42 does not touch publishing. Expected: the test passes every time.

## What we know

Seen once in two full runs on the 2.016 task thread, and not in two later full runs (the worker's and the cold review's). The likely cause is a Git process still writing into the bare repository, or a recursive remove racing with it, when the test's cleanup runs. Not worked around beyond the rerun.
