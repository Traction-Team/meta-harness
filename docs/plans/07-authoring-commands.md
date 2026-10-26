---
title: "feat: create, pipeline and map commands"
status: merged
kind: feature
pr: 5
needs:
  - docs/plans/02-factory-model.md
owns:
  - src/core/edit/**
  - src/commands/create.ts
  - src/commands/pipeline-add.ts
  - src/commands/pipeline-remove.ts
  - src/commands/map.ts
  - test/core/edit/**
  - test/cli/cli.test.ts
  - test/cli/e2e.test.ts
  - src/cli.ts
proves: "npx vitest run test/core/edit → create and pipeline edits produce the expected files with comments preserved; map --json matches its snapshot"
---

# Plan 07: Authoring and inspection commands

Implement `create`, `pipeline add`, `pipeline remove`, and `map`.

`rename` was in the first version of this plan and was dropped during review of PR #5: a person renames a skill by moving its directory and changing `name`, and `check` reports a mismatch. `src/cli.ts` and `test/cli/e2e.test.ts` are in `owns` only to remove the command.

## Specs

- [CLI: Edit a factory](../specs/cli.md#edit-a-factory)
- [CLI: Inspect a factory](../specs/cli.md#inspect-a-factory)
- [Factory format: Pipeline](../specs/factory-format.md#pipeline)

## Design

All edit commands validate first, then write. None of them runs `build`; each prints `Run metafab build to install the change.`

### `create <path> [--description D]`

1. Normalise the path (forward slashes, no leading `.factory/`, no `..`, no absolute path).
2. The last segment is the name. Validate it with the Plan 02 name rules.
3. Refuse when any ancestor of the target is a skill directory, or when the target directory contains a skill directory.
4. Refuse when the name already exists anywhere in the factory.
5. Description: `--description`, else a terminal prompt, else exit 2. Reject empty and multi-line values.
6. Write:

   ```markdown
   ---
   name: review-slice
   description: <description>
   ---

   # Review slice
   ```

   The heading capitalises the first word and replaces hyphens with spaces.

The description is written as a YAML scalar with quoting when needed (use the `yaml` stringifier).

### `pipeline add <workflow> [--after <workflow>] [--stop S]`

- `<workflow>` must exist in `workflows/` and must not already be in the pipeline.
- `--after` must name a pipeline entry. Without it, append.
- `--stop` must be a non-empty single line. With `--stop`, write the flow-mapping form `- name: { stop: S }`.
- When `factory.yaml` does not exist, create it with `format: 1` and the derived name ([Plan 06](06-init-and-adoption.md)).

### `pipeline remove <workflow>`

Remove the entry. Error with a suggestion when it is not in the pipeline. The workflow files do not change.

### `map`

Human output:

```text
mark4 — Plan, build, and review work in slices with a person at each decision.

Pipeline
  1. file-work
  2. triage-ideas        stop: The product lead picks the next item
  ...

Standalone workflows
  hotfix

Skills
  skills/   git-conventions, test-conventions
  review/   security
```

JSON output:

```json
{
  "ok": true,
  "command": "map",
  "factory": { "name": "mark4", "description": "..." },
  "pipeline": [{ "workflow": "triage-ideas", "stop": "..." }],
  "standaloneWorkflows": ["hotfix"],
  "skills": [{ "name": "security", "group": "review", "path": ".factory/review/security", "frontmatter": { } }]
}
```

`skills` in JSON includes workflows too, so a consumer gets every path and frontmatter. `map` works on an invalid factory and includes the problems.

## Steps

- [x] Comment-preserving `factory.yaml` editor (add, insert after, remove entry)
- [x] `create`
- [x] `pipeline add` and `pipeline remove`
- [x] `map`

## Tests

- `create workflows/review-slice --description "..."` produces a file that passes `check` after `build`
- `create review/security` when `security` exists elsewhere fails; `create workflows/a/b` inside skill `a` fails
- `create` without description in non-TTY exits 2 and writes nothing
- `pipeline add x --after y --stop "..."` produces the expected YAML text exactly
- `map --json` matches a snapshot for the `mark4-like` fixture
