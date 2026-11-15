---
title: "chore: publish metafab 2.0.0-next.1 under the next dist-tag"
date: 2026-11-15
pr: 42
plan: docs/plans/2.016-prerelease-next.md
---

# The release workflow can publish a prerelease without making it the default install

A version with a prerelease part, such as `2.0.0-next.1`, now publishes under the npm dist-tag `next`, and every other version under `latest`. The rule is `.github/scripts/dist-tag.mjs`, which the release workflow runs before `npm publish --tag`. The package version is `2.0.0-next.1`, so once `v2.0.0-next.1` is tagged on `main`, `npx @seasb/metafab@next` installs the environments release. `npx @seasb/metafab` and the `^1.0.0` range still get the newest 1.x.

## Still to come

The person tags `v2.0.0-next.1` after the stack merges and records the `npm view` output. Plan 2.015 then pins the prerelease.
