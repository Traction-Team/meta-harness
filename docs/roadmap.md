---
updated: 2026-10-23
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

- [ ] [01 Project foundation](plans/01-foundation.md): package, command runner, JSON output, exit codes, factory discovery
- [ ] [02 Factory model and validation](plans/02-factory-model.md): load `.factory/`, YAML and frontmatter grammar, validation rules
- [ ] [03 Configuration](plans/03-configuration.md): `metafab.yaml` loading, validation, comment-preserving writes
- [ ] [04 Build](plans/04-build.md): compiled skills, ownership, `AGENTS.md` / `CLAUDE.md` / `.gitignore` blocks, built-in skill
- [ ] [05 Check](plans/05-check.md): source, config, and installed-output validation
- [ ] [06 Init and adoption](plans/06-init-and-adoption.md): `init`, `.gitattributes`, moving existing skills into `.factory/`
- [ ] [07 Authoring and inspection](plans/07-authoring-commands.md): `create`, `rename`, `pipeline add/remove`, `map`

## Milestone 2: Sharing

A team can publish a factory as a fab and other teams can import and update it.

- [ ] [08 Sources and fetching](plans/08-sources.md): source parsing, npm/Git/HTTPS/path fetch, cache, fab validation
- [ ] [09 Import and review summary](plans/09-import.md): `import`, risk-ordered summary
- [ ] [10 Update, diff, detach](plans/10-update-diff-detach.md): three-way merge, unversioned overwrite, `diff`, `detach`
- [ ] [11 Publish](plans/11-publish.md): staging, npm target, Git fab repository target

## Milestone 3: Release

- [ ] [12 Release v1](plans/12-release.md): hardening, agent tool verification, first fab, `@seasb/metafab@1.0.0`

## Order and parallel work

```text
01 ─┬─ 02 ─┬─ 04 ── 05 ── 06 ──┐
    │      ├─ 07               ├─ 09 ── 10
    └─ 03 ─┴─ 08 ──────────────┘
                 05 + 08 ── 11
all ── 12
```

02 and 03 can run in parallel. 07 can run in parallel with 04 to 06. 08 can start once 02 and 03 are done.

## Open questions

Answer these before or during the named plan. Spec-level questions are linked to their source.

| Question | Blocks | Proposal |
| --- | --- | --- |
| Enforce the stricter Agent Skills name rules (no leading/trailing/double hyphens, max 64)? | [02](plans/02-factory-model.md#open-questions) | Yes, update the spec |
| Reserve factory skill names that start with `metafab`? | [02](plans/02-factory-model.md#open-questions) | Yes, add to validation rules |
| Lowercase the first letter of `stop` text in `AGENTS.md`? | [04](plans/04-build.md#open-questions) | No, render verbatim; fix the spec example |
| How to handle symlinks inside a source skill? | [04](plans/04-build.md#open-questions) | Copy content if inside `.factory/`, else error |
| Non-interactive consent for skill adoption | [06](plans/06-init-and-adoption.md#open-questions) | Add `--adopt` to `init` and `import` |
| Exit code for adoption blockers and import file conflicts | [06](plans/06-init-and-adoption.md#open-questions), [09](plans/09-import.md#open-questions) | 5 |
| `requested` for npm sources without a range, and Git sources without tags | [08](plans/08-sources.md#open-questions) | `^<version>`; omit for untagged Git |
| `npm pack` vs direct tarball fetch | [08](plans/08-sources.md#open-questions) | `npm pack`, after a spike |
| Summary group for templates and other files | [09](plans/09-import.md#open-questions) | Add an **Other** group |
| Field-level frontmatter merge | [10](plans/10-update-diff-detach.md#open-questions), [spec](specs/sharing.md#open-questions) | Line merge in v1 |
| Publish partial failure and recovery | [11](plans/11-publish.md#open-questions), [spec](specs/README.md#open-questions) | Git first, then npm; re-run skips identical published targets |
| Duplicate skills in Cursor and Copilot | [12](plans/12-release.md), [spec](specs/README.md#open-questions) | Test during release |
| Multiple upstream fabs; pipeline branches; trusted publishers; fleet updates | After v1 | Deferred |

## Decisions

Record answered questions here with the date and the commit that applied them.

| Date | Decision | Applied in |
| --- | --- | --- |
| | | |
