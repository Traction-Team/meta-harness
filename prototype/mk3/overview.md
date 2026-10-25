# Metafab: overview

This document says what Metafab is, the bet behind it, and the primitives the product is built on. It replaces the framing on the current website and in the Mark I and Mark II prototypes. Those framings describe Metafab as a better way to coordinate agents. That is true, but it is not the main point.

This version also replaces the first Mark III draft. That draft modelled the factory as boxes where work waits (buffers, also called artifact groups), with programs as the arrows between them. This version removes that idea. The factory is now a workflow of programs. See [What changed from the first Mark III draft](#what-changed-from-the-first-mark-iii-draft).

## The proposition

Metafab is a software factory. Each project has its own factory, called a **metafab**. You design the metafab once. Agents run it continuously. The metafab makes software that meets the specification for the project.

When the software has a defect, you do not fix the software. You fix the metafab, and then you run it again.

The target experience:

1. Click **New metafab**. Metafab asks what you want to build.
2. You describe it. An agent designs the full metafab: the programs, how they connect, the gates, the scorers, and the bins.
3. Click **Play**. Agents start to build. Work moves through the metafab, and you can watch it move.
4. Defects start to collect. Things go wrong.
5. The maintenance loop runs, or you start it. It finds the weak parts of the metafab and fixes them.
6. The next feature comes out better. Each cycle, the metafab improves itself while it makes the output.

The goal is autonomous software creation. A new metafab needs people to answer questions and approve work. Over time, it needs people less. Each step earns more autonomy as it shows that its output is good.

## The bet

Today, the code is the source of truth. People and agents edit the code directly. When an agent makes a mistake, a person corrects the code or prompts the agent again. The process that made the mistake stays the same, so the same type of mistake comes back.

Metafab changes the source of truth. The specification and the metafab are the source of truth. The code is an output of the metafab, like a binary is an output of a compiler. Nobody patches a binary. They fix the source and build again.

Two older ideas support this bet:

- **Manufacturing.** When a factory line makes a defective part, the team stops the line and fixes the process. They do not only repair the part. Toyota calls this *jidoka*.
- **Immutable infrastructure.** Cloud teams stopped repairing broken servers. They fixed the image and replaced the server. This is often called "cattle, not pets".

Metafab applies the same change to software.

## LLMs are projectors

A language model takes the current state of information and projects a future state. If you give it a plan, it projects code. If you give it a specification, it projects a plan.

The model is like the lamp in a projector. The lamp is about the same for everyone. The film in front of the lamp decides the picture. For a model, the film is the context: the prompt, the skills, the specification, the plan, and the relevant code. We call this context the **frame**.

A good frame gives a good projection. A poor frame gives a poor projection, every time. If the prompt is vague, the plan is weak, or there is no specification, the output will miss edge cases. A better model does not fix a bad frame.

So the work of a software factory is this: put the correct frame in front of the model at each step. A metafab does this hundreds of times to make one product. Metafab is the machine that makes those frames.

## The primitives

A metafab has four primitives. Work moves through them as **items**.

| Primitive | What it is | Shape on the canvas |
| --- | --- | --- |
| **Program** | One type of work. Takes inputs, produces outputs. | A station |
| **Gate** | A decision between two programs, by a person or a fresh agent. | A barrier on a wire |
| **Scorer** | Gives a score to the output of a program. | Marks on the item |
| **Bin** | Collects outputs and releases them by a rule. | A container on a wire |

There is no separate idea for "a group of artifacts". An artifact is the output of a program. It exists on a wire, in a bin, or at a gate.

Bins may not stay a separate primitive. A plain wire is a bin that releases each item at once, with no limit. So a bin could be settings on a wire. See [Limits and open questions](#limits-and-open-questions).

### Programs

A program is a set of instructions for one type of work. For example: write a spec, plan slices, build a slice, open a PR, or triage feedback.

Each program declares:

- **Inputs.** Named and typed. For example, Plan slices takes one `spec`.
- **Outputs.** Named and typed. For example, Plan slices produces one or more `slice`.
- **Frame.** The instructions, skills, and context that go in front of the model.
- **Runner.** An agent, a script, or a person.
- **Effects.** What the program changes outside the metafab, and how to undo each change. For example: creates a Git branch, opens a PR, merges a PR. See [The time machine](#the-time-machine).

A program can have more than one output. The program chooses which output each item goes to. For example, Triage feedback sends an item to its `bug` output or its `feature` output, and each output is wired to a different program.

### Entry points

Work enters the metafab at an **entry point**. Any program with an input that is not connected to a wire is an entry point. There are two ways to fill that input:

- **A form.** Click **Run** on the program. A form opens for its inputs. The form can be a chat with an agent, which asks questions until the input is complete. Examples: *Log bug*, *Log feature idea*.
- **A connection.** Connect the input to an outside source, for example Sentry, Linear, or GitHub issues. When the source sends an event, like a webhook, the program runs with the event as its input. A new Sentry error becomes a *Log bug* run.

Each run at an entry point makes a new item.

### The workflow

The workflow connects programs. A wire goes from an output of one program to an input of the next program.

By default, there is nothing more to it. When the first program finishes, its output goes to the next program, and that program runs. This continues until the final artifact comes out of the end of the workflow, for example a merged PR or a release.

Three shapes need rules:

- **Fan out.** One run can produce many outputs. Plan slices turns one spec into five slices. Each slice becomes its own item and goes on alone.
- **Fan in.** One run can need many inputs. Ship release takes many verified slices. Use a bin for this.
- **Loops.** A wire can go back to an earlier program. Triage feedback turns a bug report into a new request at the start of the workflow. The new item records the item it came from.

### Gates

A gate sits on a wire. It holds an item after one program finishes and before the next program starts. The item goes on when the gate approves it.

Each gate asks a **question**, for example "Is this spec clear enough to plan from?" or "Is this PR safe to merge?". There are two kinds of gate:

- **Person gate.** The question goes to the gate's owner. Code review goes to the code owner. Product questions go to the product team. Releases go to the release lead.
- **Agent gate.** A fresh agent gets the question, the output, and the context it needs. It has no context from the agent that made the output, so its judgement is independent. It can use tools: read the code, run the app, run the tests. It answers with a decision and its reasons. When it is not sure, it escalates to the gate's owner.

While one item waits at a gate, the rest of the metafab continues.

A gate can:

- **Approve.** The item goes on.
- **Edit and approve.** Person gates only. The changes are stored. They are the most useful signal for calibration.
- **Send back.** The program runs again with the reasons.
- **Rewind.** Send the item back to an earlier point. See [The time machine](#the-time-machine).
- **Escalate.** Agent gates only. The item goes to the owner, with the agent's reasons.

An agent gate is not a scorer. A scorer measures an output and returns a number. It does not stop the item, unless its policy is hold. An agent gate makes a decision on a question, can investigate with tools, and stops the item until it decides.

A gate has an autonomy level: **person** (every item), **sampled** (a person sees some items), **agent**, or **off**. See [The autonomy dial](#the-autonomy-dial).

### Scorers

A scorer reads the output of a program and returns a score with reasons. Scorers run on the output of every program.

There are two scopes:

- **Generic scorers** run on every output by default. For example: an AI slop scorer, or a scorer for scope creep.
- **Specific scorers** run on one type of output. For example: a code reuse scorer on branches, or a slice size scorer on slices.

A scorer is a short pipeline of steps: **prepare** the output, **analyze** it, give a **score**, and give the **reasons**. Only the score step is required. Each step is either code or a prompt to a judge model, and one scorer can mix both. For example, code pulls the changed files out of a diff, and a judge assesses whether they reuse existing code. So "deterministic" and "rubric" are not fixed kinds. They describe the steps.

Human signals are not scorers. They are **feedback**: the edits a person makes at a gate, a defect from Sentry or a user, or a comment. Feedback is stored on the program run and the item, beside the scores. It costs nothing extra, and it is the most useful signal for calibration.

A scorer returns one or more named dimensions, for example *constraints covered* and *slice size*. Each dimension has a score from 0 to 1 and its reasons. This is the same scale that most other tools use, so their scorers can be used in a metafab.

A scorer can say an output is **not applicable**. For example, a test depth scorer on a branch that only changes docs. The output gets no mark from that scorer, and the scorer's averages leave it out. This keeps generic scorers useful on every output.

Each scorer can also have:

- **A filter.** It limits where the scorer runs: by program, by output type, or by tag. The filter applies before sampling.
- **A sample rate.** An expensive scorer can run on a share of outputs, for example 20%. The choice comes from the item ID, not at random. So two scorers at the same rate score the same items, and their scores can be compared.
- **A threshold.** A minimum, a maximum, or a range. Use a maximum when a high score is bad, for example AI slop.

A scorer can be **shown** to the program that makes the output, or **held out**. A shown scorer helps the agent get the output right the first time. But the agent learns to satisfy the scorer, and then the score stops being a good measure. A held-out scorer stays an honest measure. You choose for each scorer.

Each scorer has a policy for a low score:

- **Continue, flagged.** The item goes on with a red mark. Use this when the score only shows a risk.
- **Retry once.** The program runs again with its first output and the reasons for the score.
- **Hold.** The item stops at a gate. The rest of the metafab continues.

A **check** is a scorer with a pass mark and a hold policy. The first draft had checks as a separate idea. They are now one kind of scorer. (Mastra calls this kind of scorer a "gate". In Metafab, a gate is a decision by a person or an agent, not a score.)

Each output gets a **verdict** from its scorers:

- **Passed.** All checks passed and all thresholds were met.
- **Scored.** All checks passed, but a threshold was missed.
- **Failed.** A check failed.

### Bins

A bin sits on a wire. It collects outputs and releases them to the next program by a rule. The word comes from manufacturing: a bin of parts, not a trash bin.

Release rules:

- **Count.** Release when 5 items are in the bin.
- **Time.** Release every Friday at 2pm, or every 4 hours.
- **Group complete.** Release when all the slices from one spec are in the bin.
- **Limit.** Release one item at a time, and no more than 3 in progress downstream. This controls work in progress.
- **Manual.** Release when a person clicks.

A bin can release items **one by one** or as **one batch**. A batch becomes one new item, for example a release. The batch records every item in it.

Example: Plan slices puts slices in a bin. The bin releases them to Build slice when all slices of the spec are planned. Then the builds can run in parallel, and the plan for the full spec is visible before any code exists.

## Items: the work that moves

An item is one piece of work as it moves through the metafab. On the canvas it is a small ball. You can watch it travel from program to program.

The item collects **marks** as it moves. Each program run adds a mark with the verdict colour: green for passed, amber for scored, red for failed. Each gate adds a mark with who decided and what they changed. So at a glance you can see what the item went through, and where it got a poor score. Select a mark to see each score, its reasons, the output, and the judge's prompt.

The item changes form as it moves: a request, then a spec, then a slice, then a branch, then a PR, then a merged PR. It is the same item the whole time. It keeps one history.

Select an item to see its full history:

- Each program run: the frame the agent saw, the output, the metafab version, the agent, the time, and the cost.
- Each mark: the scorer, its version, the score, and the reasons.
- Each gate decision: who decided, and the diff of any edit.
- Each effect: the branch, the PR, the merge commit.
- Its parent and its children. A slice knows its spec. A release knows its slices.

Each program run is recorded as an OpenTelemetry **trace**: a tree of spans for the model calls, tool calls, and steps, each with its time, tokens, and cost. The item history links the traces of all its runs. Every span, score, feedback record, and log carries the item, the program, the metafab version, and the agent. See [`research/mastra-observability.md`](research/mastra-observability.md).

Metafab uses OpenTelemetry and does not build on an agent framework. Agents run inside their own CLIs, such as Claude Code and Codex. So the history can go to any backend:

- **Metafab Cloud.** Our hosted service for traces, scores, feedback, item history, and the dashboards. It is the default.
- **Another backend.** Langfuse, Datadog, Mastra, or any OpenTelemetry tool, in place of Metafab Cloud or as well as it.

Metafab Cloud can also provide the cloud runners, and host the template community.

### Splits and batches

When a program fans out, the item splits. Each child item starts with a copy of the parent history. When a bin releases a batch, the items join into one new item, and the history links back to each item in it.

So the history of the work is a tree, not a line. A defect in a release can be traced to one slice, then to its plan, then to its spec.

## The time machine

You can take an item back to any earlier point in its history, change something, and run it forward again. For example: take a slice back to *planned*, edit the plan, and let it build again.

You can change one of two things before you run forward:

- **The work.** Edit the plan, the spec, or an answer. This fixes this one item.
- **The metafab.** Change a program, a scorer, or the frame. This fixes this item and all items after it.

Because programs have effects outside the metafab, a rewind must undo them. Each program declares its effects and how to undo each one:

| Effect | What a rewind does |
| --- | --- |
| A file or artifact in the metafab | Kept in history, marked as replaced |
| A Git branch | Kept under an archive ref, then a new branch is made from the rewind point |
| An open PR | Closed with a link to the new run |
| A merged PR | Not undone without a person. A revert PR goes through a gate, or you fix forward |
| A deploy | Fix forward |
| An answer from a person | Kept. You choose to reuse it or ask again |

A rewind never deletes. The old path stays in the history, so you can compare the old run and the new run.

When you rewind an item past a split, its child items go back too. When you rewind an item that is in a batch, the batch is not undone; the item leaves the batch, and goes in the next one.

## The metafab lives in Git

The metafab is files in the project repository. Programs, scorers, skills, and the workflow are text. So the metafab has the same tools as code: diff, review, branch, and history.

```
.metafab/
  metafab.yaml          the workflow: programs, wires, gates, bins
  programs/
    write-spec.md
    plan-slices.md
    build-slice.md
  scorers/
    ai-slop.md          generic, judge
    slice-size.md       specific, judge
    code-reuse.ts       specific, code to prepare, judge to score
  skills/
    acceptance-criteria.md
  connections.yaml      outside sources for entry points: Sentry, Linear
  maintenance.md        optional: overrides the maintenance agent prompt
```

A **metafab version** is a commit that changes `.metafab/`. Every program run records the version it ran on: the commit, and a content hash of the program, its skills, and its scorers. A run that starts on v14 finishes on v14.

So for any feature you can see the full path: which version of each prompt, skill, and scorer it went through, and which version made each part of it.

A change to the metafab is a commit. A change proposed by the maintenance loop is a branch and a PR, and it goes through a gate like any other change.

## Lifecycle of a metafab

### 1. Design

Click **New metafab** and say what you want to build. A designer agent proposes the workflow: the programs, the wires, the gates, the scorers, and the bins. You can edit it before you start.

You can also start from a **template**. A template is a metafab that someone shared: the workflow, programs, scorers, and skills, without the project's work. Templates are in an online community where people browse, fork, rate, and share them. A template records the version you started from, so you can see what changed later in the original.

Parts of a metafab can be shared alone too. A good AI slop scorer or a good Plan slices program is useful in many metafabs.

A new metafab starts with gates at most steps. It has not earned trust yet.

### 2. Play

Each team member chooses how many agents to give the metafab. These agents run on their own machines, with their own subscriptions. Cloud runners can add more agents.

When the metafab runs, each free agent takes the next run that is ready, follows the program, writes the output, and takes the next run.

### 3. Operate by exception

People do not direct each agent. They answer questions and make decisions at the gates. When a frame leaves too much open, the agent asks a question instead of guessing. The question goes to the person who owns that decision.

### 4. Maintain

When an output is wrong, Metafab traces it back to the program run that made it. Then you ask one question: what let this defect through? Possible causes are a weak program, a missing scorer, a missing skill, or a poor specification.

You change the metafab to fix the cause. Then you rewind the bad item and run it forward. The fix applies to all future work, not only to this defect.

You can still fix an output by hand when that is the practical choice. But the default action is to fix the metafab.

## Two sources in every frame

Each frame has parts from two sources:

- **The metafab.** The program instructions, skills, and the recipe that says which parts go in the frame. These parts are the same on every run of the program.
- **The work.** The specification, the plan, and the code for this item. These parts change with each item.

A defect can come from either source. A weak plan is a problem with the work. A frame that leaves out the constraints is a problem with the metafab. The trace must show which source caused the defect, because the fix is different. You fix the work for one item. You fix the metafab for all items after it.

## Two loops

Scores go to two loops. Only the second loop makes the metafab better.

Scores are **leading indicators**. They exist as soon as the output exists. Defects, rework, and edits at gates are **lagging indicators**. They arrive days or weeks later. The metafab needs both.

**The item loop.** A low score routes one item, by the scorer's policy: flag, retry, or hold. The item loop fixes one output. It does not change the metafab. Count the retries. A program that often needs a retry has a problem in the metafab.

**The maintenance loop.** All scores go here, not only the low scores. You need the full spread to see patterns, and high scores show what works. The loop looks across many items and changes the metafab:

- **Find the weak program.** Outputs from one program always score low on the same dimension. The fix is in its instructions or its frame.
- **Promote repeated reasons.** When the same reason comes back again and again, it becomes part of the metafab: an instruction, a skill, or a scorer.
- **Test a change before rollout.** Each program has a **replay set**: recent items, and past items that caused defects, each rewound to that program's input. Run the replay set on the old version and the new version, and compare them side by side: the outputs, the scores, the cost, and the time. Effects are mocked during a replay, so it makes no real branches, PRs, or messages. Scores are a regression suite for the metafab.
- **Keep the defect.** When a defect traces back to a program, its item joins that program's replay set. Every later change to the program is checked against it.

Scores do not go back into the frame. They change the metafab, and the metafab changes the frame. The agent does not see a number to match. It sees better instructions.

The maintenance loop is a run of a **maintenance agent**. It is not a metafab and not a program in the workflow. It has a default system prompt that Metafab provides. A project can override the prompt in `.metafab/maintenance.md`.

The maintenance agent runs when you click **Maintain**, on a schedule, or when defects pass a limit. It reads the scores, defects, and gate edits, and proposes changes. A proposal is a PR on `.metafab/`, and it goes through a gate. A person can also do this work by hand.

### Scorers earn trust

A scorer is part of the metafab. "Fix the metafab" applies to scorers too.

To calibrate a scorer, compare its scores with the defects that come later. Each mark stores the content hash of the output, the scorer version, and the metafab version. Each item records its parents. So a defect in shipped code can reach the mark on the plan two steps before it. A change to a scorer is tested the same way as a change to a program: run the new scorer on past outputs where the outcome is known, and see whether it separates the outputs that led to defects.

- A scorer that predicts defects can control a gate.
- A scorer that does not predict defects must be fixed or removed.
- If a defect comes from an output that scored high, the scorer missed it. The fix can be in the scorer, not in the program.

## When the metafab changes

The metafab does not stop for a change. Build tools such as `make` work in the same way: when a source changes, outputs built from it are stale, and only stale outputs are built again.

1. **Runs are pinned.** A run that started on v14 finishes on v14.
2. **Outputs become stale.** When v15 is live, every output made by a program that changed in v15 is stale. Staleness goes down the item tree. If a plan is stale, the code built from that plan is stale too.
3. **A rebuild policy decides what to rewind.** A rebuild is an automatic rewind to the first stale step. The policy depends on how much human time the item has used.

| Where the stale item is | Default |
| --- | --- |
| No person gate passed | Rewind and rebuild. It is cheap, and no human time was used. Agent gates run again. |
| Past a person gate | Keep, unless it also scored low. A rebuild discards a human decision. |
| Merged or shipped | Fix forward. |

One case stops part of the metafab. If the scores of one program fall sharply, or a serious defect traces back to it, pause that program only. Items collect on its input wire, and the other programs continue. When the fix is live, the program starts again, and its recent outputs are already marked stale.

## The autonomy dial

Gates are not permanent. They are temporary support for a new metafab.

Each gate moves along the dial: **person**, then **sampled**, then **agent**, then **off**. When defects start to come from a program, its gate moves back.

- **Person to sampled.** People stop changing the output at the gate.
- **Sampled to agent.** Run an agent gate in shadow while the person still decides. When the agent's decisions agree with the person's on enough items, the agent takes over. A person still sees the items the agent escalates.
- **Agent to off.** The agent gate approves almost everything, and the items it approves do not lead to defects.

An agent gate is part of the metafab, so it is calibrated like a scorer. Its decisions are compared with the person's decisions while in shadow, and with later defects after that.

A trusted scorer makes the dial work for each item, not only for each gate. A high score can skip a sampled gate. A low score can send the item to a person.

The main measure is the number of human decisions for each shipped feature. This number goes down as the metafab improves.

The metafab moves toward full autonomy one step at a time. Each step must show the data that it is ready.

## Limits and open questions

- **Agents are not deterministic.** An agent that runs the same program twice can give different output. So "run it again" does not guarantee a fix. The scorers must be strong enough that any output that passes is acceptable. The specification and the scorers are the most valuable part of the metafab.
- **Effects outside Git.** Branches and PRs are simple to rewind. Merges, deploys, migrations, and messages to users are not. Some rewinds must stop at a gate or fix forward.
- **What to discard.** It is expensive and risky to rebuild a full product that has users and data. The usual unit to rewind is one item or one feature, not the full product.
- **Existing code.** Most teams have a codebase that no metafab made. Metafab needs a way to bring existing code into a metafab.
- **Scorers can be gamed.** If a program sees its scorer, the agent learns to satisfy the scorer.
- **Slow and sparse feedback.** Defects arrive weeks later, and most items have none. Calibration may need faster signals, such as edits at gates and rework, with defects as the final test.
- **Trust.** "Fully autonomous" causes doubt. The better claim is that the metafab moves toward autonomy, and you can see the progress in the data.

Not decided yet:

- **Where run history lives.** Frames, marks, gate edits, and item trees. A commit in the repo for each run is too noisy. The options are a separate Git ref (for example `refs/metafab/*`), Git notes, or Metafab Cloud keyed by commit. The traces go to Metafab Cloud in any case. The open part is what must also be in Git, so that a repo without Metafab Cloud still has its history.
- **Rewind inside a batch.** The current rule is that the item leaves the batch and joins the next one. That is not clear when the batch has already shipped as a release.
- **Rewind past a merge.** A revert PR through a gate, or fix forward only, or a hard stop at the merge.
- **Bins.** A separate primitive is clear on the canvas. Settings on a wire are simpler. It may be that bins are not needed.

## Summary of the ideas

| Idea | Statement |
| --- | --- |
| One metafab per project | The metafab is the thing you maintain. The software is its output. |
| Four primitives | Programs do work. Gates hold for a decision by a person or an agent. Scorers mark outputs. Bins collect and release. |
| Items move and collect marks | Each piece of work is one item with one history, from request to merged PR. |
| Fix the metafab, not the output | Trace each defect to its cause. Fix the cause and run again. |
| LLMs are projectors | The model projects the next state from the frame. The metafab makes the frames. |
| Two sources in every frame | Parts from the metafab and parts from the work. A trace shows which one caused a defect. |
| Entry points | Work enters at programs with an open input, from a form or a connection. |
| Git native | The metafab is files in the repo. Every run is pinned to a metafab version. |
| Open history | Every run is an OpenTelemetry trace. Metafab Cloud is the default backend, and any other works too. |
| Share templates | Metafabs and their parts are shared and forked in an online community. |
| Rewind, do not delete | Take an item back, change the work or the metafab, run it forward. The old path stays. |
| Two loops | A low score routes one item. A pattern of scores changes the metafab. |
| Earn autonomy | A gate moves from person, to sampled, to agent, to off, as the data shows it is ready. |

## What changed from the first Mark III draft

| First draft | Now |
| --- | --- |
| Buffers (artifact groups) are the boxes. Programs are the arrows. | Programs are the stations. Wires connect outputs to inputs. |
| A buffer holds all work of one type. | Work sits on a wire, at a gate, or in a bin. Bins are only added where batching or waiting is needed. |
| Blueprint: a reusable factory you fork. | Metafab: the factory for one project, stored in its repo. You can start one from a shared template. |
| Scorers attach to a type of artifact. | Scorers run on program outputs. Generic scorers run on all outputs. |
| Checks are separate from scorers. | A check is a scorer with a pass mark and a hold policy. |
| Scorer kinds: deterministic, rubric, human. | A scorer is steps, each one code or a judge prompt. Human signals are feedback. |
| Replay recent items on a draft. | Each program has a replay set, with effects mocked. Defect items join it. |
| Gates belong to a program, and a person decides. | Gates sit on wires, between two programs. A person or a fresh agent decides. |
| Stale outputs are listed. History is not drawn. | Each item is a ball with marks and a full history. You can rewind it. |
| Factory loop. | Maintenance loop: a maintenance agent run with a default prompt that a project can override. |
| Work starts at Intent. | Work starts at entry points: a form or chat, or a connection such as Sentry or Linear. |
