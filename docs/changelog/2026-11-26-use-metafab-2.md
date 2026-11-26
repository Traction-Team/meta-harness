---
title: "chore: fab-basic and this repository use metafab 2.0.0"
date: 2026-11-26
pr: 49
plan: docs/plans/2.018-use-metafab-2.md
---

# fab-basic 0.2.1 runs the stable `npx --yes @seasb/metafab`, and this repository depends on Metafab `^2.0.0`

fab-basic 0.2.1 (tag `v0.2.1`) drops the `next` dist-tag: its setup templates, docs and CI run plain `npx --yes @seasb/metafab`, which installs 2.0.0. A repository that created `docs/factory.md` or `orca.yaml` from the 0.2.0 templates changes `@next` there by hand, as fab-basic's changelog says, because `update` never rewrites a file a template created. This repository now depends on `@seasb/metafab` `^2.0.0` instead of the exact `2.0.0-next.1` pin, so its Git hooks follow 2.x patch and minor releases, and its `.factory/` is updated to fab-basic 0.2.1.
