---
name: plan-feature
description: Creates plans in docs/plans/ for a roadmap line, a spec section, or a large bug. One plan is one pull request, so work that needs several pull requests gets several plans, linked by needs. Each plan defines its pull request title, dependencies, owned paths, and proof, and links the spec sections it implements. It probes for unscoped work, edge cases and failure paths and raises them with the person, and always runs a review-plan cold review in a fresh sub-agent before asking for approval. Use it for "plan <thing>", splitting work into pull requests, or a roadmap line that has no plan.
---

# plan-feature

A plan explains how to build one pull request. When the work needs more than one pull request, write one plan for each and link them with `needs`. The what and why live in `docs/specs/`; each plan holds only how its own pull request gets built. A person must approve the plans in this conversation before anyone builds them.

The run is always: read → poke holes with the person → divide → write → **cold review sub-agent (`review-plan`)** → handle findings → approval. The goal is a plan a builder can follow without guessing.

Use `.factory/templates/plan.md`. See `docs/plans/1.004-build.md` for an example of the depth expected.

## 1. Read the context

- Read the roadmap line, intake note, or request that the work serves.
- Read every spec section the work touches, in `docs/specs/`. The plan must implement them, not reinterpret them.
- Read the plans the new work depends on or extends, and the code they produced. Use the real module, function and type names. Do not guess names.
- Read the rules in `AGENTS.md`.

Ask the person only questions whose answers affect the design. Record each answer under **Decisions** in the plan it affects. A question the spec should answer is a spec change: propose the wording, and edit the spec in the same docs change once they agree.

## 1a. Poke holes before you design

A plan is only as good as the questions asked before it was written. Before you divide the work, think it through as the builder and as the person who will hit its bugs:

- **Unscoped work.** Which spec requirement has no obvious home yet? What does the spec not say that the code will still have to decide?
- **Edge cases.** Empty, missing, duplicate, invalid, very large, CRLF, non-ASCII and Windows inputs. A second run, an interrupted run, a run after the user edited generated output. No terminal, no network, no Git.
- **Failure.** For each way it can fail: what the user sees, which exit code, and whether the repository is left unchanged.
- **Interactions.** Existing callers of what changes, other unmerged plans with overlapping `owns`, and assumptions about files, order or installed tools.

Answer what the specs and code answer. Raise the rest with the person, grouped in one message, a few at a time, most important first. For each, give the case, why it matters, and your proposed answer, so they can reply "yes" or correct you. Do not decide user-visible behaviour silently. Do not pad the list: a question whose answer would not change the plan is not worth their time. Keep going until the person and you agree nothing important is left to guess.

## 2. Divide the work into pull requests

Agree the list with the person in one message: one line per plan, with its title and what it needs.

- Each pull request is one a reviewer can assess in one sitting, and each leaves `main` green (`npm run verify` passes).
- Order by dependency: shared model and utilities first, core logic next, command wiring and output last.
- Use `needs` only for a real dependency. A plan whose need has not merged is built stacked on that plan's branch.
- A small change is one plan. If the work needs more than six, plan the first few now.

## 3. Write each plan

Create `docs/plans/<round>.<NNN>-<slug>.md` for each plan, such as `1.014-publish-dry-run.md`. `<round>` is the planning round, which matches the major version the plans build towards (v1 plans are `1.xxx`); `<NNN>` is three digits, numbering on from the highest plan in that round. The first plan of a new round is `<round>.001`. Refer to a plan by its number, as in "Plan 1.014". Name the slug for what the plan makes true. Copy the frontmatter from the template. Keep `status: draft` while you write.

- `title` is the pull request title: `<type>: <what becomes true>`, lowercase, no scope.
- `owns` lists the paths the pull request can change. Keep it narrow so independent plans can run in parallel. Use globs for directories.
- `proves` gives a command whose output proves the pull request works.
- `needs` lists the plans that must merge first, as repo paths.

For the body, follow the template: the specs it implements, design, steps as checkboxes, tests, done-when, and open questions. The design names the behaviour for every edge case and failure agreed in step 1a, and the tests cover them.

## 4. Run the cold plan review in a sub-agent

The review is not optional. Do not ask the person to approve the plans until a `review-plan` sub-agent has returned a verdict on them.

Start one **new** `agent-coding` sub-agent (`subagent_type: "agent-coding"`, `run_in_background: false`); in Amp, a new Task sub-agent. Do not review the plans yourself. Give it only this prompt:

```text
Load the review-plan workflow and follow it. Return its report as your final message.

Plans: <the plan files, as repo paths>.
Serves: <the roadmap line, intake note or request>.
Specs: <the spec files and sections the plans link>.
```

If the sub-agent cannot load skills, replace the first line with the body of `.factory/workflows/review-plan/SKILL.md` (without its frontmatter). Do not give the reviewer the conversation, your reasoning, or the person's answers: the plans must stand on their own, because the builder gets nothing more.

If the report does not end with a `VERDICT:` line, start a new reviewer once more. If that also fails, tell the person the cold review did not complete and go on to step 5.

## 5. Handle the review

1. **Triage.** Read each finding against the plan and spec it names. Accept it if a builder would really have to guess. Decline it if the plan or spec already answers it, or it is out of scope; keep a one-line reason.
2. **Fix what you can.** Where the specs, the code or an earlier decision gives the answer, change the plan yourself.
3. **Ask about the rest.** Where the answer is a choice the person should make, raise it with them as in step 1a: the finding, why it matters, your proposal. Record each answer under **Decisions**, or as a spec change. A question nobody can answer yet goes under **Open questions** with a proposal, and onto the roadmap if it blocks the plan.
4. **Re-review.** If you accepted any BLOCKER, start another **new** `review-plan` sub-agent on the changed plans. At most two re-reviews; then list what is unresolved for the person.
5. **Report.** When you ask for approval, give the final verdict, what you changed, what the person decided, and each declined finding with its reason.

## 6. Check and report

Add each plan to `docs/roadmap.md` as a checkbox line linking the plan, in the right milestone and order. If a line said "needs a plan", replace it. If a line linked an intake note, move the note's content into the plan and delete the note. Add each open question that blocks a plan to the roadmap's **Open questions** table.

Run `node .factory/scripts/check.mjs`. After the person approves the plans, set each to `status: ready`. Publish them, following "Publishing docs changes" in `AGENTS.md`, unless the person says otherwise.
