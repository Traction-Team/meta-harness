# Configuration

Metafab reads repository settings from `.factory/metafab.yaml`. This file is committed.

`metafab.yaml` is a tool file. It is not part of the open [factory format](factory-format.md), and `publish` never includes it in a fab. Factory content belongs in `factory.yaml`.

`metafab.yaml` is the only Metafab file in the repository. Metafab has no lock file.

## Example metafab.yaml

```yaml
agents: [claude, codex]
metafab-skill: true
git-hooks: true

publish:
  name: "@seasb/fab-mark4"
  git: git@github.com:seasb/fab-mark4.git
  branch: main
  version: 1.2.0
  description: Plan, build, and review work in slices with a person at each decision.
  license: MIT
  access: public
  readme: docs/fab-readme.md
  keywords: [planning, review]
  exclude:
    - skills/our-api/**
    - workflows/deploy-production/**

# Written by metafab import. Do not edit.
upstream:
  source: "@seasb/fab-base"
  requested: ^2.0.0
  version: 2.1.0
```

Every key is optional. A missing file is the same as an empty file.

## Top-level keys


| Key             | Type                      | Default                                                   | Meaning                                                                                                 |
| --------------- | ------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `agents`        | List of targets, or `all` | Written by `init`. `all` when absent                      | Agent tools that `build` installs for. See [Target selection](building.md#target-selection)               |
| `metafab-skill` | Boolean                   | `true`                                                    | Install the built-in `metafab` skill. See [Built-in `metafab` skill](building.md#built-in-metafab-skill) |
| `git-hooks`     | Boolean                   | `false`. Written by `init`                                | Install Git hooks that run `metafab build` after a checkout, merge, or rebase. See [Git hooks](building.md#git-hooks) |
| `publish`       | Map                       | None                                                      | Fab settings for `metafab publish`. Required only to publish                                            |
| `upstream`      | Map                       | None                                                      | The fab this factory was imported from. Written by `import`, `update`, and `detach`. See [Upstream entry](sharing.md#upstream-entry) |


Version 1 targets are `claude`, `codex`, `cursor`, `opencode`, and `copilot`. `claude` installs to `.claude/skills/`. The other targets share `.agents/skills/`. See [Installed output](building.md#installed-output).

## `publish`


| Key           | Type                     | Required        | Target | Meaning                                                                                |
| ------------- | ------------------------ | --------------- | ------ | -------------------------------------------------------------------------------------- |
| `name`        | String                   | `name` or `git` | npm    | npm package name, such as `@seasb/fab-mark4`. Enables the npm target                   |
| `git`         | Git URL                  | `name` or `git` | Git    | Fab repository URL: `git@host:path`, `ssh://`, `https://` or `file://`, each also accepted with a `git+` prefix (except `git@host:path`). Example `git@github.com:seasb/fab-mark4.git`. Enables the Git target |
| `branch`      | String                   | No              | Git    | Fab repository branch. Defaults to the repository's default branch, or `main` when empty |
| `version`     | Semantic version         | Yes             | Both   | Version to publish. See [Version policy](sharing.md#version-policy)                    |
| `description` | String                   | No              | npm    | Package description. Defaults to `description` in `factory.yaml`                       |
| `license`     | SPDX identifier          | No              | npm    | Package license. Omitted when absent                                                   |
| `access`      | `public` or `restricted` | No              | npm    | npm access. Defaults to `public`, so a scoped fab is public unless restricted          |
| `readme`      | Repository-relative path | No              | Both   | Fab README, placed at the fab root. Defaults to `.factory/README.md`, then a generated README. `.factory/README.md` is never copied into the fab's `.factory/` |
| `keywords`    | List of strings          | No              | npm    | Extra npm keywords. `publish` always adds `metafab`                                    |
| `exclude`     | List of globs            | No              | Both   | Paths to leave out of the fab, relative to `.factory/`                                 |


For the npm target, `publish` writes `package.json` from these keys. It also sets `files` to `[".factory", "README.md"]` and `metafab.format` to the factory format version. These two fields cannot be configured.

For the Git target, `publish` writes no `package.json`. The fab repository tags each release `v<version>`. See [Git target](sharing.md#git-target).

## Editing the file

Edit `metafab.yaml` directly, then run `metafab build`. No command overrides it.

`init` creates `metafab.yaml` when the file does not exist. `init --agents` and `import --agents` set the initial `agents` value. `init` writes `git-hooks` when the key is absent; see [Set up a factory](cli.md#set-up-a-factory). After that, commands write only the `upstream` key, and they preserve the rest of the file, including comments. Do not edit `upstream` by hand.

`publish --tag` sets the npm dist-tag. It has no file setting.

## Validation

`metafab check` reports an error when:

1. The file is not valid YAML.
2. A key is unknown. The error suggests the closest known key.
3. A value has the wrong type.
4. `agents` names an unknown target.
5. `publish` is present without `version`, or without either `name` or `git`.
6. `publish.name` is not a valid npm package name.
7. `publish.git` is not a Git URL, or a `file://` URL that names a host rather than a path.
8. `publish.branch` is present without `publish.git`.
9. `publish.version` is not a semantic version.
10. `publish.readme` names a file that does not exist.
11. `upstream` is present without `source`, an npm upstream has no `version`, or a Git upstream has no `commit`.

