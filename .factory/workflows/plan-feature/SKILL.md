---
name: plan-feature
description: Creates plans in docs/plans/ for a roadmap line, a spec section, or a large bug. One plan is one pull request, so work that needs several pull requests gets several plans, linked by needs. Each plan defines its pull request title, dependencies, owned paths, and proof, and links the spec sections it implements. Use it for "plan <thing>", splitting work into pull requests, or a roadmap line that has no plan.
---

# plan-feature

A plan explains how to build one pull request. When the work needs more than one pull request, write one plan for each and link them with `needs`. The what and why live in `docs/specs/`; each plan holds only how its own pull request gets built. A person must approve the plans in this conversation before anyone builds them.

Use `.factory/templates/plan.md`. See `docs/plans/04-build.md` for an example of the depth expected.

## 1. Read the context

- Read the roadmap line, intake note, or request that the work serves.
- Read every spec section the work touches, in `docs/specs/`. The plan must implement them, not reinterpret them.
- Read the plans the new work depends on or extends, and the code they produced. Use the real module, function and type names. Do not guess names.
- Read the rules in `AGENTS.md`.

Ask the person only questions whose answers affect the design. Record each answer under **Decisions** in the plan it affects. A question the spec should answer is a spec change: propose the wording, and edit the spec in the same docs change once they agree.

## 2. Divide the work into pull requests

Agree the list with the person in one message: one line per plan, with its title and what it needs.

- Each pull request is one a reviewer can assess in one sitting, and each leaves `main` green (`npm run verify` passes).
- Order by dependency: shared model and utilities first, core logic next, command wiring and output last.
- Use `needs` only for a real dependency. A plan whose need has not merged is built stacked on that plan's branch.
- A small change is one plan. If the work needs more than six, plan the first few now.

## 3. Write each plan

Create `docs/plans/NN-<slug>.md` for each plan, numbering on from the highest existing plan. Name the slug for what the plan makes true. Copy the frontmatter from the template. Keep `status: draft` while you write.

- `title` is the pull request title: `<type>: <what becomes true>`, lowercase, no scope.
- `owns` lists the paths the pull request can change. Keep it narrow so independent plans can run in parallel. Use globs for directories.
- `proves` gives a command whose output proves the pull request works.
- `needs` lists the plans that must merge first, as repo paths.

For the body, follow the template: the specs it implements, design, steps as checkboxes, tests, done-when, and open questions.

## 4. Check and report

Add each plan to `docs/roadmap.md` as a checkbox line linking the plan, in the right milestone and order. If a line said "needs a plan", replace it. If a line linked an intake note, move the note's content into the plan and delete the note. Add each open question that blocks a plan to the roadmap's **Open questions** table.

Run `node .factory/scripts/check.mjs`. After the person approves the plans, set each to `status: ready`. Publish them, following "Publishing docs changes" in `AGENTS.md`, unless the person says otherwise.
