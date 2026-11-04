---
title: Init writes through dangling links, and some adoption link problems use build wording
kind: follow-up
status: new
filed: 2026-11-02
reported-by: cold review (review-branch, rounds 1 and 2), PR #14, 2 Nov
source: https://github.com/Traction-Team/meta-harness/pull/14
links: [docs/plans/1.014-adoption-polish.md, docs/specs/cli.md]
---

# Adoption and init link edges after 1.014

## What happened, or what is wanted

Edge cases the reviews of PR #14 found outside the plan's scope. Plan 1.014 closed them for `.factory/factory.yaml` only.

## What we know

- `src/core/init/run.ts:221` and `src/core/init/gitattributes.ts:53`: `.factory/AGENTS.md` or `.gitattributes` that is a dangling symlink is treated as missing, and `writeFile` follows it. `init` exits 0 and creates the link's target, which can be outside the repository (`.gitattributes -> ../outside-attrs`). Check with `lstat` and refuse, as 1.014 does for `factory.yaml`.
- `src/core/adopt.ts`: a link that leaves `.factory/` only through a symlinked directory inside it passes `treeProblems` (it does not resolve real paths for that check) and is then refused by `compileSkill` with build's wording, `points outside .factory/`, instead of `... after the move`. Still exit 5, nothing changes; only the wording differs (pinned by `test/core/adopt/adopt.test.ts`).
- Same wording gap for a link to a sibling skill being adopted in the same run (`../reference/notes.md`): `treeProblems` accepts it because it lands in `.factory/skills/reference/` after the move, and `compileSkill` refuses it from its current place with build's wording.
