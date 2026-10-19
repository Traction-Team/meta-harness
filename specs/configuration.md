# Configuration

Metafab reads repository settings from `.factory/metafab.yaml`. This file is committed.

`metafab.yaml` is a tool file. It is not part of the open [factory format](factory-format.md), and `publish` never includes it in a fab. Factory content belongs in `factory.yaml`. Upstream and installed output state belongs in `metafab.lock`.

## Example metafab.yaml

```yaml
agents: [claude, codex]
metafab-skill: true

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
```

Every key is optional. A missing file is the same as an empty file.

## Top-level keys


| Key             | Type                      | Default                                                   | Meaning                                                                                                 |
| --------------- | ------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `agents`        | List of targets, or `all` | Selected on the first `link`, or `all` without a terminal | Agent tools that `link` installs for. See [Target selection](linking.md#target-selection)               |
| `metafab-skill` | Boolean                   | `true`                                                    | Install the built-in `metafab` skill. See [Built-in `metafab` skill](linking.md#built-in-metafab-skill) |
| `publish`       | Map                       | None                                                      | Fab settings for `metafab publish`. Required only to publish                                            |


Version 1 targets are `claude`, `codex`, `cursor`, and `opencode`.

## `publish`


| Key           | Type                     | Required        | Target | Meaning                                                                                |
| ------------- | ------------------------ | --------------- | ------ | -------------------------------------------------------------------------------------- |
| `name`        | String                   | `name` or `git` | npm    | npm package name, such as `@seasb/fab-mark4`. Enables the npm target                   |
| `git`         | Git URL                  | `name` or `git` | Git    | Fab repository URL, such as `git@github.com:seasb/fab-mark4.git`. Enables the Git target |
| `branch`      | String                   | No              | Git    | Fab repository branch. Defaults to the repository's default branch, or `main` when empty |
| `version`     | Semantic version         | Yes             | Both   | Version to publish. See [Version policy](sharing.md#version-policy)                    |
| `description` | String                   | No              | npm    | Package description. Defaults to `description` in `factory.yaml`                       |
| `license`     | SPDX identifier          | No              | npm    | Package license. Omitted when absent                                                   |
| `access`      | `public` or `restricted` | No              | npm    | npm access. Defaults to `public`, so a scoped fab is public unless restricted          |
| `readme`      | Repository-relative path | No              | Both   | Fab README. Defaults to `.factory/README.md`, then a generated README                  |
| `keywords`    | List of strings          | No              | npm    | Extra npm keywords. `publish` always adds `metafab`                                    |
| `exclude`     | List of globs            | No              | Both   | Paths to leave out of the fab, relative to `.factory/`                                 |


For the npm target, `publish` writes `package.json` from these keys. It also sets `files` to `[".factory", "README.md", "CHANGELOG.md"]` and `metafab.format` to the factory format version. These two fields cannot be configured.

For the Git target, `publish` writes no `package.json`. The fab repository tags each release `v<version>`. See [Git target](sharing.md#git-target).

## Command-line overrides

A command-line flag overrides the file for one command:


| Flag                   | Overrides                                |
| ---------------------- | ---------------------------------------- |
| `link --agents <list>` | `agents`                                 |
| `publish --tag <tag>`  | The npm dist-tag. It has no file setting |


`link --save` writes the `--agents` selection to `agents`. No other command writes `metafab.yaml`.

## Validation

`metafab check` reports an error when:

1. The file is not valid YAML.
2. A key is unknown. The error suggests the closest known key.
3. A value has the wrong type.
4. `agents` names an unknown target.
5. `publish` is present without `version`, or without either `name` or `git`.
6. `publish.name` is not a valid npm package name.
7. `publish.git` is not a Git URL.
8. `publish.branch` is present without `publish.git`.
9. `publish.version` is not a semantic version.
10. `publish.readme` names a file that does not exist.

