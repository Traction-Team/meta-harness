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

A code is not the only gap. An account whose 2FA is a security key or passkey (1Password, for example) has no code at all: npm's browser sign-in is the only way, and it does not work through `metafab publish`. Run under a pseudo-terminal, npm printed the sign-in URL and then stopped with `EOTP` instead of waiting, because `publishNpm` in `src/core/publish/npm-target.ts` reads npm's output through pipes. The workaround used for `@seasb/fab-basic@0.1.1`: let `metafab publish` stage and pack the fab (a stand-in `npm` on `PATH` turned `publish <dir>` into `npm pack`), then run `npm publish <tgz> --access public --auth-type=web` by hand. Also note that npm is moving publishing toward trusted publishing (OIDC) and staged publishes with human approval, with 2FA-bypass tokens losing direct publish around January 2027 ([changelog](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/)).

The npm target runs `npm publish` as a child process (`src/core/publish/`). Options: an `--otp <code>` flag passed through to npm, or let npm read the terminal when stdin is a TTY, and in either case a fix line on E403 that names `--otp` or `NPM_CONFIG_OTP`. Also seen: `publish --dry-run` prints `check` warnings after the publish summary rather than before it.

Priority, 15 Nov: lower. Fabs are shared as Git repositories by default, so only the optional npm target meets this. fab-basic no longer publishes to npm (decision of 15 Nov in the roadmap), so none of our own releases meet it.
