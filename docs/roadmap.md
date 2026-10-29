---
updated: 2026-10-29
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
- [ ] [1.006 Init and adoption](plans/1.006-init-and-adoption.md): `init`, `.gitattributes`, moving existing skills into `.factory/`
- [x] [1.007 Authoring and inspection](plans/1.007-authoring-commands.md): `create`, `pipeline add/remove`, `map`
- [ ] [1.013 Factory edge cases](plans/1.013-factory-edge-cases.md): `factory.yaml` aliases, reserved containers, `create` and `map` fixes

## Milestone 2: Sharing

A team can publish a factory as a fab and other teams can import and update it.

- [x] [1.008 Sources and fetching](plans/1.008-sources.md): source parsing, npm/Git/HTTPS/path fetch, cache, fab validation
- [ ] [1.009 Import and review summary](plans/1.009-import.md): `import`, risk-ordered summary
- [ ] [1.010 Update, diff, detach](plans/1.010-update-diff-detach.md): three-way merge, unversioned overwrite, `diff`, `detach`
- [ ] [1.011 Publish](plans/1.011-publish.md): staging, npm target, Git fab repository target

## Milestone 3: Release

- [ ] [1.012 Release v1](plans/1.012-release.md): hardening, agent tool verification, first fab, `@seasb/metafab@1.0.0`

## Order and parallel work

```text
1.001 ─┬─ 1.002 ─┬─ 1.004 ── 1.005 ── 1.006 ──┐
       │         ├─ 1.007                     ├─ 1.009 ── 1.010
       │         ├─ 1.013                     │
       └─ 1.003 ─┴─ 1.008 ────────────────────┘
                    1.005 + 1.008 ── 1.011
all ── 1.012
```

1.002 and 1.003 can run in parallel. 1.007 can run in parallel with 1.004 to 1.006. 1.013 needs nothing unmerged and can run beside 1.005 and 1.006. 1.008 can start once 1.002 and 1.003 are done.

## Open questions

Answer these before or during the named plan. Spec-level questions are linked to their source.

| Question | Blocks | Proposal |
| --- | --- | --- |
| Summary group for templates and other files | [1.009](plans/1.009-import.md#open-questions) | Add an **Other** group |
| Field-level frontmatter merge | [1.010](plans/1.010-update-diff-detach.md#open-questions), [spec](specs/sharing.md#open-questions) | Line merge in v1 |
| Publish partial failure and recovery | [1.011](plans/1.011-publish.md#open-questions), [spec](specs/README.md#open-questions) | Git first, then npm; re-run skips identical published targets |
| Duplicate skills in Cursor and Copilot | [1.012](plans/1.012-release.md), [spec](specs/README.md#open-questions) | Test during release |
| Multiple upstream fabs; pipeline branches; trusted publishers; fleet updates | After v1 | Deferred |

## Decisions

Record answered questions here with the date and the commit that applied them.

| Date | Decision | Applied in |
| --- | --- | --- |
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
