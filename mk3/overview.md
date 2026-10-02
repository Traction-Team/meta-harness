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

## Readiness score

Each step in the factory gets a **readiness score** before it runs. The readiness score estimates how likely the frame is to give a good projection. It measures the input, not the output.

A low readiness score means the frame is not ready. The task does not run. Metafab sends the task to a clarification program, or to a person with a list of questions.

This is cheaper than building the wrong thing and then finding the problem at review. Manufacturing calls this incoming inspection. You check the material before it enters the machine.

### How Metafab calculates the score

The readiness score combines three signals:

1. **Rubric checks.** Metafab checks the frame against a list. Is the intent clear? Are there acceptance criteria? Are the constraints stated? Is the relevant code included? Is the scope small enough? Are there open questions or conflicts? Some checks apply to every factory. Each program can add its own checks.
2. **Open questions.** Before the work starts, the model lists the questions it would ask and the assumptions it would make. Many important assumptions give a low score. Metafab can send these questions to the correct person.
3. **Projection variance.** Metafab projects the same frame a few times at low cost, for example as short plans. Then it measures how much the results differ. A clear frame gives similar results. An unclear frame gives different results, because the model fills the gaps in different ways each time.

Projection variance is the strongest signal. It works for every type of step and does not need a rubric.

### Keeping the score honest

The readiness score is useful only if it predicts the result. The factory already records the result. It knows which work passed its gates, which work needed rework, and which defects appeared later.

Metafab compares readiness scores with these results for each program. Over time, the score becomes more accurate. At the start, treat the score as an early warning, not as a measure of quality.

The readiness score also helps to fix the factory. If a defect came from a step with a low score, the fix is usually in the step that made the frame. That step can be the specification, the plan, or a skill. It is not usually the code.

## Measuring the factory

A factory that you cannot measure is only a workflow. Metafab shows these measures for each program:

- **Readiness**: the average readiness score of the frames that the program receives.
- **Yield**: the percentage of outputs that pass their gates the first time.
- **Rework**: how often an output goes back for changes.
- **Escaped defects**: defects found after the output left the program.
- **Gate load**: how often a person must make a decision.

These measures show where the factory gives its agents poor context, and where it makes poor output.

## The autonomy dial

Gates are not permanent. They are temporary support for a new factory.

When a program has high readiness and high yield for a long time, you can remove its gate or make the gate a sample check. When a program starts to fail, you can add the gate again.

The factory moves toward full autonomy one step at a time. Each step must show the data that it is ready.

## Limits and open questions

- **Agents are not deterministic.** A server built from the same image is the same each time. An agent that runs the same program twice can give different output. So "run it again" does not guarantee a fix. The checks must be strong enough that any output that passes is acceptable. The specification and the checks are the most valuable part of the factory.
- **What to discard.** It is expensive and risky to rebuild a full product that has users and data. The usual unit to discard is a slice or a subsystem, not the full product.
- **Existing code.** Most teams have a codebase that no factory made. Metafab needs a way to bring existing code into a factory.
- **Trust.** "Fully autonomous" causes doubt. The better claim is that the factory moves toward autonomy, and you can see the progress in the data.
- **Score accuracy.** The readiness score is new. It needs real results to show that it predicts outcomes.

## Summary of the ideas

| Idea | Statement |
| --- | --- |
| The factory is the product you maintain | The software is the output. The factory and the specification are the source of truth. |
| Fix the factory, not the output | Trace each defect to its cause in the factory. Fix the cause and run again. |
| LLMs are projectors | The model projects the next state from the frame you give it. The factory makes the frames. |
| Readiness before work | Score each frame before the step runs. Do not project a frame that is not ready. |
| Measure the factory | Readiness, yield, rework, escaped defects, and gate load for each program. |
| Earn autonomy | Remove gates when the data shows that a step is reliable. |
