---
title: Two Git test fixtures can race Git's detached auto maintenance when they clean up
kind: tooling
status: new
filed: 2026-11-15
reported-by: review-branch on PR #38 (Plan 1.027), 15 Nov
source: https://github.com/Traction-Team/meta-harness/pull/38
links: [docs/plans/1.027-cli-and-source-fixes.md]
---

# Two Git test fixtures can race Git's detached auto maintenance when they clean up

## What happened, or what is wanted

With Git 2.55, each push into a bare repository starts a detached `git maintenance run --auto --quiet --detach` (seen with `GIT_TRACE2_EVENT`). In PR #38, that process raced the test fixture's `rm(root, { recursive: true })`, and `npm run verify` failed now and then with `ENOTEMPTY: directory not empty, rmdir '/tmp/metafab-fab-repo-…/fab.git/info'`. The first review saw this in 2 of 25 runs of `test/core/publish/git-target.test.ts`, and once in a full run.

## What we know

PR #38 fixed `test/core/publish/git-fab-fixture.ts` (`makeBareFabRepo`) and the two bare repositories in `test/core/sources/git-file.test.ts`: it sets `maintenance.auto=false` and `gc.auto=0`, and passes `maxRetries: 5` to the cleanup. Two fixtures outside that plan's `owns` still push into bare repositories without that fix:

- `test/core/update/git-fab.ts` (`createGitFab`, push at :104, cleanup at :111), used by `update.test.ts`, `restore-on-failure.test.ts`, `requirements.test.ts` and `cli/readdir-types.test.ts`.
- `test/core/sources/git-fixture.ts` (`createGitFixture`), pushed to from `test/core/sources/git.test.ts:274`.

The re-review could not make the race happen with these fixtures (30 pushes left no maintenance process running), so this is a flake risk, not a seen failure. The fix is the same two config lines and `maxRetries`.
