---
title: Leftover publish.git and git+file:// edge cases from the PR #20 reviews
kind: follow-up
status: new
filed: 2026-11-15
reported-by: cold review of PR #20 (Plan 1.021), round 5, 15 Nov
source: "#20"
links: [docs/plans/1.021-source-hardening.md, docs/specs/sharing.md]
---

# Small edge cases left after Plan 1.021

## What happened, or what is wanted

The last review of PR #20 returned "merge" with these still open:

- An `https://` or `ssh://` `publish.git` whose path has a `#` (`https://example.com/my#fab.git`) gets a README import line that parses the `#` as a ref. Only `file://` URLs are encoded as `%23` (`importSourceForGitUrl` in `src/core/sources/parse.ts`).
- `git+file://localhost/` is accepted and names the filesystem root; `git+file:///` is refused as "no path". The localhost form should be refused the same way.
- An extraction write failure names the `.tmp-<uuid>` staging directory (`src/core/sources/git.ts`, `src/core/sources/npm.ts`), which is gone when the person reads it; the tarball copy names the final path.
- The file-URL authority rule is written twice: `fileUrlNamesHost` in `src/core/config/validate.ts` and `parseGitFileUrl` in `src/core/sources/parse.ts`.
- `isAbsentError` has three copies (`cache.ts`, `git.ts`, `publish/readme.ts`); it belongs in `src/util/fs.ts`.
- No test runs `publish.git: file:///…/my#fab.git` → README → `import`; only the already-encoded form is round-tripped.
- A corrupt cache entry is validated twice before it is rebuilt.

## What we know

All are small and none blocks the release. Every location is named above.
