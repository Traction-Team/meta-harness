---
title: Git publish tests time out on Windows CI
kind: follow-up
status: new
filed: 2026-11-04
reported-by: Windows CI on PR #16, 4 Nov
source: https://github.com/Traction-Team/meta-harness/pull/16
links: [docs/plans/1.011-publish.md]
---

# Git-target publish tests exceed the 5 s default timeout on Windows

## What happened, or what is wanted

On `verify (windows-latest, 20)` for PR #16 (run 41538561072), two tests in `test/core/publish/git-target.test.ts` timed out at 5000 ms: "uses publish.branch, then the remote default branch" (:117) and "skips a version whose tag already carries identical content" (:134). The same job on Node 22 passed them, and `main` was green, so this is load flake, not a product failure.

## What we know

The tests run several Git processes against local bare repositories; Git process start-up is slow on Windows runners. `test/core/update/` gives its Git-fixture describes a 30 s timeout; the publish tests use the default. Give them the same explicit timeout.
