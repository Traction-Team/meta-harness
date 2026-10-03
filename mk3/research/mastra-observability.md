# Mastra observability and evals

Researched 4 Oct 2026.

Sources: [platform page](https://mastra.ai/platform-observability), and the docs on [observability](https://mastra.ai/docs/observability/overview), [tracing](https://mastra.ai/docs/observability/tracing/overview), [feedback](https://mastra.ai/docs/observability/feedback), [evals](https://mastra.ai/docs/evals/overview), [custom scorers](https://mastra.ai/docs/evals/custom-scorers), [gates and verdicts](https://mastra.ai/docs/evals/gates-and-verdicts), [experiments](https://mastra.ai/docs/evals/experiments), [Studio observability](https://mastra.ai/docs/studio/observability), and the guide [Build an eval loop](https://mastra.ai/docs/guides/build-an-eval-loop).

The question: how do Mastra's scorers, history, and views work, and what should Metafab take from them?

## Summary

Mastra has most of the parts we need for one **run**: traces, scorers, feedback, datasets, experiments, and metrics. It has no idea of an **item** that crosses many runs over days, of a versioned system that made it, or of rewinding. Those are the parts Metafab adds.

So take Mastra's model for everything inside one program run, and put the item and the metafab version above it.

```
Metafab:   item ──► program run ──► program run ──► program run     (days)
                        │
Mastra:                trace ──► spans: model calls, tool calls      (minutes)
                        │
                       scores, feedback, logs
```

## How Mastra works

### Traces

- Every agent run, workflow step, tool call, and model call is a **span**. Related spans make a **trace**: a tree with a timing bar for each span.
- Each span has its input, output, tokens, cost, and duration, without extra code.
- Metadata and tags go on spans: user, environment, experiment. You can filter the trace list on them.
- It uses OpenTelemetry, so traces can go to Langfuse, Datadog, Braintrust, and others.
- Logs carry the trace ID and span ID, so you can go from a log line to its trace.
- A trace can be downloaded as JSON, to share or to make a test case.

### Scorers

- A scorer returns a **score** (usually 0 to 1) and a **reason**.
- A scorer is a pipeline of four steps: **preprocess**, **analyze**, **generateScore** (the only required step), **generateReason**. Each step is either a function (deterministic) or a prompt to a judge model. One scorer can mix both: code to pull out the data, a judge to assess it.
- Scorers attach to an agent or to a **workflow step**. A step scorer sees the step's own input and output. This is the same as a Metafab scorer on a program output.
- **Live scoring** runs in the background and does not block the run.
- **Sampling.** A rate from 0 to 1. The decision comes from the trace ID, not at random. So two scorers at the same rate score the same runs, and their scores can be compared.
- **Eligibility filters.** A JSON predicate on the run context decides if a scorer runs at all. It runs before sampling.
- **Not scorable.** A scorer can look at the run and return `notScorable()`. The run is left out of that scorer's averages. Example: a refund scorer on a run with no refund.
- **Gates and verdicts.** In Mastra, a *gate* is an automated scorer that must score 1.0. A *threshold* is a minimum (or maximum, or range) on a scorer. A run gets a **verdict**: `passed` (all gates and thresholds met), `scored` (gates passed, a threshold missed), or `failed` (a gate failed).
- Studio lists each scorer and every score it made. A score detail shows the value, the reason, the input, the output, and the judge's prompts. Any score can be saved as a test case.

### Feedback

- Human signals: thumbs, ratings, comments, corrections. Each has a source (`user`, `qa`, `studio`, `system`) and links to a trace or a span.
- Numeric feedback goes into the same analytics as scores: averages, breakdowns, time series.

### Datasets and experiments

- A **dataset** is a versioned set of test cases: input plus **ground truth**. Ground truth can be a rubric, for example `must` and `mustNot` lists.
- An **experiment** runs every case through a target (an agent, a workflow, or a scorer) and scores the outputs. Experiments are stored, and you can **compare** two or more side by side: answers, scores, cost, and time.
- **Add trace to dataset.** A bad production run becomes a test case in one click. The next change is checked against it.
- **Scorer as target.** Run a dataset through a judge to test the judge itself.
- **Tool mocks.** A test case can carry fixed outputs for tools. Policy `deny` blocks any tool that has no mock, so a replay cannot cause side effects.
- Experiments can be driven from outside (Temporal, a worker fleet) and still show in Studio.

### Metrics

- Dashboard: runs, model cost, tokens, and average scorer performance, each with the change against the previous period. Usage by model and by agent, trace volume, latency p50 and p95, and **scorer trends over time**.

### The eval loop guide

Their loop: curate cases, run an experiment, diagnose, make one targeted change, run it again, compare. Production failures become new cases. The same cases become a check in CI. This is the Metafab maintenance loop for one agent, done by hand.

## What it looks like

- **Trace tree.** Indented span names on the left, with tree lines. On the right, one bar for each span, coloured by span type, with the duration. The root bar is the full run. A count of child spans sits next to each bar.
- **Metrics.** Dark cards. A big number, and a red or green change against the previous period. Tables of tokens by model. Horizontal bars of usage by agent.
- **Logs.** A table of time, level (colour-coded: DEBUG, INFO, WARN, ERROR), and an entity chip. Each row links to its trace.
- **Experiments.** A list of runs, then a compare view with answers side by side and a score on each.

## What to take

| Mastra idea | Use in Metafab |
| --- | --- |
| Spans and traces, on OpenTelemetry | One trace for each program run. The item history links the traces. Export to Langfuse and others for free. |
| Correlation fields on every record | Add `item`, `program`, `metafab version`, and `agent` to every span, score, feedback record, and log. |
| Scorer pipeline: preprocess, analyze, score, reason | A scorer is steps. Each step is code or a judge prompt. This replaces "deterministic or rubric" as a fixed kind. |
| `notScorable()` | A generic scorer, such as AI slop, can say "does not apply" to an output. It is left out of averages and gives no mark. |
| Deterministic sampling | Expensive scorers run on a share of outputs. The choice comes from the item ID, so scorers at the same rate score the same items. |
| Eligibility filters | Limit a generic scorer by program, output type, or tag, before sampling. |
| Verdict: passed, scored, failed | The colour of a mark. Green: passed. Amber: a threshold was missed. Red: a check failed. |
| Thresholds with min, max, or range | Use `max` for scorers where high is bad, like AI slop. |
| Feedback records | Gate edits, defects from Sentry or users, and comments are all feedback, linked to a program run and its item. |
| Datasets with ground truth | A **replay set** for each program: recent and past items, rewound to that program's input. |
| Add trace to dataset | **Add to replay set**: a defect item becomes a permanent case for the program that caused it. |
| Experiments and compare | Testing a metafab change is an experiment: the replay set on v14 and on v15, compared side by side. |
| Scorer as target | Calibrate a scorer: run it on items with known outcomes (defect or no defect). |
| Tool mocks and `deny` policy | A replay runs with effects mocked. No real branches, PRs, or messages. |
| Metrics with change against the previous period | Show change against the previous **metafab version**, not only the previous week. |
| Score detail with judge prompts | Selecting a mark on an item shows the score, reason, output, and the judge's prompt. |

## What Mastra does not have

These are the parts Metafab adds:

- **The item.** Mastra's unit is one run. Metafab's unit is one piece of work across many runs, over days, through splits and batches.
- **Lineage.** A defect in a release traced back through a slice, its plan, and its spec.
- **System versions.** Mastra versions datasets. It does not pin each run to a version of the whole system and show what that version changed.
- **Rewind.** Going back to an earlier point, changing the work or the system, and running forward, with undo for effects.
- **Decision gates in the flow.** Mastra's gates are automated pass marks on a score. Metafab's gates are decisions on a question, by a person or by a fresh agent with tools. The autonomy dial moves them from person to agent to off.
- **The maintenance loop.** Mastra's loop is a person with a coding agent. Metafab runs it as a maintenance agent that proposes a PR on `.metafab/`.
- **Calibration against defects.** Mastra compares scores between experiments. It does not check if a scorer predicts later defects.

## Decisions

- **Word clash.** Mastra uses "gate" for an automated hard check. Metafab uses "gate" for a decision by a person or an agent, and "check" for a scorer with a pass mark. Keep ours, and note the difference in the docs.
- **Score scale: 0 to 1.** The same as Mastra and most tools, so outside scorers can be used.
- **OpenTelemetry, not Mastra.** Agents run inside CLIs such as Claude Code and Codex, not inside Mastra agents (see `mark-two/research/agent-runtime-architecture.md`). Metafab records OpenTelemetry traces and sends them to **Metafab Cloud**, our own hosted service, by default. Teams can also send them to Langfuse, Datadog, Mastra, or any OpenTelemetry backend.
