---
name: prioritise-roadmap
description: A short conversation with the person running it about what to work on next. It briefs them on where the roadmap stands, what landed, which open questions block the next plans, and what is waiting in intake, agrees changes with them, and writes the roadmap. It decides every intake note and open question it raises. It is the only workflow that adds roadmap lines or changes their order. Use it for "what's next", re-prioritising, or reviewing intake and open questions.
---

# prioritise-roadmap

The roadmap answers one question for anyone who opens it: what is built, what is next, and what is undecided? It lists every plan in build order with a checkbox, grouped by section, followed by the open questions and the decisions taken.

The changes come out of a conversation with the person running this workflow. They decide. Your job is to brief them well, ask good questions, and write it down. Do not propose a ranking of everything, and do not ask them to approve a long order.

The roadmap is the `roadmap` setting in `docs/factory.md`, and the other paths are settings too: `plans`, `intake`, `changelog`.

## 1. Prepare, before you say anything

Do this quietly. Run independent commands in parallel.

- Read the roadmap. Note its `updated:` date.
- `node .factory/scripts/next.mjs --ref origin/<trunk> --json`: what is ready, blocked and in flight.
- Read the changelog entries dated after `updated:`.
- Read every intake note with `status: new`. Skip `status: parked` notes unless the person asks for them or a note's `revisit:` date has passed.
- Read the **Open questions** table in the roadmap. Note which ones block a plan that is ready or nearly ready.

## 2. Brief the person, then ask

Give a brief that fits on one screen:

1. **Progress.** Ticked lines since the last update, what is in flight (with pull requests), and what is ready next.
2. **What landed**, from the changelog. One line each.
3. **Open questions that block the next plans.** One line each, with the proposal from the table.
4. **What is new in intake.** One line per note: kind, title, who raised it, and how many sightings it has.

Then ask what they want to decide. Let them lead. Answer their questions from the files. Give your own recommendation only when they ask or are unsure, with a reason they can disagree with.

## 3. Agree the changes

- **Order.** Move lines only when the person asks. A line's position is its build priority within its section; `needs` in the plans still decides what can start.
- **New lines.** Work that needs a plan becomes a line `- [ ] **<name>** — needs a plan · <why>`. `plan-feature` replaces it with plan links.
- **Open questions.** For each one the person answers: move it to **Decisions** with today's date and the answer, and update the plan or spec it affects in the same change, or note that the plan's builder will.
- **Intake notes.** Decide every note you raised, in one batch, with your suggestion for each:
  - **Into a plan:** add it to a plan that is still `draft` or `ready` if it fits that plan's pull request, then delete the note and its sightings folder.
  - **On the roadmap:** a new line that links the note until a plan replaces it.
  - **Spec change** (when `specs` is set): edit the spec now, and delete the note and its sightings folder.
  - **Park:** `status: parked`, a `revisit:` date, and a one-line reason in the note.
  - **Drop:** delete the note and its sightings folder. Give the reason in the commit message.
- **Sightings.** When a note goes into a plan, fold its sightings folder's files into the plan and delete the folder. A note is never edited to record another sighting; see `file-work`.

## 4. Write and check

Update the roadmap. Set `updated:` to today's date. Show the person what changed, and change it until they are happy.

When `roadmap-max-lines` is set, the roadmap holds no more open lines than that number, and `check.mjs` fails past it. If the person adds more, say which lines wait and agree what to drop or merge before you write.

Run `node .factory/scripts/check.mjs`. Then publish it, following "Publishing docs changes" in `AGENTS.md`, unless the person says otherwise.
