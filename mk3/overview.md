# Metafab: overview

This document states what Metafab is, the bet behind it, and the ideas the product is built on. It replaces the framing in the current website and the Mark I and Mark II prototypes. Those framings describe Metafab as a better way to coordinate agents. That is true, but it is not the main point.

## The proposition

Metafab is a software factory. You design the factory once. Agents run it continuously. The factory makes software that meets the specification for the project.

When the software has a defect, you do not fix the software. You fix the factory, and then you run it again.

The goal is autonomous software creation. A new factory needs people to answer questions and approve work. Over time, the factory needs people less. Each step earns more autonomy as it shows that its output is good.

## The bet

Today, the code is the source of truth. People and agents edit the code directly. When an agent makes a mistake, a person corrects the code or prompts the agent again. The process that made the mistake stays the same, so the same type of mistake comes back.

Metafab changes the source of truth. The specification and the factory are the source of truth. The code is an output of the factory, like a binary is an output of a compiler. Nobody patches a binary. They fix the source and build again.

Two older ideas support this bet:

- **Manufacturing.** When a factory line makes a defective part, the team stops the line and fixes the process. They do not only repair the part. Toyota calls this *jidoka*.
- **Immutable infrastructure.** Cloud teams stopped repairing broken servers. They fixed the image and replaced the server. This is often called "cattle, not pets".

Metafab applies the same change to software.

## LLMs are projectors

A language model takes the current state of information and projects a future state. If you give it a plan, it projects code. If you give it a specification, it projects a plan.

The model is like the lamp in a projector. The lamp is about the same for everyone. The film in front of the lamp decides the picture. For a model, the film is the context: the prompt, the skills, the specification, the plan, and the relevant code.

A good frame gives a good projection. A poor frame gives a poor projection, every time. If the prompt is vague, the plan is weak, or there is no specification, the output will miss edge cases. A better model does not fix a bad frame.

So the work of a software factory is this: put the correct frame in front of the model at each step. A factory does this hundreds of times to make one product. Metafab is the machine that makes those frames.

## How the factory works

### 1. Design the factory

A factory is a set of **programs** connected into a layout. A program is a set of instructions for one type of work. For example: write a plan, build a slice, test a slice, or triage feedback. Each program declares what it reads, what it does, and what it writes.

The layout connects programs. The output of one program becomes the input of the next program. The layout also includes **gates**, where a person must answer a question or approve work.

You can start from a **blueprint**. A blueprint is a factory that someone else designed and tested. You can use a blueprint as it is, or change it for your project.

### 2. Add agents and run

Each team member chooses how many agents to give the factory. These agents run on their own machines, with their own subscriptions. Cloud runners can add more agents.

When the factory runs, each free agent takes the next task that is ready. The agent follows the program for that task, writes the output, and then takes the next task.

### 3. Operate by exception

People do not direct each agent. They answer questions and approve work at the gates. Each gate sends its decision to the correct person. Code review goes to the code owner. Product questions go to the product team. Releases go to the release lead.

While one task waits at a gate, the other agents continue to work.

### 4. Fix the factory

When an output is wrong, Metafab traces it back to the program that made it. Then you ask one question: what let this defect through? Possible causes are a weak program, a missing check, a missing skill, or a poor specification.

You change the factory to fix the cause. Then you discard the bad output and run that part of the factory again. The fix applies to all future work, not only to this defect.

You can still fix an output by hand when that is the practical choice. But the default action is to fix the factory.

## Two sources in every frame

Each frame has parts from two sources:

- **The blueprint.** The program instructions, skills, and the recipe that says which parts go in the frame. These parts are the same on every run of the program.
- **The work.** The specification, the plan, and the code for this item. These parts change with each item.

A defect can come from either source. A weak plan is a problem with the work. A frame that leaves out the constraints is a problem with the blueprint. The trace must show which source caused the defect, because the fix is different. You fix the work for one item. You fix the blueprint for all items after it.

When a frame leaves too much open, the agent asks a question instead of guessing. The question goes to the person who owns that decision.

## Scorers

A **scorer** gives a score to an artifact. It reads one artifact, for example a spec, a plan slice, or a diff. It returns a score and the reasons for the score. A scorer is attached to a type of artifact, not to a program.

The output of one program is the input of the next program. So one scorer does two jobs. It measures how well the first program did its work. It also measures if the item is ready for the next program.

Scores are **leading indicators**. They are available as soon as the artifact exists. Defects, rework, and changes at gates are **lagging indicators**. They arrive days or weeks later. The factory needs both. Leading indicators let you act early. Lagging indicators tell you which leading indicators to trust.

### Kinds of scorer

- **Deterministic.** A script measures the artifact. Examples: required fields, test coverage, the size of a diff.
- **Rubric.** A model checks the artifact against a list of questions.
- **Human.** The changes that a person makes at a gate. This score costs nothing extra, and it is the most useful score for calibration.

A scorer returns one or more named dimensions, for example *constraints covered* and *slice size*. Each dimension has its reasons.

A scorer can be **shown** to the program that makes the artifact, or **held out**. A shown scorer helps the agent get the output right the first time. But the agent learns to satisfy the scorer, and then the score stops being a good measure. A held-out scorer stays an honest measure. You choose for each scorer.

### Checks, scorers, and gates

| | Output | Stops the item? | Purpose |
| --- | --- | --- | --- |
| Check | Pass or fail | Yes | The minimum standard |
| Scorer | A score with reasons | No, unless its policy says to hold | A leading indicator |
| Gate | A human decision | Yes | Judgement |

### Two loops

Scores go to two loops. Only the second loop makes the factory better.

**The item loop.** A low score routes one item. Each scorer has a policy for a low score:

- **Continue, flagged.** The item goes on. Use this when the score only shows a risk.
- **Retry once.** The program runs again with its first output and the reasons for the score.
- **Hold for a person.** The item goes to a gate. The rest of the factory continues.

The item loop fixes one output. It does not change the factory. A retry is a lower limit on quality, not a fix. Count the retries. A program that often needs a retry has a problem in the factory.

**The factory loop.** All scores go to a blueprint revision pass, not only the low scores. You need the full spread to see patterns, and high scores show what works. The pass looks across many items and changes the blueprint:

- **Find the weak part.** Plans from one program always score low on the same dimension. The fix is in the instructions of that program, or in its frame.
- **Promote repeated reasons.** When the same reason comes back again and again, it becomes part of the blueprint: an instruction, a skill, or a check.
- **Test a blueprint change before rollout.** Defects take weeks to arrive. Scores arrive now. Replay recent items on the new version and compare the scores with the old version. Scores are a regression suite for the factory.

Scores do not go back into the frame. They change the blueprint, and the blueprint changes the frame. The agent does not see a number to match. It sees better instructions.

The revision pass can be a person who reads the scores. It can also be a program that proposes a blueprint change. A proposal goes through a gate, the same as a fix for a defect.

### Scorers earn trust

A scorer is part of the blueprint. "Fix the factory" applies to scorers too.

To calibrate a scorer, compare its scores with the defects that come later. For this, each score is stored with the version of the artifact (a content hash), the version of the scorer, the program revision, and the blueprint version. Each artifact also records the artifacts it came from. Then a defect in shipped code can reach the score on the plan two steps before it.

- A scorer that predicts defects can control a gate.
- A scorer that does not predict defects must be fixed or removed.
- If a defect comes from an artifact that scored high, the scorer missed it. The fix can be in the scorer, not in the program.

## When the blueprint changes

The factory does not stop for a blueprint change, and nothing is undone in place. Build tools such as `make` work in the same way: when a source changes, outputs built from it are stale, and only stale outputs are built again.

1. **Each run is pinned to a version.** Every run of a program records the blueprint version it ran on. A run that started on v14 finishes on v14.
2. **Outputs become stale.** When v15 is live, every artifact made by a program that changed in v15 is stale. Staleness goes downstream through the artifact history. If a plan is stale, the code built from that plan is stale too. A stale artifact is not deleted. The item goes back to its earlier state, for example *planned*, and it goes forward again from there.
3. **A rebuild policy decides what runs again.** The policy depends on how much human time the item has used.

| Where the stale item is | Default |
| --- | --- |
| No human gate passed | Rebuild. It is cheap, and no human time was used. |
| Past a human gate | Keep, unless it also scored low. A rebuild discards a human decision. |
| Merged or shipped | Fix forward. |

One case stops part of the line. If the scores of one program fall sharply, or a serious defect traces back to it, pause that program only. Its input buffer fills, and the other programs continue. When the fix is live, the program starts again, and its recent outputs are already marked stale.

## The autonomy dial

Gates are not permanent. They are temporary support for a new factory.

When people stop changing the output of a program at its gate, you can remove the gate or make it a sample check. When defects start to come from a program, you can add the gate again.

A trusted scorer makes the dial work for each item, not only for each program. A high score can skip a sampled gate. A low score can send the item to a person.

The main measure is the number of human decisions for each shipped slice. This number goes down as the factory improves.

The factory moves toward full autonomy one step at a time. Each step must show the data that it is ready.

## Limits and open questions

- **Agents are not deterministic.** A server built from the same image is the same each time. An agent that runs the same program twice can give different output. So "run it again" does not guarantee a fix. The checks must be strong enough that any output that passes is acceptable. The specification and the checks are the most valuable part of the factory.
- **What to discard.** It is expensive and risky to rebuild a full product that has users and data. The usual unit to discard is a slice or a subsystem, not the full product.
- **Existing code.** Most teams have a codebase that no factory made. Metafab needs a way to bring existing code into a factory.
- **Scorers can be gamed.** If a program sees its scorer, the agent learns to satisfy the scorer. When to show a scorer and when to hold it out is a decision for each scorer.
- **Slow and sparse feedback.** Defects arrive weeks later, and most items have none. Calibration may need faster signals, such as changes at gates and rework, with defects as the final test.
- **Trust.** "Fully autonomous" causes doubt. The better claim is that the factory moves toward autonomy, and you can see the progress in the data.

## Summary of the ideas

| Idea | Statement |
| --- | --- |
| The factory is the product you maintain | The software is the output. The factory and the specification are the source of truth. |
| Fix the factory, not the output | Trace each defect to its cause in the factory. Fix the cause and run again. |
| LLMs are projectors | The model projects the next state from the frame you give it. The factory makes the frames. |
| Two sources in every frame | Each frame has parts from the blueprint and parts from the work. A trace shows which one caused a defect. |
| Score early, calibrate late | Scorers on artifacts are leading indicators. Later defects show which scorers to trust. |
| Two loops | A low score routes one item. A pattern of scores changes the blueprint. |
| Stale, not undone | A blueprint change marks outputs stale. A rebuild policy decides what runs again. |
| Earn autonomy | Remove a gate when people stop changing the output at that gate. |
