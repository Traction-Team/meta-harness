---
title: metafab publish cannot pass an npm 2FA code
kind: bug
status: new
filed: 2026-11-15
reported-by: Sebastian, building Plan 1.024 (PR #28), 15 Nov
source: https://github.com/Traction-Team/meta-harness/pull/28
links: [docs/plans/1.024-first-fab.md]
---

# metafab publish cannot pass an npm 2FA code

## What happened, or what is wanted

`node dist/cli.js publish` from the fab-basic checkout, with `npm whoami` logged in, failed on the npm target with `E403 ... Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages`. `metafab publish` has no `--otp` option and does not let npm prompt for the code, so an account with 2FA on publish cannot publish without knowing to set `NPM_CONFIG_OTP` in the environment.

## What we know

The npm target runs `npm publish` as a child process (`src/core/publish/`). Options: an `--otp <code>` flag passed through to npm, or let npm read the terminal when stdin is a TTY, and in either case a fix line on E403 that names `--otp` or `NPM_CONFIG_OTP`. Also seen: `publish --dry-run` prints `check` warnings after the publish summary rather than before it.
