---
updated: 2026-11-12
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
- [ ] [1.020 CLI fixes](plans/1.020-cli-fixes.md): discovery stays in the Git repository and refuses Droid's `.factory/`, `<command> --help`, one prompt reader per run, `DT_UNKNOWN` walkers, hook warnings and hook lines
- [ ] [1.021 Source hardening](plans/1.021-source-hardening.md): `git+file://` sources, safe cache and mirror swaps, cache write errors exit 3, npm size checked before download
- [ ] [1.023 Factory requirements](plans/1.023-factory-requires.md): `requires:` in `factory.yaml`; `import` and `update` offer to create missing repository files from templates, `check` warns
- [ ] [1.022 Verification](plans/1.022-verification.md): agent tools, Windows, git hooks under Git for Windows, the CI recipe against `mark4-like`, the error message and `--json` contract, recorded in `docs/verification.md`
- [ ] [1.024 First fab](plans/1.024-first-fab.md): the Dragonfly factory generalised as `@seasb/fab-orca`, and this repository imports it
- [ ] [1.012 Release v1](plans/1.012-release.md): package `README.md`, release workflow with provenance, `@seasb/metafab@1.0.0`
- [ ] [1.025 Git hooks on here](plans/1.025-git-hooks-on.md): `@seasb/metafab` as a devDependency and `git-hooks: true` in this repository, once 1.0.0 is on npm

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

## Open questions

Answer these before or during the named plan. Spec-level questions are linked to their source.

| Question | Blocks | Proposal |
| --- | --- | --- |
| Field-level frontmatter merge | [1.010](plans/1.010-update-diff-detach.md#open-questions), [spec](specs/sharing.md#open-questions) | Line merge in v1 |
| Duplicate skills in Cursor and Copilot | [1.022](plans/1.022-verification.md), [spec](specs/README.md#open-questions) | Test during verification |
| Multiple upstream fabs; pipeline branches; trusted publishers; fleet updates | After v1 | Deferred |

## Decisions

Record answered questions here with the date and the commit that applied them.

| Date | Decision | Applied in |
| --- | --- | --- |
| 2026-11-12 | Split 1.012 into 1.020 to 1.024 and the npm release. The first fab generalises the Dragonfly factory as `@seasb/fab-orca` instead of porting Mark IV, and this repository imports it | [1.012](plans/1.012-release.md), [1.024](plans/1.024-first-fab.md) |
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
