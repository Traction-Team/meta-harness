---
title: Fab source fetching leaves temp directories and has small robustness gaps
kind: follow-up
status: new
filed: 2026-10-26
reported-by: build-plan cold reviews, PR #6, 26 Oct
source: https://github.com/Traction-Team/meta-harness/pull/6
links: [docs/plans/08-sources.md, docs/plans/05-check.md, docs/specs/sharing.md]
---

# Small robustness gaps in `src/core/sources/`

## What happened, or what is wanted

The cold reviews of Plan 08 found these after the last fix round. None makes a valid fab fail, and none lets a fab write outside its directory.

1. HTTPS and local-path fetches leave their `mkdtemp` directory behind. `FetchedFab` has no cleanup hook (`https.ts`, `path.ts`).
2. One bad link is reported twice: once when it is created, once by the realpath check (`extract.ts` `verifyLinks`, `path.ts`).
3. `replaceMirror` in `git.ts` can leave `<mirror>.tmp-*` or `.old-*` directories if it is interrupted, and a failing `rm` of the backup throws after the swap succeeded.
4. `getOrCreate` in `cache.ts` deletes the target when `create` fails. Two concurrent imports can delete each other's entry, and a failing `rm` hides the original error.
5. `extractTarball` with both `stripPrefix` and `flattenSingleDirectory` does not flatten. No caller uses the combination yet.
6. The npm tarball cap (`npm.ts`) is checked after `npm pack` has written the whole tarball to a temp directory. It bounds the cache, not the download. An oversize package fills the temp directory first, and a full disk surfaces npm's error (exit 3) instead of the size error. HTTPS stops the download as soon as the cap is passed.
7. Config validation does not report an upstream `source` that `parseSource` rejects. `classifySource` (`src/core/config/source.ts`) falls back to the old prefix rules, so `upstream: {source: seasb/fab-base, version: 1.2.0}` passes, and the user only finds out at `update`. A malformed `file://C:/…` is reported as a Git source missing `commit`. This is the same as on `main` before Plan 08. `check` (Plan 05) should report "invalid source" with the file and line.
8. `parse.ts`: the `DRIVE_PATH` guard in `isScpGit` is unreachable, because `isPathLike` catches drive paths first, and its test does not exercise it. `parseGitUrl` does not check that `indexOf("://")` found a match.

## What we know

Each item names its file. Item 1 matters once `import` (Plan 09) runs many fetches in one process.
