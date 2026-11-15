---
title: .agents/setup stops at its unshallow step when the orb has no GitHub credentials yet
kind: follow-up
status: new
filed: 2026-11-15
reported-by: Amp worker for 1.012, building PR #29, 15 Nov
source: https://github.com/Traction-Team/meta-harness/pull/29
links: []
---

# Orb setup aborts before npm ci when the unshallow fetch cannot authenticate

## What happened, or what is wanted

In every orb started for PR #29 (the worker, two task threads, a fix thread and both review threads), `.agents/setup` failed at "Unshallow the clone": `git fetch --quiet --unshallow origin` exited 128 with "could not read Username for 'https://github.com'". Under `set -euo pipefail` the script stopped, so `npm ci`, `npm run build` and `node dist/cli.js build` never ran, and each thread ran them by hand. The orchestrator's orb hit the same failure. Expected: setup finishes, and a missing unshallow only matters to the later base merge.

## What we know

`.agents/setup`, `unshallow()`. GitHub credentials are available a moment later in the same orb: the same fetch succeeded by hand. Options: let the unshallow step warn and continue (the build-plan landing step already unshallows before its merge), or retry it. `.agents/setup` is repository-local, not part of fab-basic.
