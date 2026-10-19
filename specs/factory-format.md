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

A factory adds two things to plain Agent Skills:

1. **A pipeline.** `factory.yaml` lists the workflows in the order that work moves through them.
2. **Skill dependencies.** A skill can name the other skills it `uses`. Metafab includes them when it installs the skill.

## Directory layout

```text
.factory/
  factory.yaml               factory name and pipeline
  AGENTS.md                  standing project instructions
  workflows/<name>/SKILL.md  steps that move work
  skills/<name>/SKILL.md     reusable project knowledge
  templates/*                reusable document templates
  scripts/*                  scripts called by workflows
  metafab.yaml               Metafab configuration (see configuration.md)
  metafab.lock               upstream and installed output state
```

All entries are optional. An empty `.factory/` directory is valid.

Teams can add other top-level directories. A skill in `.factory/review/security/` belongs to the `review` group and has the name `security`. It installs and behaves like any other skill.

`metafab.yaml` and `metafab.lock` are tool files. They are not part of the open factory format.

## Workflows

A workflow is a skill that performs one step of the work, such as filing a bug, planning a feature, building a slice, or reviewing a PR. Every skill below `.factory/workflows/` is a workflow.

```markdown
---
name: review-slice
description: Review a slice PR against its plan. Use when a slice PR is ready for review.
uses: [git-conventions, testing]
---

# Review slice

1. Read the PR and the matching slice in its plan.
2. Review the change against the plan and `git-conventions`.
3. Report the findings.
4. Stop and ask the code owner to approve the PR.
```

A workflow is a standard Agent Skill. Its only factory field is the optional `uses` field, which any skill can have (see [Skill dependencies](#skill-dependencies)).

The order of workflows belongs in the [pipeline](#pipeline), not in workflow files. A workflow file describes one step and does not name the steps before or after it.

Workflows differ from other skills in one way: Metafab lists every workflow in the generated `AGENTS.md` block. Agents can then select a workflow from a plain request, such as "here is a bug Kat hit", without loading every workflow.

### Workflow guidance

1. The `description` must say when to use the workflow. Agents select workflows by description.
2. The final step should say when the agent must stop for a person.
3. A workflow should describe an operation without naming a specific agent tool. Put tool-specific instructions in a skill that the workflow `uses`.
4. A workflow must refer to templates and scripts by repository-relative path, such as `.factory/templates/plan.md`.

For example, write "open a new worktree for this slice" in a workflow. Put the tool-specific command in a harness skill.

## Skills

`.factory/skills/` contains reusable project knowledge. Examples include test conventions, API architecture, Git conventions, and worktree setup in a specific agent tool.

Agent tools discover skills by description, as with any Agent Skill. A workflow can also include a skill directly with `uses`.

Separate skills from workflows so that `workflows/` remains a clear description of the process.

## Skill dependencies

A skill can name other skills in the same factory with `uses`:

```yaml
---
name: build-slice
description: Build one slice of an approved plan on its own branch. Use when a person picks a ready slice.
uses: [git-conventions, our-api, testing]
---
```

When Metafab installs `build-slice`, it includes `git-conventions`, `our-api`, and `testing`. The agent then has them when it loads `build-slice`, with no reliance on the agent deciding to load them.

The skill that is included chooses how it is included, with `bundle`:

```yaml
---
name: git-conventions
description: Branch names, commit titles, and PR rules for this repository.
bundle: inline
---
```

| `bundle` | Behaviour |
| --- | --- |
| `reference` | The default. The installed skill starts with an instruction to read the included skill's file before it starts |
| `inline` | The included skill's body is copied into the installed skill |

Use `inline` for short skills that every user needs in full. Use `reference` for long skills, so that the agent reads them only when it runs the skill that uses them.

Dependency rules:

1. `uses` names skills by `name`. The skill's directory does not matter.
2. `uses` can name only skills in the same factory. Version 1 does not support dependencies on other fabs.
3. Dependencies are transitive. If `build-slice` uses `our-api` and `our-api` uses `http-client`, `build-slice` includes both.
4. A skill that is reached more than once is included once.
5. A skill cannot use itself, directly or through other skills.
6. An included skill is still installed as its own skill.

[Linking](linking.md#compiled-skills) defines the exact installed output.

### Factory frontmatter fields

| Field | Applies to | Required | Meaning |
| --- | --- | --- | --- |
| `uses` | Any skill | No | List of skill names to include when this skill is installed |
| `bundle` | Any skill | No | How this skill is included by others: `reference` (default) or `inline` |

All other frontmatter belongs to the Agent Skills format or to agent tools, and Metafab copies it unchanged. Metafab removes `uses` and `bundle` from installed skills, so installed skills contain only standard frontmatter.

## Standing instructions

`.factory/AGENTS.md` contains instructions that apply to every agent session. Typical content includes:

- A short project description
- Build and test commands
- Rules that every session must follow, such as branch naming and protected branches
- Files that an agent should read first

Metafab places this content at the start of the generated factory block in the root `AGENTS.md`. Keep it short. Put guidance that applies only to some tasks in a skill.

## Templates and scripts

`.factory/templates/` contains source templates for artifacts such as plans, PR descriptions, and intake notes.

`.factory/scripts/` contains deterministic operations that workflows call. Prefer portable Node.js or shell scripts with no build step.

Metafab does not install templates or scripts. Workflows use them through repository-relative paths.

Scripts run on a contributor's machine. Review script changes as code. The update summary lists executable changes first.

## `factory.yaml`

`factory.yaml` names the factory and lists its pipeline.

```yaml
format: 1
name: mark4
description: Plan, build, and review work in slices with a person at each decision.

pipeline:
  - file-work
  - triage-ideas:  { stop: The product lead picks the next item }
  - plan-feature:  { stop: The tech lead approves the plan as a documentation PR }
  - build-slice
  - review-slice:  { stop: The code owner approves the PR }
  - finish-slice
```

### Top-level fields

| Field | Required | Meaning |
| --- | --- | --- |
| `format` | Yes | Format version. Version 1 requires the number `1` |
| `name` | Yes | Factory name. It uses lowercase ASCII letters, digits, and hyphens |
| `description` | No | One-line description |
| `pipeline` | No | Ordered list of workflows |

These fields are required only when `factory.yaml` exists.

### Pipeline

The pipeline is the order in which work moves through the workflows. When a workflow in the pipeline ends, the agent suggests the next one.

Each entry is either:

- A workflow name, such as `- build-slice`
- A workflow name with options, such as `- review-slice: { stop: The code owner approves the PR }`

| Option | Meaning |
| --- | --- |
| `stop` | A person must act before the next workflow starts. The text says who acts and what they decide |
| `stage` | Reserved for a future stage definition |
| `find` | Reserved for a future stage query |
| `where` | Reserved for a future stage query condition |

Pipeline rules:

1. Each entry names a workflow in `.factory/workflows/`.
2. Each workflow appears in the pipeline at most once.
3. Workflows that are not in the pipeline are standalone. Agents can still use them, and `AGENTS.md` still lists them.
4. Version 1 pipelines are linear. They have no branches.

Version 1 uses the pipeline only to describe the flow in `AGENTS.md`. It does not locate, track, or start work. Metafab does not enforce `stop`. Agents follow it because `AGENTS.md` and the workflow text tell them to.

## Validation

A version 1 factory is valid when all the following statements are true:

1. Every `SKILL.md` contains `name` and `description`.
2. Each skill name matches its directory name.
3. Every skill name is unique across the complete factory.
4. Skill names contain only lowercase ASCII letters, digits, and hyphens.
5. Each `uses` value names an existing skill in the factory.
6. No skill uses itself, directly or through other skills.
7. Each `bundle` value is `reference` or `inline`.
8. `factory.yaml`, when present, contains `format` and `name`.
9. Each pipeline entry names an existing workflow, and no workflow appears twice.
10. Pipeline entries use only the `stop` option. Reserved options are errors in version 1.

`metafab check` reports each error with a file path, line number, and suggested fix.

## Reserved names

The format defines these names at the top of `.factory/`:

- `factory.yaml`
- `AGENTS.md`
- `workflows/`
- `skills/`
- `templates/`
- `scripts/`

The format reserves these names for future versions:

- `scorers/` for skills that score work
- `rules/` for rules that every session follows
- `runtimes/` for agent-tool instructions

A version 1 factory can use reserved directories. Metafab installs any skills in them as ordinary skills.

Names that start with `metafab` belong to the Metafab tool. Teams can use any other top-level name.
