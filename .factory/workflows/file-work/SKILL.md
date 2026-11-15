---
name: file-work
description: Records a bug, idea, spec gap, feedback or build follow-up so it is not lost. It writes an intake note in the intake directory, a sighting when the note already exists, or adds to a plan that is not yet building, and can write a short bug plan when the fix is clear. It records and links work; it does not prioritise it, does not edit the roadmap, and does not build it. Use it for bug reports, proposed work, spec questions, and every tooling problem or existing bug a build found, before its pull request merges.
---

# file-work

Record the work in the correct file. Do not assign a priority, do not edit the roadmap, and do not implement the work. `prioritise-roadmap` decides what happens to everything filed here.

Every path below is a setting in `docs/factory.md`: the intake directory is `intake`, the plans directory is `plans`, the roadmap is `roadmap`, and `features` and `specs` may be empty.

## 1. Understand the request

Record each of these details in one or two lines:

- What happened, or what change the person wants.
- Who raised it and where: a conversation, an issue, a pull request.
- What the person expected, and which spec section says so, when `specs` is set.

If one of these is missing, ask one question. Inspect only enough code or spec to identify the affected area.

Before you create a file, search the intake directory, the plans directory, the roadmap's open questions and, when `specs` is set, the specs. If an existing note, plan or open question covers the work, add only the new information to it and stop. If an existing intake note covers it, write a sighting instead.

## Sightings

Never edit an existing intake note to say its problem happened again. Branches that hit the same problem would all change the same lines and conflict when they merge. Write a new file beside the note instead: two branches never conflict over two different new files.

- **Path.** `<intake>/<note stem>/<id>.md`, where `<note stem>` is the note's file name without `.md`. For a build, `<id>` is `pr-<number>`, such as `<intake>/2026-11-02-new-worktree-has-no-database/pr-1791.md`. Otherwise it is `YYYY-MM-DD-<short-slug>` naming who saw it or where.
- **Content.** From `.factory/templates/intake-sighting.md`: the date, the source, what failed with the exact command or error, the workaround, and how often it happened in this pull request. A few lines.
- **If the file already exists**, this pull request already reported the problem. Update that file. Do not write a second one.
- **Do not edit the note itself**, even to correct it. Put the correction in the sighting. Whoever takes the note into a plan folds its sightings in with it.

## 2. Select a location

| Work | Location |
|---|---|
| A bug | An intake note from `.factory/templates/intake.md`, `kind: bug` |
| A tooling problem a build ran into: a check, test, script, setup step or CI job that failed or needed a workaround for a reason other than the code being built | An intake note with `kind: tooling` and `source:` set to the pull request. Say what failed, the exact command or error, the workaround used, and how often |
| An existing bug a build found outside its own work, which a user or operator can hit | An intake note with `kind: bug` and `source:` set to the pull request |
| A gap, contradiction or open question in a spec, when `specs` is set | An intake note with `kind: spec`, naming the spec file and section |
| An idea, or a capability outside the current scope | An intake note with `kind: idea` |
| Feedback from someone using the result | An intake note with `kind: feedback`, with `source:` set to where it came from |
| Something a build left undone in its own work | Not intake. With `features` set, an unchecked `- [ ]` line under *Follow-ups, not yet planned* in the feature doc, naming the pull request and checked off when it becomes a plan or is dropped. Otherwise it stays in the pull request's *Not done here* list, unless the developer asks for it |
| An addition to planned work | If a plan that is still `draft` or `ready` can carry it in the same pull request, add it to that plan. Otherwise an intake note that links the plan |

Name an intake note `<intake>/YYYY-MM-DD-<slug>.md` with today's date, and set `status: new`. Keep it short.

**A bug plan.** If a bug's fix is already clear, also write a bug plan from `.factory/templates/plan-bug.md`, and add it to the note's `links:`.

- With `plan-names: numbered`, the file is `<plans>/<round>.<NNN>-fix-<slug>.md`, numbering on from the highest plan in the round that the roadmap shows.
- With `plan-names: dated`, it is `<plans>/YYYY-MM-DD-fix-<slug>.md`.
- When the bug belongs to a feature in flight (`features` is set), give it the feature's next code, one past the highest in `node .factory/scripts/feature.mjs <CODE>`. Name it `<plans>/YYYY-MM-DD-<code>-<n>-fix-<slug>.md`, put the code in its title and in `code:`, and run `node .factory/scripts/feature.mjs <CODE> --write`.

Set `owns` to the paths the fix will probably change. The builder can widen it later. The bug plan makes the fix pullable straight away: `start-plan` can open it by name.

## 3. Check and report

Run `node .factory/scripts/check.mjs`. Fix each reported problem in the files you changed.

Commit the files only in these cases:

- `build-plan` or `finish-plan` called this workflow. Include the files in that plan's pull request.
- The person asks you to commit, save or publish them. Follow "Publishing docs changes" in `AGENTS.md`.

Otherwise, leave the files unstaged and say so. A bug plan can ride in the same pull request as its fix.

Report the location you selected, the files you changed, and the next action. For urgent work, the next action is `start-plan` with "pull it now", which can take a bug plan straight to a build. Other work waits for the next `prioritise-roadmap` conversation.
