---
name: plan-feature
description: Creates plans in the plans directory for a roadmap line, a spec section, or a large bug. One plan is one pull request, so work that needs several pull requests gets several plans, linked by needs; when features are on, they also get a feature code and a feature doc. Each plan defines its pull request title, dependencies, owned paths, and proof, and links the spec sections it implements. It probes for unscoped work, edge cases and failure paths and raises them with the person, and always runs a review-plan cold review in a fresh sub-agent before asking for approval. Use it for "plan <thing>", splitting work into pull requests, or a roadmap line that has no plan.
---

# plan-feature

A plan explains how to build one pull request. When the work needs more than one pull request, write one plan for each and link them with `needs`. When `features` is set, that work is also a **feature**: a short code, a feature doc in the features directory, and a number for each plan. The what and why live in the specs and the feature doc; each plan holds only how its own pull request gets built. A person must approve the plans in this conversation before anyone builds them.

The run is always: read → poke holes with the person → divide → write → **cold review sub-agent (`review-plan`)** → handle findings → approval.

Use `.factory/templates/plan.md`, and `.factory/templates/feature.md` for a feature doc. The plans already in `<plans>/` show the depth expected.

The paths are settings in `docs/factory.md`: `plans`, `plan-names`, `roadmap`, `features`, `specs`, `docs-changes`, plus the sub-agent names, `amp-model-coding` and `amp-model-review`.

## 1. Read the context

- Read the roadmap line, intake note, or request that the work serves.
- When `specs` is set, read every spec section the work touches. The plan must implement them, not reinterpret them.
- Read the plans the new work depends on or extends, and the code they produced. Use the real module, function and type names. Do not guess names.
- When `features` is set, read the feature doc of the feature this work belongs to, or extends.
- Read the rules in `AGENTS.md`.

Ask the person only questions whose answers affect the design. Record each answer under **Decisions** in the plan it affects, or in the feature doc when it shapes every plan. A question the spec should answer is a spec change: propose the wording, and edit the spec in the same docs change once they agree.

## 1a. Poke holes before you design

A plan is only as good as the questions asked before it was written. Before you divide the work, think it through as the builder and as the person who will hit its bugs:

- **Unscoped work.** Which requirement has no obvious home yet? What does the spec not say that the code will still have to decide?
- **Edge cases.** Empty, missing, duplicate, invalid, very large, CRLF, non-ASCII and Windows inputs. A second run, an interrupted run, a run after the user edited generated output. No terminal, no network, no Git.
- **Failure.** For each way it can fail: what the user sees, which exit code, and whether the repository is left unchanged.
- **Interactions.** Existing callers of what changes, other unmerged plans with overlapping `owns`, and assumptions about files, order or installed tools.

Answer what the specs and code answer. Raise the rest with the person, grouped in one message, a few at a time, most important first. For each, give the case, why it matters, and your proposed answer, so they can reply "yes" or correct you. Do not decide user-visible behaviour silently. Do not pad the list: a question whose answer would not change the plan is not worth their time. Keep going until the person and you agree nothing important is left to guess.

## 2. Divide the work into pull requests

Agree the list with the person in one message: one line per plan, with its title, its code when there is one, and what it needs.

- Each pull request is one a reviewer can assess in one sitting, and each leaves `trunk` green (`verify` passes).
- Order by dependency: shared types and utilities first, core logic next, command wiring and output last.
- Use `needs` only for a real dependency. With `stacking` on, a plan whose need has not merged is built on that plan's branch; with `stacking` off, it waits for the need to merge.
- A small change is one plan. If the work needs more than six, plan the first few now.

**When `features` is set**, the work that needs more than one plan also gets a code:

- Propose 2 to 5 capitals that read as the feature (`ONB`, `DISC`). `node .factory/scripts/feature.mjs` lists the codes in use, and a code is never reused. When the work extends a feature that already has a doc, use its code and continue its numbering: the next number is one past the highest in `node .factory/scripts/feature.mjs <CODE>`, including dropped plans.
- Number the plans in the order you expect to build them, so the codes read as the build order. A plan that can start straight away gets a lower number than one that waits.
- A one-plan change outside any feature gets no code.
- A feature doc may carry `priority: <number>`, which puts its plans ahead of other features in `next.mjs`, lowest first. Leave it out unless the person wants this feature first.

## 3. Write the feature doc and each plan

For a new feature, write the feature doc first: `<features>/<code>-<slug>.md`, with the code lowercased in the file name. Put the shared what and why and the decisions every plan relies on there, not in each plan. Leave the plan table's markers empty: step 6 generates it.

Create each plan with the name `plan-names` gives:

- **`numbered`:** `<plans>/<round>.<NNN>-<slug>.md`, such as `1.014-publish-dry-run.md`. `<round>` is the planning round, which matches the major version the plans build towards; `<NNN>` numbers on from the highest plan in that round, and the first plan of a new round is `<round>.001`. Refer to a plan by its number, as in "Plan 1.014".
- **`dated`:** `<plans>/YYYY-MM-DD-<slug>.md`, or `<plans>/YYYY-MM-DD-<code>-<n>-<slug>.md` when `features` is set.

Name the slug for what the plan makes true, and copy the frontmatter from the template. Keep `status: draft` while you write.

- `title` is the pull request title: `<type>: <what becomes true>`, lowercase, no scope. With a code, it is `<type>: <CODE>-<n> <what becomes true>`.
- `code` is the plan's code, `<CODE>-<n>`, when `features` is set and the plan belongs to a feature.
- `owns` lists the paths the pull request can change. Keep it narrow so independent plans can run in parallel. Use globs for directories.
- `proves` gives a command whose output proves the pull request works.
- `needs` lists the plans that must merge first, as repo paths.

For the body, follow the template: the specs it implements, design, steps as checkboxes, tests, done when, out of scope, and open questions. The design names the behaviour for every edge case and failure agreed in step 1a, and the tests cover them.

## 4. Run the cold plan review in a sub-agent

The review is not optional. Do not ask the person to approve the plans until a `review-plan` sub-agent has returned a verdict on them.

**OpenCode and Claude Code:** start one **new** review sub-agent with the `sub-agent-review` name (`run_in_background: false`). The `agent-harnesses` skill says how each harness starts one; the opencode-claude-bridge makes the name callable even when the Agent tool does not list it.

**Amp** (`AMP_THREAD_ID` is set, or the session has the `create_thread` tool): start a new review thread with `create_thread`, `executor: orb`, `intent: delegation`, and the model in `amp-model-review` (empty keeps the thread's own mode). Push the plans first, so the thread can read them, and follow `docs-changes` for where they go: with `direct`, push to `trunk` when the person agrees; with `pull-request`, push to a docs branch. Tell the thread which ref to read them from.

Do not review the plans yourself. Give it only this prompt:

```text
Load the review-plan workflow and follow it. Return its report as your final message.

Plans: <the plan files, as repo paths>.
Serves: <the roadmap line, intake note or request>.
Specs: <the spec files and sections the plans link>.
```

When `specs` is empty, leave the `Specs:` line out and say so.

If the sub-agent cannot load skills, replace the first line with the body of `.factory/workflows/review-plan/SKILL.md` (without its frontmatter). Do not give the reviewer the conversation, your reasoning, or the person's answers: the plans must stand on their own, because the builder gets nothing more.

If the report does not end with a `VERDICT:` line, start a new reviewer once more. If that also fails, tell the person the cold review did not complete and go on to step 5.

## 5. Handle the review

1. **Triage.** Read each finding against the plan and spec it names. Accept it if a builder would really have to guess. Decline it if the plan or spec already answers it, or it is out of scope; keep a one-line reason.
2. **Fix what you can.** Where the specs, the code or an earlier decision gives the answer, change the plan yourself.
3. **Ask about the rest.** Where the answer is a choice the person should make, raise it with them as in step 1a: the finding, why it matters, your proposal. Record each answer under **Decisions**, or as a spec change. A question nobody can answer yet goes under **Open questions** with a proposal, and onto the roadmap if it blocks the plan.
4. **Re-review.** If you accepted any BLOCKER, start another **new** `review-plan` sub-agent on the changed plans. At most two re-reviews; then list what is unresolved for the person.
5. **Report.** When you ask for approval, give the final verdict, what you changed, what the person decided, and each declined finding with its reason.

## 6. Check and report

Add each plan to the roadmap as a checkbox line linking the plan, in the right section and order. If a line said "needs a plan", replace it. If a line linked an intake note, move the note's content and its sightings into the plan and delete the note and its sightings folder. Add each open question that blocks a plan to the roadmap's **Open questions** table.

Run `node .factory/scripts/check.mjs`. After the person approves the plans, set each to `status: ready`; when `features` is set, set the feature doc to `status: building` and run `node .factory/scripts/feature.mjs <CODE> --write`, then read the generated table back to the person: it is the build order they approved. Publish everything as one docs change, following "Publishing docs changes" in `AGENTS.md`, unless the person says otherwise. Approving the plans is not approving the merge of a docs pull request: merge that only when the person has seen it and said to.
