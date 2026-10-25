# Metafab v1 specifications

Metafab records a software factory in a repository. A factory defines how people and agents do work in that repository.

Version 1 has four responsibilities:

1. Store the factory in an open `.factory/` format.
2. Install the factory into supported agent tools.
3. Validate the factory and its installed files.
4. Share the factory as a fab, published to npm or a Git repository.

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
| Template | Not installed. Workflows use its repository path |
| Script | Not installed. Workflows use its repository path |

`metafab build` compiles `.factory/` like source code. The installed skills are generated copies of the source Agent Skills.

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

Create a factory from a published fab:

```sh
cd my-repo
npx @seasb/metafab import @seasb/fab-mark4 --agents claude,codex
git add .factory AGENTS.md .gitignore .gitattributes
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

- How do Cursor and Copilot behave when they find the same skill in `.agents/skills/` and `.claude/skills/`? Their documentation does not say. Test both. See [Duplicate skills](building.md#duplicate-skills).
- Do teams need more than one upstream fab, such as a base fab plus a shared skill fab?
- Do pipelines need branches, such as a bug path and a feature path?
- Which commands must be transactional? In particular, should `build` and `import` preflight every write, and how should `publish` report and recover when one target succeeds and another fails?
