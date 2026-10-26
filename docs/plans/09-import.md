---
title: "feat: metafab import copies a fab with a review summary"
status: ready
kind: feature
pr:
needs:
  - docs/plans/06-init-and-adoption.md
  - docs/plans/08-sources.md
owns:
  - src/core/import/**
  - src/core/summary.ts
  - src/commands/import.ts
  - test/core/import/**
  - test/core/summary/**
proves: "npx vitest run test/core/import test/core/summary → import from a local path, Git and Verdaccio works end to end; the summary snapshot matches the spec example"
---

# Plan 09: `metafab import` and the review summary

Copy a fab into `.factory/`, record its upstream, build it, and print a risk-ordered review summary. The review summary module is shared with `update` ([Plan 10](10-update-diff-detach.md)).

## Specs

- [Sharing: Importing a fab](../specs/sharing.md#importing-a-fab)
- [Sharing: Review summary](../specs/sharing.md#review-summary)
- [Sharing: Safety model](../specs/sharing.md#safety-model)
- [CLI: Share a factory](../specs/cli.md#share-a-factory)

## Design

### `import <source> [--agents <list>] [--force]`

Preflight (no writes; any failure leaves the repository unchanged):

1. Resolve the root with `resolveNewFactoryRoot`. If `metafab.yaml` already has `upstream`, stop: `This factory already has an upstream. Use metafab update or metafab detach.`
2. Resolve and fetch the source ([Plan 08](08-sources.md)). Exit 3 or 4 on failure.
3. Select targets as `init` does.
4. Plan adoption against the selected destinations, passing the incoming fab so overlapping names follow the conflict rule.
5. Compute file conflicts: every incoming path whose local file exists (in `.factory/` or as an adopted skill) with different content (EOL-insensitive). Without `--force`, list all of them and stop.
6. Collect adoption consent (terminal, or exit 2).

Apply:

7. If the repository has no factory: create `.factory/metafab.yaml` with `agents` and add `.gitattributes` lines. Do not create `factory.yaml` or `AGENTS.md`.
8. Apply adoption.
9. Copy the fab's `.factory/` into the local `.factory/`, keeping modes.
10. `setUpstream`.
11. Run `build`.
12. Print the review summary, comparing the factory before step 8 with after step 10.

### Review summary (`core/summary.ts`)

```ts
summarise(before: FileTree, after: FileTree, ctx: { title: string; preserved?: string[]; conflicts?: string[]; notes?: string[] }): Summary
renderSummary(summary): string        // human text
```

Classification, in the spec's order:

1. **Runs code on your machines**: anything under `scripts/`, any file with an executable bit, and any non-Markdown file in a skill directory
2. **Changes every agent session**: `AGENTS.md`, `factory.yaml`
3. **Workflows**: grouped per workflow directory; a new workflow shows its title
4. **Skills**: other skill directories
5. **Local edits preserved** (update only)
6. **Conflicts** (update only)

Other files (templates) go in a final **Other** group. See open question 1.

Per entry: status (`A`, `M`, `D`, `C`), path, `+n -m` line counts for text, `new, executable` for new executables. Annotations:

- `factory.yaml`: describe pipeline changes in words (`pipeline: finish-slice added after review-slice`, `removed`, `moved`, `stop changed`)
- `SKILL.md`: `allowed-tools changed` when that frontmatter field differs

Footer: `Nothing was committed. Review the changes with git diff.` JSON returns the same groups as structured data.

## Steps

- [ ] `FileTree` snapshot helper (path → hash, mode, text or binary)
- [ ] Line diff counts (`diff` package)
- [ ] Pipeline change describer
- [ ] Summary classifier and renderer, with a snapshot test that reproduces the spec example
- [ ] `import` preflight and apply
- [ ] End-to-end tests against a local path, a local Git repository, and Verdaccio

## Tests

- Import into an empty repository creates `metafab.yaml`, `.gitattributes`, the copied factory, the upstream entry, and installed skills, and creates no `factory.yaml` placeholder when the fab has none
- Import never copies a source `metafab.yaml` or `.factory/README.md`
- A differing local file stops import and lists it; `--force` replaces it
- An existing upstream stops import
- A failing fetch or invalid fab leaves `git status` clean
- Adopted skills that overlap the fab follow the conflict rule
- Summary snapshot matches the spec example

## Open questions

1. The spec's summary order has no group for templates and other non-skill files. Proposal: add an **Other** group after Skills.
2. Exit code for file conflicts without `--force`. Proposal: 5 (the command would overwrite files Metafab does not own).
3. Git sources run with `GIT_TERMINAL_PROMPT=0` unless `resolve`/`fetchFab` get `interactive: true`, and nothing passes it yet, so an SSH key with a passphrase fails even in a terminal. Proposal: `import` passes `interactive` when stdin is a TTY and `--yes` is absent. (Found while building Plan 08, #6.)
