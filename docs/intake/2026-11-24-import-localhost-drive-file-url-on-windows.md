---
title: import and update of git+file://localhost/C:/… may fail on Windows, where publish now succeeds
kind: bug
status: new
filed: 2026-11-24
reported-by: review-branch on PR #38 (Plan 1.027), 24 Nov
source: https://github.com/Traction-Team/meta-harness/pull/38
links: [docs/plans/1.027-cli-and-source-fixes.md]
---

# import and update of git+file://localhost/C:/… may fail on Windows, where publish now succeeds

## What happened, or what is wanted

PR #38 (fd888b6) found that Git for Windows reads `file://localhost/C:/…` as a UNC path, with server `localhost` and share `C:`. It made `gitTransportUrl` in `src/core/sources/parse.ts` hand Git `file:///C:/…` instead, so `publish` works there. The README import line that publish writes is still `git+file://localhost/C:/…`. The import side, `parseGitFileUrl` (`src/core/sources/parse.ts` around :205), converts only a bare drive path. So `import` and `update` of that line still hand Git `file://localhost/C:/…`, which by the same reasoning fails on Windows.

## What we know

The `import` and `update` behaviour is the same as before PR #38. Neither side has been run on Windows; the review traced it with `dist/` on Linux. The likely fix is one shared conversion that both `parseGitFileUrl`'s `url` and `gitTransportUrl` use, plus a `parse.test.ts` case, and a Windows run of import from a `localhost` drive URL. The same change can correct two small things the review noted in fd888b6:

- `test/core/publish/git-target.test.ts:155`: the comment "Git accepts a userinfo on a file://localhost/ URL" is out of date.
- `src/core/sources/parse.ts:152`: `const path` in `localhostFileUrl` hides the `node:path` import.
