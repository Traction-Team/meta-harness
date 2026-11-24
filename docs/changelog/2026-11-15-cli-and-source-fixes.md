---
title: "fix: narrow help detection, isolate the test build, and close the publish and source edge cases"
date: 2026-11-15
pr: 38
plan: docs/plans/1.027-cli-and-source-fixes.md
---

# `-help` is now an unknown option, `#` and Windows paths in `publish.git` work, and `import` lists the local files it kept

`metafab init -help` now exits 1 and suggests `--help`. Before, it printed help. `metafab publish` prints a Windows-drive `publish.git` such as `file://C:\Users\bob@corp\fab.git` in full in every message. `metafab check` now refuses these values:

- an `https://` or `git@host:path` `publish.git` with a literal `#`;
- `git+file://localhost/`;
- an `upstream.source` that `import` would refuse. The error is the one `import` gives, such as an unsupported `ftp://` scheme.

An `ssh://` or `file://` `publish.git` with `#` gets an `import` line in the README that names the same repository. Cache write errors name the cache entry. `metafab import` lists the local factory files it kept that the fab does not have, under "Local files kept, not in the fab". The tests that run the CLI each compile a private copy, so a damaged `dist/` no longer breaks them.

## Still to come

Two more Git test fixtures may race Git's auto maintenance when they clean up, four private `isAbsentError` copies remain, and Plan 2.003 needs `src/commands/not-implemented.ts` back. All three are filed in `docs/intake/`. So is `import` from a `git+file://localhost/C:/…` URL on Windows, which publish now handles and import does not yet.
