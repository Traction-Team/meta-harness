---
title: Leftover factory requires edge cases from the PR #23 reviews
kind: follow-up
status: new
filed: 2026-11-15
reported-by: cold review of PR #23 (Plan 1.023), round 3, 15 Nov
source: "#23"
links: [docs/plans/1.023-factory-requires.md, docs/specs/sharing.md, docs/specs/factory-format.md]
---

# Small edge cases left after Plan 1.023

## What happened, or what is wanted

The last review of PR #23 (after the two fix rounds `build-plan` allows) left these open:

- **Spec gap (graded BLOCKER).** `createRequirements` in `src/core/requires/setup.ts` refuses a template whose real path is outside `.factory/` with the fix `Replace <template> with a file inside .factory/templates/`. `docs/specs/sharing.md` (Creating required files) says every file that cannot be created gets the fix `Copy <template> to <path>`. One sentence in the spec fixes it, for example: "A template that resolves outside `.factory/` is a warning with the fix `Replace <template> with a file inside .factory/templates/`; nothing is created."
- `check` offers "Move <clash> away" for a case-variant symbolic link or other non-directory entry at the path (`renameHelps` in `src/core/requires/check.ts`). Renaming it would make it `present`, so a rename fix is the better advice.
- `templateRefusal` in `src/core/requires/setup.ts` checks only containment. A template inside `.factory/` that is a directory gives `EISDIR` with the copy fix. A FIFO (possible through `update` from an unversioned directory source) makes `readFile` wait forever. Check that the template is a regular file before reading it.
- Rule 13 in `docs/specs/factory-format.md` says "a link that resolves to one inside `.factory/`". The code also refuses a regular file reached through a linked parent directory. The spec should say that the template's real path must be inside `.factory/`.
- `test/core/requires/setup.test.ts`: the directory-link test uses the `cannotCheckMode` guard. The sibling suites call the same Windows guard `cannotLink`.

## What we know

Each location is named above. The first item changes only the spec text. The others are small code changes, and none of them blocks a normal fab.
