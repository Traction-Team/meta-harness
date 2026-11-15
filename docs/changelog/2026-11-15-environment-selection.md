---
title: "feat: a factory declares env variables and each developer selects values in git config"
date: 2026-11-15
pr: 32
plan: docs/plans/2.011-environment-selection.md
---

# A factory can declare environment variables, and each developer picks their values with `metafab env set`

A `format: 2` factory can declare `env` variables in `factory.yaml`, such as `harness` with `opencode`, `claude` and `amp`. Each developer's selection comes from `--env`, then `FACTORY_ENV_<VAR>`, then `factory.env.<var>` in Git config, then the declared default, then every value. `metafab env` shows each variable's values and where they came from; `metafab env set` and `env unset` write or remove the selection in repository or global Git config and rebuild; `build` and `check` take `--env`. Format 2 fabs import from path, Git and npm sources. Nothing renders differently yet, and format 1 factories build exactly as before.

## Still to come

Plan 2.012 adds the `when`, `switch` and `import` directives that use the selection. Two tooling notes from this build are filed in `docs/intake/`.
