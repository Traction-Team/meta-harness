# @seasb/metafab

Metafab records a software factory in a repository. `.factory/` holds the skills, workflows and templates that define how a team works, `metafab build` installs them for the agent tools in use, `metafab check` validates them, and `metafab publish` shares the factory as a fab that another repository can import and update. A fab is a Git repository by default, or an npm package such as `@acme/fab-basic`.

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
npx @seasb/metafab import github:Traction-Team/fab-basic --agents claude,codex --setup
git add .factory .claude/agents AGENTS.md .gitignore .gitattributes opencode.json orca.yaml docs/
git commit -m "Add the fab-basic factory"
```

`--setup` creates the repository files the fab's workflows need from its templates, including the Claude Code sub-agents in `.claude/agents/`. If the repository already has a `CLAUDE.md`, stage that too.

Update the factory later:

```sh
npx @seasb/metafab update
git diff
npx @seasb/metafab check
git commit -am "Update the fab-basic factory to 0.2.x"
```

`update` changes the working tree and prints a review summary. It does not create a commit.

## Choosing what agents read

A format 2 factory can compile each instruction for the developer's environment. fab-basic declares two variables: `harness` (`opencode`, `claude` or `amp`) and `workspace` (`orca`, `orb` or `worktree`). Select yours once per repository:

```sh
npx @seasb/metafab env set harness=claude
npx @seasb/metafab env set workspace=worktree
```

`env set` writes `factory.env.<variable>` to the repository's Git config and rebuilds the installed skills, so each agent reads only the variants that apply to it. With nothing selected, every variant is installed, and each block that applies to only some values is labelled with where it applies. See [Environments](https://github.com/Traction-Team/meta-harness/blob/main/docs/specs/environments.md).

## Staying on 1.x

A fab whose factory is format 2 needs Metafab 2 or later; 1.x refuses it at `import` and `update`. On 1.x, import a fab release that is still format 1, such as `github:Traction-Team/fab-basic#semver:^0.1.0`:

```sh
npx @seasb/metafab@1 import github:Traction-Team/fab-basic#semver:^0.1.0 --agents claude,codex --setup
```

## Prereleases

`npx @seasb/metafab@next` installs the newest prerelease. Prereleases are published under the `next` npm dist-tag and never under `latest`, so `@next` can be older than `latest` between prereleases: today it is `2.0.0-next.1`.

## Documentation

- [Specifications](https://github.com/Traction-Team/meta-harness/blob/main/docs/specs/README.md): the acceptance standard for every change
- [CLI](https://github.com/Traction-Team/meta-harness/blob/main/docs/specs/cli.md): commands, JSON output and exit codes
- [Factory format](https://github.com/Traction-Team/meta-harness/blob/main/docs/specs/factory-format.md)
- [Building](https://github.com/Traction-Team/meta-harness/blob/main/docs/specs/building.md)
- [Sharing](https://github.com/Traction-Team/meta-harness/blob/main/docs/specs/sharing.md)
- [Configuration](https://github.com/Traction-Team/meta-harness/blob/main/docs/specs/configuration.md)
- [Environments](https://github.com/Traction-Team/meta-harness/blob/main/docs/specs/environments.md): variables, selection, conditional blocks and `metafab env`
