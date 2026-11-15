---
title: "chore: orb setup continues when the unshallow fetch fails"
date: 2026-11-15
pr: 35
plan: docs/plans/1.029-orb-setup-unshallow.md
---

# A new Amp orb is ready to build even when its GitHub credentials arrive late

`.agents/setup` now installs dependencies, builds `dist/` and installs the factory skills before it unshallows the clone. When the unshallow fetch fails, usually because the orb's GitHub credentials are not ready yet, setup prints a `warning:` with the command to run by hand and exits 0, instead of stopping before the install. The fetch never prompts and gives up on a stalled connection. A clone that stays shallow is still unshallowed by `build-plan` and `finish-plan` before they merge the base.
