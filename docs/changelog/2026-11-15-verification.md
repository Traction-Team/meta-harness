---
title: "chore: verify agent tools, windows and the ci recipe before release"
date: 2026-11-15
pr: 27
plan: docs/plans/1.022-verification.md
---

# Every command's `--json` result now has `command` and `problems`, and the checks before 1.0 are recorded

An internal error in `metafab <command> --json` now returns `command` and a `problems` entry with a fix line instead of a bare error, and human output adds a `fix:` line after the stack. `docs/verification.md` records which agent tools read what `metafab build` installs (Claude Code, Codex and opencode each list every skill once), the review of every error message and exit code, and the CI recipe and hook checks. A new `hooks` CI job checks how the Git hooks find `metafab` on Linux, macOS and Windows.

## Still to come

Cursor, Copilot and Claude Code on Windows are still to be checked by hand. Error sites without a fix line are filed in `docs/intake/`.
