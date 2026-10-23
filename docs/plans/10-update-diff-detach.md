---
title: "feat: metafab update, diff and detach"
status: ready
kind: feature
pr:
needs:
  - docs/plans/09-import.md
owns:
  - src/core/merge.ts
  - src/core/update/**
  - src/commands/update.ts
  - src/commands/diff.ts
  - src/commands/detach.ts
  - test/core/merge/**
  - test/core/update/**
proves: "npx vitest run test/core/merge test/core/update → one passing test per merge-table row; the end-to-end Git fab update produces the expected markers and summary"
---

# Plan 10: `metafab update`, `diff`, and `detach`

Merge newer upstream versions with local edits, show local edits, and remove the upstream link.

## Specs

- [Sharing: Updating a fab](../specs/sharing.md#updating-a-fab)
- [Sharing: Merge rules](../specs/sharing.md#merge-rules)
- [Sharing: Updating from an unversioned source](../specs/sharing.md#updating-from-an-unversioned-source)
- [Sharing: Comparing local edits](../specs/sharing.md#comparing-local-edits)
- [Sharing: Detaching from an upstream](../specs/sharing.md#detaching-from-an-upstream)

## Design

### `update [--to <version|range|ref>] [--dry-run] [--no-build]`

Preconditions (exit 1 with a fix when they fail):

- `upstream` exists.
- No conflict markers or `.upstream` files under `.factory/` (reuse the [Plan 05](05-check.md) scanners).
- `--to` is not used with an unversioned source.

Versioned flow:

1. Select the new version: `--to`, else the recorded `requested` range (npm and Git ranges), else the branch head for a branch ref. A pinned tag or commit without `--to` reports `Pinned to <ref>. Use --to.` and exits 0.
2. If it equals the recorded version or commit, print `Already up to date.` and exit 0.
3. Fetch base (recorded version or commit) and theirs. A base that cannot be fetched sets `baseUnavailable`.
4. Merge every path in base ∪ yours ∪ theirs, excluding `metafab.yaml` (and `README.md` at the `.factory/` root).
5. Unless `--dry-run`: write merged files, `.upstream` files, and removals; then `setUpstream` with the new version, also when conflicts exist.
6. Build when there are no conflicts and neither `--no-build` nor `--dry-run` is set.
7. Print the review summary with preserved local edits, conflicts, upstream removals of changed files, and upstream changes to removed files. Warn when the npm version is deprecated.
8. Exit 1 when conflicts exist.

### Merge engine (`core/merge.ts`)

```ts
mergePath(base?: Buffer, yours?: Buffer, theirs?: Buffer, labels): MergeResult
type MergeResult =
  | { action: "keep" | "take-theirs" | "remove" | "add" }
  | { action: "write"; content: Buffer }                 // clean line merge
  | { action: "conflict"; content: Buffer }              // with markers
  | { action: "side-file"; upstream: Buffer }            // keep yours, write <file>.upstream
  | { action: "keep"; note: "upstream-removed" | "upstream-changed-removed" }
```

- Implements the twelve rows of the [merge table](../specs/sharing.md#merge-rules) as a decision table with one test per row.
- "Changed" compares with CRLF treated as LF.
- Text line merge uses `node-diff3` (`diff3Merge`). Conflict markers:

  ```text
  <<<<<<< yours
  ...
  ||||||| base <version>
  ...
  =======
  ...
  >>>>>>> upstream <version>
  ```

- Binary conflict: keep yours, write `<file>.upstream`.
- `baseUnavailable`: every path where yours and theirs differ is a conflict (text gets markers without a base section; binary gets a side file).
- Mode bits follow the side whose content wins; an executable-bit change alone counts as a change.

### Unversioned flow

1. Fetch the current source.
2. Copy every source file over the local file. Keep local-only files.
3. Build unless `--no-build`.
4. Print the summary, with a line that says replaced local edits can be restored from Git.

`--dry-run` lists the files that would be replaced.

### `diff [<path>]`

- Versioned: fetch the recorded base. Unversioned: fetch the current source.
- Compare with `.factory/` (excluding `metafab.yaml` and `.factory/README.md`), optionally limited to a path prefix.
- Human output: unified diffs (`diff` package `createTwoFilesPatch`) with `a/upstream` and `b/local` labels. Binary files print one line.
- JSON: `{ files: [{ path, status, patch? }] }`.
- Exit 0 whether or not differences exist.

### `detach`

`removeUpstream()`. No upstream → print `No upstream to detach.` and exit 0. Factory files do not change.

## Steps

- [ ] Merge decision table and `mergePath`
- [ ] Conflict marker rendering and side files
- [ ] Version selection for `update` (all ref forms and `--to`)
- [ ] Versioned update flow with `--dry-run` and `--no-build`
- [ ] Unversioned update flow
- [ ] `diff`
- [ ] `detach`

## Tests

- One test per merge-table row, plus binary conflict, CRLF-only change, base unavailable
- End-to-end with a local Git fab: publish v1, import, edit locally, publish v2 with overlapping and non-overlapping changes, update; verify markers, summary, recorded commit, no build on conflict
- `update` refuses while a marker or `.upstream` file remains, and succeeds after resolution
- `--dry-run` writes nothing and reports the same plan
- Deprecated npm version prints a warning
- `diff` on an unmodified import prints nothing; after an edit prints the patch
- `detach` preserves comments and other keys

## Open questions

1. Should frontmatter be merged field by field instead of line by line? (Carried from the [spec](../specs/sharing.md#open-questions).) Proposal: line merge in v1; revisit with real conflicts.
