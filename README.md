# @seasb/metafab

Metafab records a software factory in a repository. `.factory/` holds the skills, workflows and templates that define how a team works, `metafab build` installs them for the agent tools in use, `metafab check` validates them, and `metafab publish` shares the factory as a fab that another repository can import and update.

It requires Node.js 20 or later. Git is required only for Git-based fab sources.

## Install

| Installation | Command | Use |
| --- | --- | --- |
| None | `npx @seasb/metafab <command>` | Evaluation and non-Node.js repositories |
| Project dependency | `npm install --save-dev @seasb/metafab`, then `npx metafab <command>` | Projects that pin the CLI version |
| pnpm | `pnpm dlx @seasb/metafab <command>` | Projects that use pnpm |
| Bun | `bunx @seasb/metafab <command>` | Projects that use Bun |

Use the scoped package name with `npx`. The unscoped `metafab` package is unrelated.

## Quick start

In a repository, create a factory from a published fab:

```sh
npx @seasb/metafab import @seasb/fab-basic --agents claude,codex --setup
git add .factory AGENTS.md .gitignore .gitattributes opencode.json orca.yaml docs/
git commit -m "Add the fab-basic factory"
```

`--setup` creates the repository files the fab's workflows need from its templates. If the repository already has a `CLAUDE.md`, stage that too.

Update the factory later:

```sh
npx @seasb/metafab update
git diff
npx @seasb/metafab check
git commit -am "Update the fab-basic factory to 1.3.0"
```

`update` changes the working tree and prints a review summary. It does not create a commit.

## Documentation

- [Specifications](https://github.com/Traction-Team/meta-harness/blob/main/docs/specs/README.md): the acceptance standard for every change
- [CLI](https://github.com/Traction-Team/meta-harness/blob/main/docs/specs/cli.md): commands, JSON output and exit codes
- [Factory format](https://github.com/Traction-Team/meta-harness/blob/main/docs/specs/factory-format.md)
- [Building](https://github.com/Traction-Team/meta-harness/blob/main/docs/specs/building.md)
- [Sharing](https://github.com/Traction-Team/meta-harness/blob/main/docs/specs/sharing.md)
- [Configuration](https://github.com/Traction-Team/meta-harness/blob/main/docs/specs/configuration.md)
