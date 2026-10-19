# Metafab v1 specifications

Metafab records a software factory in a repository. A factory defines how people and agents do work in that repository.

Version 1 has four responsibilities:

1. Store the factory in an open `.factory/` format.
2. Install the factory into supported agent tools.
3. Validate the factory and its installed files.
4. Share the factory as a fab, published to npm or a Git repository.

The design comes from [Mark IV](../mk4/), but v1 excludes its monitoring and runtime features.

## Specifications

| File | Scope |
| --- | --- |
| [Factory format](factory-format.md) | The contents and validation rules of `.factory/` |
| [Building](building.md) | How `metafab build` installs a factory for agent tools |
| [Sharing](sharing.md) | How teams publish, import, update, and detach fabs |
| [CLI](cli.md) | Commands, JSON output, and exit codes |
| [Configuration](configuration.md) | Every key in `.factory/metafab.yaml` |

## Architecture

Metafab uses three layers.

| Layer | Definition | Owner |
| --- | --- | --- |
| Agent formats | `AGENTS.md` for standing instructions and `<name>/SKILL.md` for Agent Skills | Existing open formats and agent tools |
| Factory format | An organised `.factory/` directory of skills, with a pipeline and skill dependencies | This specification |
| Metafab | A CLI that creates, validates, installs, and shares factories | The Metafab project |

A team can use the factory format without the Metafab CLI. Every `SKILL.md` in `.factory/` remains a standard Agent Skill.

Metafab installs factory parts as follows:

| Factory part | Installed form |
| --- | --- |
| Workflow | Agent Skill and workflow entry in `AGENTS.md` |
| Skill | Agent Skill |
| Skill dependencies (`uses`) | Compiled into each installed skill, as a reference or inline |
| Standing instructions | Text in the generated factory block in `AGENTS.md` |
| Pipeline (`factory.yaml`) | Ordered workflow list in the generated factory block in `AGENTS.md` |
| Template | Not installed. Workflows use its repository path |
| Script | Not installed. Workflows use its repository path |

`metafab build` compiles `.factory/` like source code. The installed skills are build output: plain Agent Skills with dependencies resolved and factory-only fields removed. A team can therefore use a factory as a skill bundler, even if it never publishes a fab.

## Terminology

- **Factory:** The `.factory/` directory in a repository.
- **Fab:** A factory published for reuse, as an npm package such as `@seasb/fab-mark4` or a Git fab repository such as `github:seasb/fab-mark4`.
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

## Deferred features

Version 1 does not include these Mark IV features:

- Scorers as a separate part type. A team can write a scoring skill in `skills/`
- Rules as a separate part type. Rules go in `.factory/AGENTS.md`
- Stages and decisions. The pipeline lists workflows, and `stop` marks where a person decides
- Stage queries with `find` and `where`
- `metafab work`
- Run records and `metafab run`
- Score records and `metafab score`
- History links and the Git ledger
- The monitor application
- Fab Cloud

Version 1 also excludes skill dependencies on other fabs. `uses` names only skills in the same factory.

The format reserves `scorers/`, `rules/`, and `runtimes/`, and the pipeline options `stage`, `find`, and `where`. Future versions can add these features without changing existing factories.

## Example

Create a factory from a published fab:

```sh
cd my-repo
npx @seasb/metafab import @seasb/fab-mark4 --agents claude,codex
git add .factory AGENTS.md CLAUDE.md .claude .agents
git commit -m "Add the mark4 factory"
```

Update it later:

```sh
npx @seasb/metafab update
git diff
npx @seasb/metafab check
git commit -am "Update the mark4 factory to 1.3.0"
```

`update` changes the working tree and prints a review summary. It does not create a commit.

## Open questions

- Which project directory should the `cursor` target use for skills?
- Do agents reliably read the files listed in a `reference` section before they start? Test this in each target. If not, more skills need `inline`.
- Is `reference` the right default for `bundle`, or do most small skills want `inline`?
- Do teams need more than one upstream fab, such as a base fab plus a shared skill fab?
- Do pipelines need branches, such as a bug path and a feature path?
