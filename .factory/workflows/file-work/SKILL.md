---
name: file-work
description: Records a bug, idea, spec gap, or build follow-up so it is not lost. It writes an intake note in docs/intake/, or adds to a plan that is not yet building, and can write a short bug plan when the fix is clear. It records and links work; it does not prioritise it, does not edit docs/roadmap.md, and does not build it. Use it for bug reports, proposed work, spec questions, and every "found while building" note before a pull request merges.
---

# file-work

Record the work in the correct file. Do not assign a priority, do not edit `docs/roadmap.md`, and do not implement the work. `prioritise-roadmap` decides what happens to everything filed here.

## 1. Understand the request

Record each of these details in one or two lines:

- What happened, or what change the person wants.
- Who raised it and where: a conversation, an issue, a pull request.
- What the person expected, and which spec section says so, if one does.

If one of these details is missing, ask one question. Inspect only enough code or spec to identify the affected area.

Before you create a file, search `docs/intake/`, `docs/plans/`, and the open questions in `docs/roadmap.md` and `docs/specs/`. If an existing note, plan or open question covers the work, add only the new information to it and stop.

## 2. Select a location

| Work | Location |
|---|---|
| A bug | An intake note from `.factory/templates/intake.md`, `kind: bug` |
| A follow-up found while building a plan | An intake note with `kind: follow-up` and `source:` set to the pull request |
| A gap, contradiction or open question in a spec | An intake note with `kind: spec`, naming the spec file and section |
| An idea, or a capability outside v1 | An intake note with `kind: idea`. Say which deferred feature in `docs/specs/README.md` it relates to, if any |
| An addition to planned work | If a plan that is still `draft` or `ready` can carry it in the same pull request, add it to that plan. Otherwise an intake note that links the plan |

Name an intake note `docs/intake/YYYY-MM-DD-<slug>.md` with today's date, and set `status: new`. Keep it short.

If a bug's fix is already clear, also write a bug plan from `.factory/templates/plan-bug.md` as the next numbered plan, `docs/plans/NN-fix-<slug>.md`, and add it to the note's `links:`. Set `owns` to the paths the fix will probably change. The builder can widen it later.

## 3. Check and report

Run `node .factory/scripts/check.mjs`. Fix each reported problem in the files you changed.

Commit the files only in these cases:

- `build-plan` or `finish-plan` called this workflow. Include the files in that plan's pull request.
- The person asks you to commit, save or publish them. Follow "Publishing docs changes" in `AGENTS.md`.

Otherwise, leave the files unstaged and say so.

Report the location you selected, the files you changed, and the next action. For urgent work, the next action is `start-plan` with "pull it now", which can take a bug plan straight to a build. Other work waits for the next `prioritise-roadmap` conversation.
