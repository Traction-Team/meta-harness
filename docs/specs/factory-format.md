# Factory format

A factory is an open, repository-local description of how people and agents do work. It lives in `.factory/`.

Metafab format versions: **1** and **2**. Format 2 adds [environments](environments.md). Metafab 2 reads both. Metafab 1 reports `format: 2` as a rule 7 error, so its `check` and `build` exit 1 on a format 2 factory and its `import` refuses a format 2 fab with exit 4.

## Core rule

Every directory below `.factory/` that contains `SKILL.md` is an Agent Skill, except the reserved top-level directories (see [Validation](#validation) rule 11):

```text
.factory/**/<name>/SKILL.md
```

Metafab ignores directories whose name starts with `.`, such as `.git`. A `SKILL.md` below such a directory is not part of the factory.

Each skill must follow the Agent Skills format:

- The directory name is `<name>`. The directory name and the `name` field follow the Agent Skills name rules in [Validation](#validation).
- `SKILL.md` contains `name` and `description` frontmatter.
- Supporting files can live beside `SKILL.md`.
- A skill directory cannot contain another directory with a `SKILL.md`. Skills cannot be nested inside other skills.

The directory structure classifies skills by purpose. It does not change how agent tools load them.

A factory adds a pipeline to plain Agent Skills. `factory.yaml` lists the workflows in the order that work moves through them.

## Directory layout

```text
.factory/
  factory.yaml               factory name, pipeline and required repository files
  AGENTS.md                  standing project instructions
  workflows/<name>/SKILL.md  steps that move work
  skills/<name>/SKILL.md     reusable project knowledge
  templates/*                reusable document templates
  scripts/*                  scripts called by workflows
  partials/*                 Markdown that skills and AGENTS.md import (a convention, not a reserved name; see Environments)
  metafab.yaml               Metafab configuration and upstream (see configuration.md)
```

All entries are optional. An empty `.factory/` directory is valid.

Teams can add other top-level directories. A skill in `.factory/review/security/` belongs to the `review` group and has the name `security`. It installs and behaves like any other skill.

`metafab.yaml` is a tool file. It is not part of the open factory format.

## Workflows

A workflow is a skill that performs one step of the work, such as filing a bug, planning a feature, building a slice, or reviewing a PR. Every skill below `.factory/workflows/` is a workflow.

```markdown
---
name: review-slice
description: Review a slice PR against its plan. Use when a slice PR is ready for review.
---

# Review slice

1. Read the PR and the matching slice in its plan.
2. Review the change against the plan and `git-conventions`.
3. Report the findings.
4. Stop and ask the code owner to approve the PR.
```

A workflow is a standard Agent Skill. It has no factory-specific frontmatter.

The order of workflows belongs in the [pipeline](#pipeline), not in workflow files. A workflow file describes one step and does not name the steps before or after it.

Workflows install exactly like other skills. Their descriptions are written for agent tools that use descriptions for skill discovery, so a request such as "here is a bug Kat hit" can identify the intended workflow. A person can also invoke a workflow by name, such as `/file-work`, in tools that support it. Metafab does not verify either behaviour. Only workflows can appear in the [pipeline](#pipeline).

### Workflow guidance

1. The `description` must say when to use the workflow. It is the discovery metadata available to agent tools; no other file lists the workflow for discovery.
2. The final step should say when the agent must stop for a person.
3. A workflow should describe an operation without naming a specific agent tool. Put tool-specific instructions in a separate skill and refer to it explicitly.
4. A workflow must refer to templates and scripts by repository-relative path, such as `.factory/templates/plan.md`.

For example, write "open a new worktree for this slice" in a workflow. Put the tool-specific command in a harness skill.

## Skills

`.factory/skills/` contains reusable project knowledge. Examples include test conventions, API architecture, Git conventions, and worktree setup in a specific agent tool.

Descriptions provide discovery metadata as they do for any Agent Skill.

Separate skills from workflows so that `workflows/` remains a clear description of the process.

## Skill frontmatter

Skill frontmatter belongs to the Agent Skills format or to agent tools. Metafab defines no factory-specific skill frontmatter and copies all fields unchanged.

A skill that applies only in some environments says so in `factory.yaml` under [`skills`](environments.md#conditional-skills), not in its frontmatter, so its frontmatter stays the same everywhere.

## Standing instructions

`.factory/AGENTS.md` contains instructions that apply to every agent session. Typical content includes:

- A short project description
- Build and test commands
- Rules that every session must follow, such as branch naming and protected branches
- Files that an agent should read first

Metafab places this content at the start of the generated factory block in the root `AGENTS.md`. Keep it short. Put guidance that applies only to some tasks in a skill.

In a format 2 factory, `.factory/AGENTS.md` can use [directives](environments.md#directives). `build` renders it for every declared value, so the root block is the same for every developer.

## Templates and scripts

`.factory/templates/` contains source templates for artifacts such as plans, PR descriptions, and intake notes.

`.factory/scripts/` contains deterministic operations that workflows call. Prefer portable Node.js or shell scripts with no build step.

Metafab does not install templates or scripts. Workflows use them through repository-relative paths.

A template named by a [`requires`](#required-repository-files) entry is also copied once into the repository by `import` or `update`, when its file is missing and a person agrees. It is never installed as a skill.

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

requires:
  - path: opencode.json
    description: Defines the agent-coding sub-agent that every workflow starts
    template: .factory/templates/setup/opencode.json
  - path: docs/roadmap.md
    description: The roadmap that prioritise-roadmap writes and start-plan reads
```

### Top-level fields

| Field | Required | Meaning |
| --- | --- | --- |
| `format` | Yes | Format version: `1` or `2` |
| `name` | Yes | Factory name. It uses lowercase ASCII letters, digits, and hyphens |
| `description` | No | One-line description |
| `pipeline` | No | Ordered list of workflows |
| `requires` | No | Repository files outside `.factory/` that the workflows need |
| `env` | No | Format 2. Variables that describe a developer's environment. See [Environments](environments.md#declaring-variables) |
| `skills` | No | Format 2. A condition for each skill that depends on the environment. See [Conditional skills](environments.md#conditional-skills) |

These fields are required only when `factory.yaml` exists.

### Pipeline

The pipeline describes the order in which work moves through the workflows. The generated instructions tell an agent to suggest the next workflow when one ends. Metafab does not execute the pipeline or verify that an agent follows it.

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
3. Workflows that are not in the pipeline are standalone and install like any other skill.
4. Version 1 pipelines are linear. They have no branches.

Version 1 uses the pipeline only to describe the flow in `AGENTS.md`. It does not locate, track, or start work. Metafab does not enforce `stop`; it only writes the stop instruction into generated output.

### Required repository files

A workflow can depend on a file that does not belong in `.factory/`, such as an agent tool's configuration or a document the scripts read. `requires` lists those files. Each entry has:

| Key | Required | Meaning |
| --- | --- | --- |
| `path` | Yes | The file, relative to the directory that contains `.factory/`, with `/` separators |
| `description` | Yes | One line that says what the file is for. `import`, `update` and `check` show it |
| `template` | No | A file in `.factory/templates/`, written as a repository-relative path such as `.factory/templates/setup/opencode.json`. `import` and `update` can create a missing file from it |

A requirement names a file, never a directory. Metafab copies a template byte for byte; it does not fill in values. Metafab never changes, replaces or deletes a file that exists, and never runs a script to create one.

`build` ignores `requires`. `import` and `update` create missing files when a person agrees (see [Importing a fab](sharing.md#importing-a-fab)). `check` warns about each one that is missing, unless rule 12 or 13 already rejected the entry.

### YAML and frontmatter grammar

Metafab parses YAML as YAML 1.2. YAML documents and skill frontmatter must be mappings and must not contain duplicate mapping keys.

Aliases must not expand a document past 100 values. An alias counts as the anchor's use count times the count of the anchor's largest value, where the use count is one for the anchored node plus one for each alias to it. Aliases inside those values count the same way, so counts multiply through a chain of anchors instead of adding: two aliases to an anchor whose largest value counts 2 count 4, not 3. The error names the alias that crosses the limit. An alias that refers to its own anchor is also an error.

`factory.yaml` accepts only `format`, `name`, `description`, `pipeline`, and `requires`, and, with format 2, `env` and `skills`. Unknown fields are errors. Field values have these types:

- `format` is the integer `1` or `2`.
- `name` is a non-empty string that follows the factory name rule above.
- `description` is an optional non-empty, single-line string.
- `pipeline` is an optional list.
- `requires` is an optional list. An empty list and a null value (`requires:` with nothing after it) both mean the factory requires no files.

A string pipeline entry is a workflow name. A mapping pipeline entry must contain exactly one workflow name whose value is a mapping. In version 1 that option mapping can contain only `stop`, whose value is a non-empty, single-line string. Empty entries, unknown options, and duplicate workflow entries are errors.

Each `requires` entry is a mapping with `path` and `description`, and optionally `template`. All three are non-empty, single-line strings. Other keys, a missing `path` or `description`, and a duplicate key are errors.

Skill frontmatter follows the Agent Skills format and can contain tool-specific fields. Metafab applies these additional type rules:

- `name` and `description` are non-empty strings. `name` follows the name rules in [Validation](#validation). `description` is a single-line string.
Unknown skill frontmatter fields are preserved and are not errors.

## Validation

A factory is valid when all the following statements are true:

1. Every `SKILL.md` contains `name` and `description`.
2. Each skill name matches its directory name.
3. No skill directory contains another skill directory.
4. Every skill name is unique across the complete factory.
5. Skill names use only lowercase ASCII letters, digits, and hyphens. A name does not start or end with a hyphen, does not contain two consecutive hyphens, and is at most 64 characters.
6. YAML, frontmatter, and field values follow the grammar above.
7. `factory.yaml`, when present, contains `format` and `name`, and `format` is `1` or `2`.
8. Each pipeline entry names an existing workflow, and no workflow appears twice.
9. Pipeline entries use only the `stop` option. Reserved options are errors in version 1.
10. No factory skill name starts with `metafab`.
11. No `SKILL.md` sits directly in a reserved top-level directory: `workflows/`, `skills/`, `templates/`, `scripts/`, `scorers/`, `rules/` or `runtimes/` (see [Reserved names](#reserved-names)), such as `.factory/workflows/SKILL.md`. Those directories hold skills; they are not skills.
12. Each `requires` path is a safe repository path outside Metafab's own files. It is relative and uses `/` separators. It has no empty, `.` or `..` segment, no trailing `/`, no `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` or control character, no segment that ends in a dot or a space, no Windows device name (`CON`, `PRN`, `AUX`, `NUL`, `COM1` to `COM9`, `LPT1` to `LPT9`, with or without an extension), and no segment Git reads as `.git`. It is not one of these forbidden targets and not below one, nor a directory that holds one (`.claude`, `.agents`): `.factory`, `.claude/skills`, `.agents/skills`, and the root `AGENTS.md`, `CLAUDE.md`, `.gitignore` and `.gitattributes` (so `.gitignore/x`, `.claude/skills` itself and `.claude` itself are refused too, while `.claude/settings.json` is allowed). These comparisons ignore letter case. No two paths are equal when letter case is ignored, and no path is below another.
13. Each `requires` template starts with `.factory/templates/`, follows the path rules of rule 12 for the part after that prefix, and names an existing regular file. Its real path, with every link resolved at the template itself and in any parent directory, is inside `.factory/`. Its name is not `SKILL.md` in any letter case, and no directory from `.factory/templates/` down to the template's own directory holds an entry named `SKILL.md` in any letter case, so the template is never part of an installed skill. Directories whose name starts with `.` are checked the same way, although `build` ignores them.
14. `env` and `skills` appear only with `format: 2`, and a format 2 factory follows [Environments: Validation](environments.md#validation) rules 1 to 6: its variables, conditional skills, directives, conditions and switches are valid in every branch, and every import resolves inside `.factory/` without a loop.

`metafab check` reports each error with a file path, line number, and suggested fix.

In a format 1 factory, a directive line is text; `check` warns once per file that contains one.

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

Names that start with `metafab` belong to the Metafab tool. Version 1 rejects a factory skill whose name starts with `metafab`. Teams can use any other top-level name.
