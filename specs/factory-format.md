# Factory format

A factory is an open, repository-local description of how people and agents do work. It lives in `.factory/`.

Metafab format version: **1**.

## Core rule

Every directory below `.factory/` that contains `SKILL.md` is an Agent Skill:

```text
.factory/**/<name>/SKILL.md
```

Each skill must follow the Agent Skills format:

- The directory name is `<name>`.
- `SKILL.md` contains `name` and `description` frontmatter.
- Supporting files can live beside `SKILL.md`.

The directory structure classifies skills by purpose. It does not change how agent tools load them.

## Directory layout

```text
.factory/
  factory.yaml               factory name, stages, and decisions
  AGENTS.md                  standing project instructions
  workflows/<name>/SKILL.md  steps that move work
  scorers/<name>/SKILL.md    checks that score work
  skills/<name>/SKILL.md     reusable project knowledge
  rules/*.md                 rules for every agent session
  templates/*                reusable document templates
  scripts/*                  scripts called by workflows
  metafab.yaml               Metafab configuration
  metafab.lock               upstream and link state
```

All entries are optional. An empty `.factory/` directory is valid.

Teams can add other top-level directories. A skill in `.factory/review/security/` belongs to the `review` group and has the name `security`.

`metafab.yaml` and `metafab.lock` are tool files. They are not part of the open factory format.

## Workflows

A workflow is a skill that performs one step in the factory. It can move work between stages or create new work.

```markdown
---
name: review-slice
description: Review a slice PR against its plan and the project rules. Use when a slice PR is ready for review.
title: Review slice
from: review
to: merge
decides: done
---

# Review slice

1. Read the PR and the matching slice in its plan.
2. Review the change against the plan and project rules.
3. Report the findings.
4. Stop and ask the code owner to approve the PR.
```

### Workflow frontmatter

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | Yes | Skill name. It must match the directory name and be unique in the factory |
| `description` | Yes | What the workflow does and when an agent should use it |
| `title` | No | Display name. The default is `name` with hyphens replaced by spaces |
| `from` | No | Stage that contains the input work. Omit it for a workflow that creates new work |
| `to` | No | Stage that receives the output |
| `decides` | No | Decision that requires a person to act at the end |

Names can contain lowercase ASCII letters, digits, and hyphens.

### Workflow requirements

1. The final step must state what happens next.
2. The final step must state when the agent must stop for a person.
3. A workflow must describe an operation without naming a specific agent tool.
4. Agent-specific instructions belong in a separate skill.
5. A workflow must refer to templates and scripts by repository-relative path.

For example, write "open a new worktree for this slice" in a workflow. Put the tool-specific command in a harness skill.

## Scorers

A scorer asks one question about one artifact. It returns a score from 0 to 10, where a higher score is always better.

```markdown
---
name: edge-cases
description: Score whether a plan covers its edge cases. Use after a plan changes.
ask: Does the plan identify its edge cases and define the result for each case?
---

# Edge cases

Read the plan and list the inputs and states it affects.

Return a score from 0 to 10. Give one line of evidence and one line for the largest gap.
```

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | Yes | Skill name. The same rules as workflow names apply |
| `description` | Yes | What the scorer measures and when an agent should use it |
| `ask` | Yes | One question phrased so a higher score means a better result |

Version 1 stores no score records. A person or workflow invokes a scorer as a normal Agent Skill.

## Skills

`.factory/skills/` contains reusable project knowledge. Examples include test conventions, API architecture, and worktree setup.

These files use the standard Agent Skills format and add no factory-specific frontmatter.

Separate skills from workflows so that `workflows/` remains a clear description of the process.

## Rules

Each `.factory/rules/*.md` file contains a rule for every agent session. Examples include branch naming, commit titles, and protected branch requirements.

A rule file is plain Markdown. Its first heading, if present, is its title.

Metafab includes all rules in `AGENTS.md`. Keep rules short. Put conditional guidance in a skill instead.

## Standing instructions

`.factory/AGENTS.md` contains project instructions that apply to every agent session. Typical content includes:

- A short project description
- Build and test commands
- Files that an agent should read first

Metafab places this content at the start of the generated factory block in the root `AGENTS.md`.

## Templates and scripts

`.factory/templates/` contains source templates for artifacts such as plans, PR descriptions, and intake notes.

`.factory/scripts/` contains deterministic operations that workflows call. Prefer portable Node.js or shell scripts with no build step.

Metafab does not install templates or scripts. Workflows use them through repository-relative paths.

Scripts run on a contributor's machine. Review script changes as code. The update summary lists executable changes first.

## `factory.yaml`

`factory.yaml` names the factory and describes its flow.

```yaml
format: 1
name: mark4
description: Plan, build, and review work in slices with a person at each decision.

stages:
  - id: intake
    title: Logged ideas
    next: triage-ideas
  - id: ready
    title: Approved plans
    next: build-slice
  - id: review
    title: Built branches
    next: review-slice
    waits-for: code owner
  - id: merge
    title: Ready to merge
    waits-for: code owner
  - id: shipped
    title: Shipped
    done: true

decisions:
  triage: { who: product lead, says: Pick the next item }
  plan:   { who: tech lead,    says: Approve the plan as a documentation PR }
  done:   { who: code owner,   says: Approve the implementation PR }
```

### Top-level fields

| Field | Required | Meaning |
| --- | --- | --- |
| `format` | Yes | Format version. Version 1 requires the number `1` |
| `name` | Yes | Factory name. It uses lowercase ASCII letters, digits, and hyphens |
| `description` | No | One-line description |
| `stages` | No | Ordered list of stages |
| `decisions` | No | Named actions that require a person |

These fields are required only when `factory.yaml` exists.

### Stages

A stage is a place where work waits. The order in `stages` is the flow order.

| Field | Meaning |
| --- | --- |
| `id` | Unique stage name. It follows the same syntax as a workflow name |
| `title` | Display name |
| `next` | Workflow that moves work from this stage |
| `waits-for` | Person or role that must act before work can continue |
| `done` | `true` when this is an end stage |
| `find` | Reserved for a future stage query |
| `where` | Reserved for a future stage query condition |

Version 1 uses stages only to describe the flow in `AGENTS.md`. It does not locate or track work.

### Decisions

A decision identifies an action that remains under human control. Each decision can state who acts and what they decide.

A workflow refers to a decision through `decides`. A stage can also identify a responsible person through `waits-for`.

Metafab documents these controls in `AGENTS.md`. It does not enforce them at runtime.

## Validation

A version 1 factory is valid when all the following statements are true:

1. Every `SKILL.md` contains `name` and `description`.
2. Each skill name matches its directory name.
3. Every skill name is unique across the complete factory.
4. Every scorer contains `ask`.
5. `factory.yaml`, when present, contains `format` and `name`.
6. Stage IDs are unique.
7. Decision names are unique.
8. Each `from` and `to` value names an existing stage.
9. Each `next` value names an existing workflow.
10. Each `decides` value names an existing decision.

`metafab check` reports each error with a file path, line number, and suggested fix.

## Reserved names

The format reserves these names at the top of `.factory/`:

- `factory.yaml`
- `AGENTS.md`
- `workflows/`
- `scorers/`
- `skills/`
- `rules/`
- `templates/`
- `scripts/`
- `runtimes/` for future harness instructions

Names that start with `metafab` belong to the Metafab tool. Teams can use any other top-level name.
