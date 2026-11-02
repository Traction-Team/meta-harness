---
title: Update, diff and detach need small output and internal tidy-ups
kind: follow-up
status: new
filed: 2026-11-02
reported-by: build sub-agents and cold review (review-branch, rounds 2 and 3), PR #16, 2 Nov
source: https://github.com/Traction-Team/meta-harness/pull/16
links: [docs/plans/1.010-update-diff-detach.md, docs/specs/sharing.md, docs/specs/cli.md]
---

# Update, diff and detach polish after 1.010

## What happened, or what is wanted

Small follow-ups found while building PR #16. None loses data.

## What we know

- `update --to <new range> --dry-run --json` returns status `up-to-date` with no `requested`, so a JSON caller cannot see the range it would record (`src/core/update/run.ts:583`, `src/commands/update.ts:38`).
- The unversioned `--dry-run` builds its `after` tree as `{...before, ...theirs}`, so a case-only replacement keeps both spellings and the summary omits the `D` line the real run prints (`src/core/update/run.ts:762`).
- `metafab diff` with no differences prints a blank line: `src/output.ts` replaces an empty summary with `diff: ok` and has no silent-result mode.
- A clean merge or `take-theirs` writes text with LF, so a CRLF file is rewritten as LF (the comparison already ignores CRLF).
- A symbolic-link conflict is written as a `.upstream` text file holding the link target.
- Duplication: `src/core/update/clashes.ts` copies `ancestors`/`indexOf`/`differentSpelling` from `src/core/import/conflicts.ts`; `upstreamFor` (`src/core/update/run.ts:473`) re-implements `upstreamEntry` (`src/core/sources/git.ts:436`); `isBinary` in `src/util/text.ts` is unused while import and update classify with `textContent` from `src/core/build/skill.ts`.
