---
updated: 2026-11-15
---

# Metafab v1 roadmap

This file is the source of truth for implementation progress on the `metafab` CLI v1.

- **What to build:** [specs](specs/README.md)
- **How to build it:** [plans](plans/), one per item below
- **Where we are:** the checkboxes in this file, and each plan's `status`

## How to use this file

The [factory](../.factory/README.md) workflows maintain this file:

- `start-plan` picks the first ready plan in this order (`node .factory/scripts/next.mjs` shows ready, blocked and in-flight plans). A plan in flight has `status: building` and a draft pull request.
- `finish-plan` ticks a plan's box in its landing commit, and moves the open questions it answered to [Decisions](#decisions).
- `plan-feature` adds lines for new plans. `prioritise-roadmap` reorders lines, adds work that needs a plan, and decides open questions and intake notes.
- When a plan changes scope, edit the plan and this file in the same commit.

## Milestone 1: Local factory

A team can create, edit, build, and check a factory in one repository.

- [x] [1.001 Project foundation](plans/1.001-foundation.md): package, command runner, JSON output, exit codes, factory discovery
- [x] [1.002 Factory model and validation](plans/1.002-factory-model.md): load `.factory/`, YAML and frontmatter grammar, validation rules
- [x] [1.003 Configuration](plans/1.003-configuration.md): `metafab.yaml` loading, validation, comment-preserving writes
- [x] [1.004 Build](plans/1.004-build.md): compiled skills, ownership, `AGENTS.md` / `CLAUDE.md` / `.gitignore` blocks, built-in skill
- [x] [1.005 Check](plans/1.005-check.md): source, config, and installed-output validation
- [x] [1.006 Init and adoption](plans/1.006-init-and-adoption.md): `init`, `.gitattributes`, moving existing skills into `.factory/`
- [x] [1.007 Authoring and inspection](plans/1.007-authoring-commands.md): `create`, `pipeline add/remove`, `map`
- [x] [1.013 Factory edge cases](plans/1.013-factory-edge-cases.md): `factory.yaml` aliases, reserved containers, `create` and `map` fixes
- [x] [1.014 Adoption and init polish](plans/1.014-adoption-polish.md): links into `.factory/`, real read errors, no partial `init`
- [x] [1.015 Check markers and internals](plans/1.015-check-markers-and-tidy.md): conflict markers after a BOM or in non-UTF-8 files, one walk, no drift from `build`
- [x] [1.016 Git hooks](plans/1.016-git-hooks.md): `git-hooks` setting, hooks rebuild after checkout, merge and rebase, `orca.yaml` suggestion, skill guidance

## Milestone 2: Sharing

A team can publish a factory as a fab and other teams can import and update it.

- [x] [1.008 Sources and fetching](plans/1.008-sources.md): source parsing, npm/Git/HTTPS/path fetch, cache, fab validation
- [x] [1.009 Import and review summary](plans/1.009-import.md): `import`, risk-ordered summary
- [x] [1.010 Update, diff, detach](plans/1.010-update-diff-detach.md): three-way merge, unversioned overwrite, `diff`, `detach`
- [x] [1.011 Publish](plans/1.011-publish.md): staging, npm target, Git fab repository target

## Milestone 3: Release

- [x] [1.017 Dogfood](plans/1.017-dogfood.md): this repository builds its factory with `metafab build`; `link.mjs` retires
- [x] [1.018 Sharing edge cases and shared helpers](plans/1.018-sharing-polish.md): CRLF and restore-on-failure in `update`, `import --force` case clashes, `diff` with no edits, one copy of each shared helper
- [x] [1.019 Exact file identity on Windows](plans/1.019-fix-windows-file-identity.md): `bigint` `dev`/`ino` in containment and the `CLAUDE.md` link check; fixes the flaky Windows CI test
- [x] [1.020 CLI fixes](plans/1.020-cli-fixes.md): discovery stays in the Git repository and refuses Droid's `.factory/`, `<command> --help`, one prompt reader per run, `DT_UNKNOWN` walkers, hook warnings and hook lines
- [x] [1.021 Source hardening](plans/1.021-source-hardening.md): `git+file://` sources, safe cache and mirror swaps, cache write errors exit 3, npm size checked before download
- [x] [1.023 Factory requirements](plans/1.023-factory-requires.md): `requires:` in `factory.yaml`; `import` and `update` offer to create missing repository files from templates, `check` warns
- [ ] [1.022 Verification](plans/1.022-verification.md): agent tools, Windows, git hooks under Git for Windows, the CI recipe against `mark4-like`, the error message and `--json` contract, recorded in `docs/verification.md`
- [ ] [1.024 First fab](plans/1.024-first-fab.md): the Dragonfly factory generalised as `@seasb/fab-basic`, and this repository imports it
- [ ] [1.012 Release v1](plans/1.012-release.md): package `README.md`, release workflow with provenance, `@seasb/metafab@1.0.0`
- [ ] [1.025 Git hooks on here](plans/1.025-git-hooks-on.md): `@seasb/metafab` as a devDependency and `git-hooks: true` in this repository, once 1.0.0 is on npm

## Milestone 4: Environments (version 2)

A team compiles one factory for each developer's environment: the factory declares variables such as `harness` and `workspace`, each developer selects values in Git config, and `build` installs only the instructions that apply, with `when`, `switch` and `import` directives and conditional skills. What to build: [Environments](specs/environments.md). 2.011 to 2.014 and 2.016 are approved (2026-11-15); 2.015 stays a draft until its prerequisites land. Start them after 1.012 releases v1.

- [ ] [2.011 Environment declarations and selection](plans/2.011-environment-selection.md): `format: 2`, `env` in `factory.yaml`, selection from `--env`, `FACTORY_ENV_*` and Git config, `metafab env`, `env set`, `env unset`
- [ ] [2.012 Conditional blocks and skills](plans/2.012-conditional-blocks.md): `when` and `switch` directives, labels for partial matches, `skills:` conditions, `check` validates every branch
- [ ] [2.013 Imports and partials](plans/2.013-imports.md): `factory:import`, shared partials in `.factory/partials/`, path rules and import loops
- [ ] [2.014 Preview and authoring guidance](plans/2.014-preview-and-guidance.md): `build --out`, the `metafab` skill's Environments section, the workflow guidance rule
- [ ] [2.016 Prerelease 2.0.0-next.1](plans/2.016-prerelease-next.md): the release workflow publishes a prerelease version under the npm dist-tag `next` and never moves `latest`; `@seasb/metafab@2.0.0-next.1`
- [ ] [2.015 This repository's factory uses environments](plans/2.015-dogfood-environments.md): fab-basic 0.2.0 declares `harness` and `workspace` with partials for sub-agents and workers; this repository updates to it, pins 2.0.0-next.1, and `.agents/setup` selects Amp and orbs

## Milestone 5: Store (version 2, draft plans)

A team keeps its factory's working documents and scores in a shared store outside Git, with a local mirror for agents. What to build: [Store](specs/store.md) and [Store protocol](specs/store-protocol.md). These plans are drafts awaiting approval; start them after 1.012 releases v1.

- [ ] [2.001 Document folders](plans/2.001-document-folders.md): `format: 2`, `documents` in `factory.yaml`, JSON Schema, `unique` and `references`, checked by `metafab check`
- [ ] [2.002 Store model and local backend](plans/2.002-store-model-and-local-backend.md): `store` in `metafab.yaml`, document content and hashes, origin, the backend interface, the local backend, the contract suite
- [ ] [2.003 Remote backend and login](plans/2.003-remote-backend-and-login.md): the protocol client, credentials, `login` and `logout`, exit code 6, the protocol test server, `npm run test:contract`, command groups
- [ ] [2.004 Pull and status](plans/2.004-pull-and-status.md): the gitignored mirror, state and index, conflict copies, `pull`, `status`, `show`, `log`, `.gitignore` lines
- [ ] [2.005 Push and conflicts](plans/2.005-push-and-conflicts.md): atomic `push` with document rules, `--resolved`, `diff`, `mv`, `archive`, `restore`
- [ ] [2.006 Sync windows and ls](plans/2.006-sync-windows-and-ls.md): windows, units, pins, `unpin`, `ls`, `check` reads the index
- [ ] [2.007 Scores](plans/2.007-scores.md): `score` and `scores`, subjects pinned to a version or commit
- [ ] [2.008 Scorers](plans/2.008-scorers.md): `.factory/scorers/<name>.md`, `scorer list`, `prompt`, `record`
- [ ] [2.009 Import, hooks and skill](plans/2.009-import-hooks-and-skill.md): `store import` from Git, `post-checkout` pulls new worktrees, the skill's Store section
- [ ] [2.010 Git backend](plans/2.010-git-backend.md): `backend: git` keeps the store on `refs/metafab/store` in this repository, or on a branch of a separate one; no server and no login
- [ ] Release 2.0.0 (needs a plan)
- [ ] This repository keeps plans, intake and changelog in Metastore Cloud, and its workflows run scorers (needs a plan; after Metastore Cloud's first release, built in `seasb/metafab-metastore` from [its draft](specs/next/metastore-cloud.md))

## Order and parallel work

```text
1.001 ─┬─ 1.002 ─┬─ 1.004 ── 1.005 ── 1.006 ──┐
       │         ├─ 1.007                     ├─ 1.009 ── 1.010
       │         ├─ 1.013                     │
       └─ 1.003 ─┴─ 1.008 ────────────────────┘
                    1.005 + 1.008 ── 1.011
1.014 ─┬─ 1.016 ─┬─ 1.017
1.015 ─┘  1.009 ─┘
          1.016 ─── 1.018
1.019 ── 1.020 ─┬─ 1.023 ─┬─ 1.022 ─┬─ 1.012 ── 1.025
         1.021 ─┘         └─ 1.024 ─┘
```

1.002 and 1.003 can run in parallel. 1.007 can run in parallel with 1.004 to 1.006. 1.013 needs nothing unmerged and can run beside 1.005 and 1.006. 1.008 can start once 1.002 and 1.003 are done. 1.014 and 1.015 need nothing unmerged and share no paths with 1.009 to 1.011, so they can run beside them. 1.017 should land between waves, because it changes how every worktree gets its skills. 1.018 shares no paths with 1.017, so the two can run side by side after 1.016. On 12 Nov 1.012 was split into 1.020 to 1.024. 1.019 and 1.021 can run side by side; 1.020 waits for 1.019 because both change `src/core/build/plan.ts`. 1.023 needs 1.020 and 1.021. 1.022 and 1.024 can run side by side after 1.023; 1.024 should land between waves, because it replaces `.factory/` and every worktree's skills. 1.012 publishes the package, and 1.025 turns on hooks here once it is on npm.

```text
1.012 + 1.023 ── 2.011 ── 2.012 ── 2.013 ── 2.014 ── 2.016 ── 2.015
                               PR #25 ── 1.024 + 1.025 ───────┘
```

Milestone 4 is a chain: each plan extends the parser, renderer or command the one before it adds. 2.016 publishes `@seasb/metafab@2.0.0-next.1` under the `next` dist-tag once 2.014 has merged; it changes only the release workflow, its tests and the version, so it shares no paths with 2.011 to 2.014. 2.015 also waits for 2.016 (fab-basic 0.2.0 and this repository pin the prerelease), 1.024 (which imports fab-basic, carrying PR #25's Amp flow as hand-written variants; PR #25 merges before 1.024 is built) and 1.025 (whose devDependency 2.015 moves, so the hooks read format 2). 2.015's factory rewrite happens in fab-basic, outside this repository, before its pull request here. 2.011 introduces `format: 2`, so it comes before the store plans too.

```text
1.012 + 1.023 ── 2.011 ── 2.001 ── 2.002 ──┐
1.020 ─────────────────────────────────────┴─ 2.003 ── 2.004 ─┬─ 2.005 ── 2.006 ─┬─ 2.009
                                                              ├─ 2.007 ── 2.008 ─┘
                                                              └─ 2.010
```

Milestone 5 is mostly a chain, because each plan builds on the model the one before it adds. 2.001 needs only 2.011 from Milestone 4, but it changes the same factory files as 2.012 and 2.013 (`factory-yaml.ts`, `types.ts`, `validate.ts`, `load.ts`), so it never runs beside them; in roadmap order it starts after 2.014. After 2.004 merges, 2.007 shares no paths with 2.005 and 2.006 and can run beside them. 2.003 registers every later command as a stub, so each later plan owns only its own command files. 2.010 touches only backend and configuration code, so it can run beside 2.005 to 2.009. Release 2.0.0 after 2.009 and 2.010.

## Open questions

Answer these before or during the named plan. Spec-level questions are linked to their source.

| Question | Blocks | Proposal |
| --- | --- | --- |
| Field-level frontmatter merge | [1.010](plans/1.010-update-diff-detach.md#open-questions), [spec](specs/sharing.md#open-questions) | Line merge in v1 |
| Duplicate skills in Cursor and Copilot | [1.022](plans/1.022-verification.md), [spec](specs/README.md#open-questions) | Test during verification |
| Multiple upstream fabs; pipeline branches; trusted publishers; fleet updates | After v1 | Deferred |
| Approve the version 2 store direction: `metafab store` (Metastore Cloud is the hosted backend), trunk-only documents with origin (not branch-aware records), `format: 2` with `documents` and scorers, a new exit code 6, and remote, git and local backends | 2.001 to 2.010, [spec](specs/store.md) | Approve as written; branch-aware records stay a [draft](specs/next/branch-aware-records.md) |
| Should backends enforce document rules, so two pushes at once cannot save duplicate unique values? | After 2.009, [spec](specs/store.md#open-questions) | Later, as a protocol capability |
| Approve the environments direction: [spec amendments](specs/environments.md) of 15 Nov (variable names start with a letter; outside a Git repository global and system config still count; labels leave out variables with every value; `build --out` refuses skill destinations; a block and its enclosing conditions span at most 1024 combinations; whitespace is optional around condition symbols), `env set` and `env unset` rebuild, and no compile of every selection in `check` | 2.011 to 2.014, [spec](specs/environments.md) | Approve as written |
| Which environment variables identify each agent tool for `origin.agent`? | [2.002](plans/2.002-store-model-and-local-backend.md#open-questions) | Documented variables only; `METAFAB_AGENT` otherwise |

## Decisions

Record answered questions here with the date and the commit that applied them.

| Date | Decision | Applied in |
| --- | --- | --- |
| 2026-11-15 | The first fab is `@seasb/fab-basic` (`github:seasb/fab-basic`), not `fab-orca`: a factory named after one harness or runner conflicts with environments, and the fab describes a process | [1.024](plans/1.024-first-fab.md#decisions), [1.012](plans/1.012-release.md) |
| 2026-11-15 | PR #25 (Amp orbs and Amp workers) merges before 1.024 is built; 1.024 carries its Amp flow into fab-basic as hand-written variants, and 2.015 turns them into `switch` blocks in fab-basic, never as local edits here | [1.024](plans/1.024-first-fab.md#decisions), [2.015](plans/2.015-dogfood-environments.md#decisions) |
| 2026-11-15 | Harness values are `opencode`, `claude` and `amp`. Claude Code sub-agents live in `.claude/agents/`, shipped by fab-basic as setup templates under `requires`; partials never hard-code sub-agent names but use the `sub-agent-*` settings in `docs/factory.md` | [2.015](plans/2.015-dogfood-environments.md#decisions) |
| 2026-11-15 | After 2.014, publish `@seasb/metafab@2.0.0-next.1` under the npm dist-tag `next`; fab-basic 0.2.0 and this repository (the 1.025 devDependency) pin it until 2.0.0 ships. 1.012's release workflow needs a `--tag next` change first | [2.015](plans/2.015-dogfood-environments.md#decisions), [2.016](plans/2.016-prerelease-next.md) |
| 2026-11-12 | Split 1.012 into 1.020 to 1.024 and the npm release. The first fab generalises the Dragonfly factory as `@seasb/fab-basic` instead of porting Mark IV, and this repository imports it | [1.012](plans/1.012-release.md), [1.024](plans/1.024-first-fab.md) |
| 2026-11-12 | Factory discovery stops at the Git top level, and outside Git checks only the current directory. Keep the name `.factory/`; a `.factory/` with Factory.ai Droid's files and no `factory.yaml` is refused with exit 5 | [1.020](plans/1.020-cli-fixes.md) |
| 2026-11-12 | A factory declares the repository files it needs under `requires:` in `factory.yaml`. `import` and `update` offer to create missing ones from templates and never overwrite; `check` warns. No scripts run on import in v1. Per-repository values live in a repository-owned settings file the fab's template creates | [1.023](plans/1.023-factory-requires.md) |
| 2026-11-12 | `metafab <command> --help` prints the command's usage, arguments and options; `git+file://` is a Git source | [1.020](plans/1.020-cli-fixes.md), [1.021](plans/1.021-source-hardening.md) |
| 2026-10-31 | `publish` releases Git first, then npm. A target that already has the version with identical content is skipped, so a re-run finishes a partial publish; different content refuses the whole publish. No `--provenance` flags in v1: detection only | #13 |
| 2026-10-31 | The review summary has an **Other** group (templates and other files) after Skills, before preserved edits and conflicts | #12 |
| 2026-10-31 | `import` refuses, without `--force`, any incoming path that would replace a different local file, link or directory, or that differs from a local path only in letter case; it checks the build output can be written before it writes anything | #12 |
| 2026-10-31 | Installed skills stay gitignored copies. A team keeps them current with Git hooks (`git-hooks: true`, written by `init`, applied by every `build`), worktree setup scripts (`init` suggests the `orca.yaml` step), and agent instructions. No agent session-start hooks and no `build --watch`. Hooks run local `metafab`, then `PATH`, then pinned `npx`, and never touch a hook Metafab did not write | [building](specs/building.md#keeping-installed-skills-current), [1.016](plans/1.016-git-hooks.md) |
| 2026-10-31 | This repository dogfoods `metafab build` before v1; `link.mjs` retires | [1.017](plans/1.017-dogfood.md) |
| 2026-10-26 | `requested` records `^<resolved version>` for an npm source or a tagged Git source given without a range; it is omitted for a Git source with no version tags | #6 |
| 2026-10-26 | npm fabs download with `npm pack --ignore-scripts`; an `install` script does not run (verified on npm 11 only) | #6 |
| 2026-10-26 | Drop `metafab rename` from v1: rename a skill by hand, and `check` reports a directory/name or pipeline mismatch | #5 |
| 2026-10-23 | Enforce the stricter Agent Skills name rules (no leading/trailing/double hyphens, max 64); the spec now states them | #3 |
| 2026-10-23 | Reserve factory skill names that start with `metafab`; validation rule 10 now rejects them | #3 |
| 2026-10-23 | A duplicate target in `agents` is a warning, not an error | #2 |
| 2026-10-25 | Render `stop` text in `AGENTS.md` verbatim, without lowercasing; the spec examples now match | #4 |
| 2026-10-25 | A symlink inside a source skill is copied as its target's content when it stays inside `.factory/`; otherwise `build` reports an error | #4 |
| 2026-10-25 | An installed skill directory Metafab owns is owned as a whole: `build` rewrites it to match the source. Any unowned entry directly in a selected destination stops `build` with exit 5 and a suggestion to run `metafab init` | #4 |
| 2026-10-26 | `build` never writes through a symbolic link at the repository root or in a skill destination; a change that needs one stops with exit 5. A `CLAUDE.md` link to the root `AGENTS.md` is left unchanged | #4 |
| 2026-10-29 | Installed files are 0755 when the source has any executable bit, else 0644; `build` corrects other modes on macOS and Linux, and Windows compares content only. An unreadable path is one `Cannot read` error with exit 1, never an ownership conflict. Plan 1.005 fixes the build permission edge cases | [building](specs/building.md#repeatability), [1.005](plans/1.005-check.md) |
| 2026-10-29 | A `SKILL.md` directly in a reserved top-level directory is validation rule 11, and `create` refuses those paths | [factory-format](specs/factory-format.md#validation), [1.013](plans/1.013-factory-edge-cases.md) |
| 2026-10-29 | `import` into a factory that already has an upstream exits 5 with one problem on `.factory/metafab.yaml` | [1.009](plans/1.009-import.md#design) |
| 2026-10-29 | `--adopt` on `init` and `import` gives skill-adoption consent without a terminal; the exit-2 payload names it | [cli](specs/cli.md#adopt-existing-skills), [1.006](plans/1.006-init-and-adoption.md#decisions) |
| 2026-10-29 | Adoption blockers and `import` file conflicts without `--force` exit 5 | [cli](specs/cli.md#adopt-existing-skills), [1.006](plans/1.006-init-and-adoption.md#decisions), [1.009](plans/1.009-import.md) |
| 2026-10-29 | Every `--json` result contains `exitCode` | [cli](specs/cli.md#json-output) |
| 2026-10-29 | Git fetches, clones and pushes may prompt only when stdin is a terminal and `--json` is absent | [1.009](plans/1.009-import.md#fetch-hygiene), [1.010](plans/1.010-update-diff-detach.md), [1.011](plans/1.011-publish.md) |
