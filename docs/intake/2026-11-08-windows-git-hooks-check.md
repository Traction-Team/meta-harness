---
title: check by hand that Metafab's git hooks run under Git for Windows
kind: follow-up
status: new
filed: 2026-11-08
reported-by: Plan 1.016 (Design: hookScript), PR #17, 8 Nov
source: "#17"
links: [docs/plans/1.012-release.md, docs/specs/building.md]
---

# Check by hand that Metafab's git hooks run under Git for Windows

## What happened, or what is wanted

Plan 1.016 asks for a manual check during Plan 1.012's Windows pass: the hook scripts must run under Git for Windows' bundled `sh`, and `[ -x node_modules/.bin/metafab ]` and `command -v metafab` must find npm's extensionless `sh` shim.

## What we know

The hook tests that execute shell are skipped on Windows CI; only the script content tests run there. Try: a repository with `git-hooks: true`, `metafab build`, then `git worktree add ../wt -b x` and confirm `../wt/.claude/skills/metafab/` exists.
