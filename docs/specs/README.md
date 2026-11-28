# Metafab specifications

Metafab records a software factory in a repository. A factory defines how people and agents do work in that repository.

Version 1 has four responsibilities:

1. Store the factory in an open `.factory/` format.
2. Install the factory into supported agent tools.
3. Validate the factory and its installed files.
4. Share the factory as a fab: a Git repository by default, or an npm package.

Version 2 adds environments: one factory compiled for each developer's environment, so each agent reads only the instructions that apply to it ([Environments](environments.md)).

Version 1 installs files in the locations supported agent tools read. It does not run workflows, invoke an agent tool, or verify how an agent behaves after loading those files. Runtime execution and monitoring are outside the version 1 product boundary.

The design comes from [Mark IV](../../prototype/mk4/), but v1 excludes its monitoring and runtime features.

## Specifications

| File | Scope |
| --- | --- |
| [Factory format](factory-format.md) | The contents and validation rules of `.factory/` |
| [Building](building.md) | How `metafab build` installs a factory for agent tools |
| [Sharing](sharing.md) | How teams publish, import, update, and detach fabs |
| [CLI](cli.md) | Commands, JSON output, and exit codes |
| [Configuration](configuration.md) | Every key in `.factory/metafab.yaml` |
| [Environments](environments.md) | One factory compiled for each developer's environment: `env` variables, selection from Git config, `when`, `switch` and `import` directives, conditional skills, and `metafab env` |
| [Automations](automations.md) | Factory work that runs on its own: `.factory/automations/`, the run prompt and stub, and `metafab automations sync` into Orca and Amp |

### Version 2.1 (draft)

These specifications are drafts for approval. They serve the version 2.1 store plans, which ship the store after 2.0.0. Each plan lists the edits it makes to the specifications above.

| File | Scope |
| --- | --- |
| [Store](store.md) | Documents and scores in a shared store outside Git: document folders and their rules, the mirror, sync, scores, scorers, the remote, git and local backends, and `metafab store` and `metafab scorer` |
| [Store protocol](store-protocol.md) | The HTTP API a remote store implements, such as Metastore Cloud |

## Architecture

Metafab uses three layers.

| Layer | Definition | Owner |
| --- | --- | --- |
| Agent formats | `AGENTS.md` for standing instructions and `<name>/SKILL.md` for Agent Skills | Existing open formats and agent tools |
| Factory format | An organised `.factory/` directory of skills, with a pipeline | This specification |
| Metafab | A CLI that creates, validates, installs, and shares factories | The Metafab project |

A team can use the factory format without the Metafab CLI. Every `SKILL.md` in `.factory/` remains a standard Agent Skill.

Metafab installs factory parts as follows:

| Factory part | Installed form |
| --- | --- |
| Workflow | Agent Skill |
| Skill | Agent Skill |
| Standing instructions | Text in the generated factory block in `AGENTS.md` |
| Pipeline (`factory.yaml`) | Ordered workflow list in the generated factory block in `AGENTS.md` |
| Template | Not installed. Workflows use its repository path. A template named by `requires` in `factory.yaml` is copied by `import` and `update` to create a missing repository file (Plan 1.023) |
| Script | Not installed. Workflows use its repository path |

`metafab build` compiles `.factory/` like source code. The installed skills are generated copies of the source Agent Skills.

## Terminology

- **Factory:** The `.factory/` directory in a repository.
- **Fab:** A factory shared for reuse, as a Git repository such as `github:Traction-Team/fab-basic` or an npm package such as `@acme/fab-basic`.
- **Fab repository:** A Git repository that holds only published fab releases. `metafab publish` writes it.
- **Metafab:** The product and its `metafab` CLI, published as `@seasb/metafab`.
- **Upstream fab:** The fab from which a factory was copied. A factory has zero or one upstream fab.

## Version 1 scope

Version 1 supports this workflow:

1. `metafab init` or `metafab create` creates factory files.
2. A person or agent edits those files.
3. `metafab build` installs the factory for the selected agent tools.
4. `metafab check` validates the source files and installed output.
5. `metafab publish` publishes a factory as a fab.
6. `metafab import` copies a fab into another repository.
7. `metafab update` merges a newer fab version into that copy.

Metafab does not stage, commit, or push changes in the project repository. A person reviews and commits every factory change. Only `publish` pushes, and only to a configured fab repository.

Installed skill copies are ignored build output. After cloning a repository, run `metafab build` before using its factory with an agent tool.

## Deferred features

Version 1 does not include these Mark IV features:

- Scorers as a separate part type. A team can write a scoring skill in `skills/`
- Rules as a separate part type. Rules go in `.factory/AGENTS.md`
- Stages and decisions. The pipeline lists workflows, and `stop` marks where a person decides
- Stage queries with `find` and `where`
- `metafab work`
- Workflow execution or agent invocation
- Runtime verification of agent behaviour
- Run records and `metafab run`
- Score records and `metafab score`
- History links and the Git ledger
- The monitor application
- Fab Cloud

The format reserves `scorers/`, `rules/`, and `runtimes/`, and the pipeline options `stage`, `find`, and `where`. Future versions can add these features without changing existing factories.

## Example

Create a factory from a fab:

```sh
cd my-repo
npx @seasb/metafab import github:Traction-Team/fab-basic --agents claude,codex --setup
git add .factory .claude/agents AGENTS.md .gitignore .gitattributes opencode.json orca.yaml docs/
git commit -m "Add the fab-basic factory"
```

`--setup` creates the repository files the fab's workflows need from its templates, so the commit stages them. A repository that already has a `CLAUDE.md` stages that too.

Update it later:

```sh
npx @seasb/metafab update
git diff
npx @seasb/metafab check
git commit -am "Update the fab-basic factory to 0.2.x"
```

`update` changes the working tree and prints a review summary. It does not create a commit.

## Open questions

- Do teams need more than one upstream fab, such as a base fab plus a shared skill fab?
- Do pipelines need branches, such as a bug path and a feature path?
- Which commands must be transactional? In particular, should `build` and `import` preflight every write?
