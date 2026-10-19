# Metafab v1 specifications

Metafab records a software factory in a repository. A factory defines how people and agents do work in that repository.

Version 1 has four responsibilities:

1. Store the factory in an open `.factory/` format.
2. Install the factory into supported agent tools.
3. Validate the factory and its installed files.
4. Share the factory as an npm package called a fab.

The design comes from [Mark IV](../mk4/), but v1 excludes its monitoring and runtime features.

## Specifications

| File | Scope |
| --- | --- |
| [Factory format](factory-format.md) | The contents and validation rules of `.factory/` |
| [Linking](linking.md) | How `metafab link` installs a factory for agent tools |
| [Sharing](sharing.md) | How teams publish, add, update, and detach fabs |
| [CLI](cli.md) | Commands, configuration, JSON output, and exit codes |

## Architecture

Metafab uses three layers.

| Layer | Definition | Owner |
| --- | --- | --- |
| Agent formats | `AGENTS.md` for standing instructions and `<name>/SKILL.md` for Agent Skills | Existing open formats and agent tools |
| Factory format | An organised `.factory/` directory that contains skills and process files | This specification |
| Metafab | A CLI that creates, validates, installs, and shares factories | The Metafab project |

A team can use the factory format without the Metafab CLI. Every `SKILL.md` in `.factory/` remains a standard Agent Skill.

Metafab installs factory parts as follows:

| Factory part | Installed form |
| --- | --- |
| Workflow | Agent Skill and workflow entry in `AGENTS.md` |
| Scorer | Agent Skill |
| Skill | Agent Skill |
| Rule | Text in the generated factory block in `AGENTS.md` |
| Standing instructions | Text in the generated factory block in `AGENTS.md` |
| Stages and decisions | Flow summary in the generated factory block in `AGENTS.md` |
| Template | Not installed. Workflows use its repository path |
| Script | Not installed. Workflows use its repository path |

## Terminology

- **Factory:** The `.factory/` directory in a repository.
- **Fab:** A factory published for reuse, usually as an npm package such as `@seasb/fab-mark4`.
- **Metafab:** The product and its `metafab` CLI, published as `@seasb/metafab`.
- **Upstream fab:** The fab from which a factory was copied. A factory has zero or one upstream fab.

## Version 1 scope

Version 1 supports this workflow:

1. `metafab init` or `metafab create` creates factory files.
2. A person or agent edits those files.
3. `metafab link` installs the factory for the selected agent tools.
4. `metafab check` validates the source files and installed output.
5. `metafab publish` publishes a factory as a fab.
6. `metafab add` copies a fab into another repository.
7. `metafab update` merges a newer fab version into that copy.

Metafab does not stage, commit, or push changes. A person reviews and commits every factory change.

## Deferred features

Version 1 does not include these Mark IV features:

- Stage queries with `find` and `where`
- `metafab work`
- Run records and `metafab run`
- Score records and `metafab score`
- History links and the Git ledger
- The monitor application
- Fab Cloud

The format reserves `find` and `where` so future versions can add stage queries without changing existing factories.

## Example

Create a factory from a published fab:

```sh
cd my-repo
npx @seasb/metafab init --from @seasb/fab-mark4 --agents claude,codex
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

- Should workflow and scorer metadata use top-level frontmatter fields or an Agent Skills `metadata` object?
- Which project directory should the `cursor` target use for skills?
- Does the copy fallback work correctly on Windows systems without symlink support?
- Do teams need more than one upstream fab, such as a base fab plus a shared skill fab?
