---
title: "feat: load and validate the factory format"
status: ready
kind: feature
pr:
needs:
  - docs/plans/01-foundation.md
owns:
  - src/core/factory/**
  - src/util/yaml.ts
  - src/util/frontmatter.ts
  - test/core/factory/**
  - test/fixtures/factories/**
proves: "npx vitest run test/core/factory → every validation-rule fixture reports exactly the expected problem, file and line"
---

# Plan 02: Factory model and validation

Load `.factory/` into an in-memory model and validate it against the version 1 factory format. Every other command reads the factory through this module.

## Specs

- [Factory format](../specs/factory-format.md), in particular [Validation](../specs/factory-format.md#validation) and [YAML and frontmatter grammar](../specs/factory-format.md#yaml-and-frontmatter-grammar)
- [Reserved names](../specs/factory-format.md#reserved-names)

## Design

### Model

```ts
interface Factory {
  root: string;                    // directory that contains .factory/
  dir: string;                     // <root>/.factory
  factoryYaml?: FactoryYaml;       // absent when factory.yaml is missing
  agentsMd?: string;               // contents of .factory/AGENTS.md (LF)
  skills: Skill[];                 // sorted by relative path
  problems: Problem[];             // load and validation problems
}

interface FactoryYaml {
  format: 1;
  name: string;
  description?: string;
  pipeline: PipelineEntry[];       // [] when absent
  doc: YAML.Document;              // kept for comment-preserving edits (Plan 07)
}

interface PipelineEntry { workflow: string; stop?: string; line: number }

interface Skill {
  name: string;                    // directory name
  relDir: string;                  // e.g. "workflows/build-slice", "review/security"
  group: string;                   // first path segment, e.g. "workflows", "review"
  isWorkflow: boolean;             // group === "workflows"
  frontmatter: Record<string, unknown>;
  frontmatterLines: { start: number; end: number };
  title?: string;                  // first "# " heading, used by map and review summary
}
```

`loadFactory(root)` never throws for invalid content. It records each problem and keeps loading, so `check` can report everything in one run.

### Skill discovery

1. Walk `.factory/` recursively. A directory that contains `SKILL.md` is a skill.
2. Continue walking inside a skill directory only to detect nested skills (rule 3). Report the nested one as an error and do not load it as a second skill.
3. A `SKILL.md` directly in `.factory/` is not a skill (it has no `<name>` directory). Report it as an error.
4. Skip `metafab.yaml`, `factory.yaml`, and `AGENTS.md` at the top level. Do not treat `templates/` or `scripts/` specially: a `SKILL.md` there is still a skill, as the core rule says.
5. Skip dot-directories such as `.git`. See open question 2.

### Frontmatter

- Accept a file that starts with `---` followed by a newline (LF or CRLF), and ends the block at the next line that is exactly `---`.
- Parse it with the shared YAML parser. Report the frontmatter line offset so errors point to the real line in `SKILL.md`.
- A missing or unterminated block is an error on line 1.

### YAML parser

`util/yaml.ts` wraps `yaml`:

- `version: "1.2"`, `uniqueKeys: true`, `prettyErrors: true`
- A `LineCounter` turns node offsets into line numbers
- The top-level value must be a mapping

### Validation rules

Each rule maps to one function so that tests can target it.

| # | Rule | Problem location | Fix text |
| --- | --- | --- | --- |
| 1 | `SKILL.md` has `name` and `description` | Frontmatter start | `Add a name: <dir> field` |
| 2 | `name` equals the directory name | `name` line | `Change name to '<dir>' or rename the directory` |
| 3 | No nested skills | Nested `SKILL.md` | `Move <path> out of <parent>` |
| 4 | Names unique across the factory | Second occurrence | `Rename one of: <paths>` |
| 5 | Names use `[a-z0-9-]` only | `name` line | Suggest a slugified name |
| 6 | Grammar: types, single-line `description` and `stop`, duplicate keys, unknown `factory.yaml` fields | Offending node | Closest known field for unknown keys |
| 7 | `factory.yaml` has `format` and `name`; `format` is the integer `1` | File line 1 or node | |
| 8 | Pipeline entries name an existing workflow; no duplicates | Entry line | "Did you mean" across workflow names; if the name is a non-workflow skill, say so |
| 9 | Pipeline options limited to `stop`; `stage`, `find`, `where` reported as reserved for a future version | Option line | |
| 10 | Factory skills do not use names that start with `metafab` (reserved for the tool and the built-in skill) | `name` line | |

Rule 10 is derived from [Reserved names](../specs/factory-format.md#reserved-names) and is needed so a factory skill can never collide with the built-in `metafab` skill. See open question 3.

Unknown skill frontmatter fields are preserved and never reported.

### API

```ts
loadFactory(root: string): Promise<Factory>
validateFactory(factory: Factory): Problem[]   // pure; loadFactory calls it
findSkill(factory, name): Skill | undefined
workflows(factory): Skill[]
```

## Steps

- [ ] `util/yaml.ts` with line numbers and the strict options
- [ ] Frontmatter splitter with CRLF support and line offsets
- [ ] Skill discovery walker
- [ ] `factory.yaml` parser and grammar checks, including the pipeline entry forms
- [ ] Validation rules 1 to 10, one function each
- [ ] Fixture factories under `test/fixtures/factories/`: `empty`, `mark4-like` (valid, with groups and a full pipeline), and one invalid fixture per rule

## Tests

- An empty `.factory/` is valid and has no skills
- A missing `factory.yaml` is valid; an empty `factory.yaml` reports missing `format` and `name`
- Each invalid fixture produces exactly the expected problem, with the right file and line
- `- review-slice: { stop: ... }` and `- build-slice` both parse
- `- {}`, `- review-slice: { stop: "" }`, a multi-line `stop`, and two workflow keys in one entry are errors
- `- review-slice: {}` follows the answer to open question 4
- A CRLF `SKILL.md` gives the same result as its LF version
- Unknown frontmatter fields such as `allowed-tools` survive load unchanged

## Open questions

1. Should names follow the stricter Agent Skills rules (no leading, trailing, or doubled hyphens; maximum 64 characters)? The v1 spec only restricts characters. Proposal: enforce the Agent Skills rules as errors, because installed skills must be valid Agent Skills, and update the spec.
2. Should dot-directories inside `.factory/` be skipped, and should `node_modules` be skipped? Proposal: skip every directory whose name starts with `.`.
3. Rule 10 is not in the spec's validation list. Add it to the spec, or limit it to the exact name `metafab`.
4. Is `- review-slice: {}` (an empty option mapping) valid? The grammar says the value "must be a mapping"; proposal: allow it.
