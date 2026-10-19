# Sharing a factory

A **fab** is a factory packaged for reuse. Version 1 publishes fabs to npm, to a Git fab repository, or to both. `import` also accepts HTTPS tarballs and local paths.

`metafab import` copies a fab into a repository. The receiving team owns that copy and can edit any file.

`metafab update` merges a newer upstream version with those local edits. A person reviews and commits the result.

## Safety model

Sharing follows these rules:

1. `.factory/` in the repository is the active factory.
2. A fab is copied into `.factory/`. It is not loaded from `node_modules` at runtime.
3. `import` and `update` change only the working tree. They never stage, commit, or push.
4. `publish` never changes the project repository. A Git publish commits and pushes only to the configured fab repository.
5. `update` uses a three-way merge to preserve local edits.
6. npm and Git act only as transport.
7. Metafab unpacks packages itself and never runs package scripts.

A repository does not need a `package.json` to use a fab. It needs Node.js only to run the Metafab CLI.

## Fab layout

A fab has this layout, in an npm package and in a fab repository:

```text
package.json         npm only
README.md
CHANGELOG.md         optional
.factory/
  factory.yaml
  AGENTS.md
  workflows/
  skills/
  templates/
  scripts/
```

`.factory/` in a fab is the same directory as `.factory/` in a repository. A fab has one location in every source.

Example `package.json`:

```json
{
  "name": "@seasb/fab-mark4",
  "version": "1.2.0",
  "description": "Plan, build, and review work in slices with a person at each decision.",
  "keywords": ["metafab", "factory"],
  "files": [".factory", "README.md", "CHANGELOG.md"],
  "metafab": { "format": 1 },
  "license": "MIT"
}
```

Fab requirements:

- The fab must include `.factory/`. npm includes a dot directory when `files` names it.
- `metafab.yaml` and `metafab.lock` must not appear in a published `.factory/`.
- In an npm package, `metafab.format` identifies the factory format version.
- In any other source, `format` in `.factory/factory.yaml` identifies it. A factory without `factory.yaml` is format 1.
- The `metafab` keyword makes an npm fab discoverable with `npm search keywords:metafab`.

Anyone can publish a fab. Recommended names are `fab-<name>` and `@<scope>/fab-<name>`, for npm packages and fab repositories alike.

The Metafab project publishes its own fabs under `@seasb/`.

## Publishing

```sh
metafab publish [--dry-run] [--tag <tag>]
```

Run this command in the repository that contains the source `.factory/`.

### Publishing from a project repository

A fab does not need a hand-maintained repository. Publish it from the project repository whose factory you use every day:

1. Keep working in `.factory/` as usual.
2. Add a `publish` section to `metafab.yaml` once.
3. Run `metafab publish` when you want to release.

`publish` builds the fab in a temporary directory. It does not add `package.json` or any other file to the project repository. Use `publish.exclude` to keep project-specific skills out of the fab.

### Targets

`publish` releases to every configured target:

| Target | Setting | Result |
| --- | --- | --- |
| npm | `publish.name` | An npm package |
| Git | `publish.git` | A commit and version tag in a fab repository |

Configure one target or both. One `publish` releases the same files and version to each.

Example configuration:

```yaml
publish:
  name: "@seasb/fab-mark4"
  git: git@github.com:seasb/fab-mark4.git
  version: 1.2.0
  exclude:
    - skills/our-api/**
    - workflows/deploy-production/**
```

[Configuration](configuration.md#publish) defines every `publish` key.

`publish` fails when an excluded skill is still named in a published `uses` list or in the pipeline.

### Steps

The command performs these steps:

1. Run `metafab check` and stop if validation fails.
2. Create a temporary fab directory.
3. Copy `.factory/` into it.
4. Exclude `metafab.yaml`, `metafab.lock`, and configured paths.
5. Add the README and `CHANGELOG.md`.
6. For the npm target, build `package.json` from `publish` settings.
7. Print the fab files, total size, and targets.
8. Stop without publishing when `--dry-run` is present.
9. Publish to each target, as described below.

Before it publishes to any target, Metafab confirms that the version is new on every target. It stops without publishing when any target already has the version.

### npm target

1. Run `npm publish` in the temporary directory.
2. Add `--provenance` when the current CI system supports npm provenance.
3. Pass `--tag` as the npm dist-tag.

Metafab uses the npm registry and credentials already configured for `npm`. It does not store registry tokens.

### Git target

A fab repository holds published output only. Do not edit it directly. Its history is a list of releases.

1. Clone `publish.git` into a temporary directory and check out `publish.branch`. An empty repository starts that branch.
2. Stop when tag `v<version>` already exists.
3. Stop with exit code 5 when the branch head is not a commit tagged by an earlier `publish`. This protects edits made directly in the fab repository.
4. Replace every tracked file with the contents of the temporary fab directory.
5. Commit with the message `Publish <version>`.
6. Create an annotated tag `v<version>` on that commit.
7. Push the branch and the tag.

Metafab uses the Git credentials already configured for `git`. It does not store tokens. A private fab repository shares a fab only with people who can read it.

`--tag` applies only to the npm target.

### Version policy

Use semantic versions as follows:

| Change | Version |
| --- | --- |
| Remove or rename a workflow or skill | Major |
| Add a workflow, skill, template, or script, or change the pipeline | Minor |
| Change existing text without changing names | Patch |

Renaming a skill is a major change because receiving teams can name it in their own `uses` lists.

A published version cannot be changed:

- After npm's 72-hour unpublish window, an npm version cannot be removed. Deprecate a bad version and publish a fix.
- Do not move or delete a Git version tag after it is pushed. Publish a fix as a new version.

`metafab update` warns when the selected npm version is deprecated.

## Supported sources

`metafab import` accepts these source forms:

| Source | Example | Retrieval method |
| --- | --- | --- |
| npm package | `@seasb/fab-mark4@^1.2.0` | npm registry with the user's `.npmrc` configuration |
| GitHub repository | `github:seasb/fab-mark4#v1.2.0` | Git |
| Other Git repository | `git+ssh://git@example.com/fab-acme.git` or `git+https://example.com/fab-acme.git` | Git |
| HTTPS tarball | `https://example.com/fab-acme-1.0.0.tgz` | HTTPS |
| Local path | `../platform/.factory` or `file:../fab-acme` | Local file system |

Every source stores the factory in `.factory/`. For a Git repository, HTTPS tarball, or `file:` package, Metafab reads `.factory/` at its root. A local path can also name a `.factory/` directory directly.

A Git source can be a fab repository or any project repository. A project repository shares its whole `.factory/`, because `publish.exclude` applies only to published fabs.

Metafab fetches Git sources with Git and the user's Git credentials. It does not use npm for them because npm can run a Git package's `prepare` script.

### Git refs

The part after `#` selects a Git version. Version tags are `v<version>` or `<version>`, such as `v1.2.0`.

| Ref | Example | `import` selects | `update` selects |
| --- | --- | --- | --- |
| None | `github:seasb/fab-mark4` | The newest version tag, recorded as the range `^<version>`. Without version tags, the default branch head | The newest tag in that range, or the new branch head |
| Range | `#semver:^1.2.0` | The newest tag in the range | The newest tag in the range |
| Version tag | `#v1.2.0` | That tag | Nothing. Use `--to` |
| Branch | `#main` | The branch head | The new branch head |
| Commit | `#3f9c2e1` | That commit | Nothing. Use `--to` |

`update --to` accepts a version, a range, or any Git ref for a Git source.

## Importing a fab

```sh
metafab import <source> [--agents <list>] [--force]
```

The command performs these steps:

1. Resolve the source to an exact version or revision.
2. Download the source and verify its integrity when the source provides a hash.
3. Validate the fab and its factory.
4. Run `metafab init` when the repository has no `.factory/`. `--agents` passes to `init`.
5. Copy the factory into `.factory/`, except `metafab.yaml` and `metafab.lock`.
6. Write the source, version, resolved revision, integrity, and file hashes to `metafab.lock`.
7. Run `metafab build`.
8. Print a review summary.

A failure in steps 1 to 3 leaves the repository unchanged.

Metafab never copies `metafab.yaml` or `metafab.lock` from a source. A Git source that is a project repository contains both, and they belong to that project.

Fab validation rejects:

- Unknown factory format versions
- Paths that escape `.factory/`
- Links that point outside `.factory/`
- Files larger than 1 MB

A factory can have only one upstream fab. If `metafab.lock` already contains an upstream, use `update` or `detach`.

If the incoming fab would replace a different local file, `import` stops and lists all conflicts. `--force` permits those replacements.

## Updating a fab

```sh
metafab update [--to <version|range|ref>] [--dry-run] [--no-build]
```

The update uses three versions of each file:

- **Base:** The upstream version recorded in `metafab.lock`
- **Yours:** The current file in `.factory/`
- **Theirs:** The selected new upstream version

The command performs these steps:

1. Resolve `--to`, or select a newer version as the requested range or [Git ref](#git-refs) allows.
2. Stop without changes when no newer version exists.
3. Download and verify the base and new upstream versions.
4. Merge each path into `.factory/`, except `metafab.yaml` and `metafab.lock`.
5. Update the upstream version and file hashes in `metafab.lock`.
6. Run `metafab build` unless `--no-build` is present.
7. Print a review summary.

Downloads use `~/.metafab/cache/`.

`--dry-run` reports planned changes and conflicts without writing files.

An update never creates a commit. Because `update` runs `build`, the installed skills in the working tree change immediately. Review the update before starting agent work in that working tree, or update on a separate branch.

### Merge rules

Metafab applies these rules to every path present in base, yours, or theirs:

| Yours | Theirs | Result |
| --- | --- | --- |
| Unchanged from base | Unchanged from base | Keep the file |
| Unchanged from base | Changed | Use theirs |
| Changed | Unchanged from base | Keep yours |
| Changed | Same change as yours | Keep the shared result |
| Changed | Different change | Merge lines and add conflict markers where changes overlap |
| New local file | No upstream file | Keep yours |
| No local file | New upstream file | Add theirs |
| New local file | Different new upstream file | Keep yours and write theirs to `<file>.upstream` |
| Unchanged from base | Removed | Remove the file |
| Changed | Removed | Keep yours and report the upstream removal |
| Removed | Unchanged from base | Keep it removed |
| Removed | Changed | Keep it removed and report the upstream change |

Metafab does not merge binary files line by line. For a binary conflict, it keeps yours and writes theirs to `<file>.upstream`.

If the base version is unavailable, Metafab treats every difference between yours and theirs as a conflict. For example, a Git base is unavailable when its commit was removed by a force push.

After a conflicted update, `metafab check` fails while either condition remains:

- A file contains conflict markers.
- A `.upstream` file exists.

### Review summary

`import` and `update` group changes by risk instead of printing one long file list.

Example:

```text
@seasb/fab-mark4 1.2.0 -> 1.3.0

Runs code on your machines: review first
  M scripts/next.mjs                       +14 -3
  A scripts/release.sh                     new, executable

Changes every agent session
  M AGENTS.md                              +6 -0
  M factory.yaml                           pipeline: finish-slice added after review-slice

Workflows
  A workflows/finish-slice                 Finish slice
  M workflows/review-slice/SKILL.md        +9 -4    allowed-tools changed

Skills
  M skills/git-conventions/SKILL.md        +3 -1    inline in: build-slice, review-slice, finish-slice

Local edits preserved
  workflows/build-slice/SKILL.md

Conflicts: 1
  C workflows/plan-feature/SKILL.md        Resolve markers, then run metafab check

CHANGELOG.md
  1.3.0  Adds finish-slice. Review-slice now checks test results.

Nothing was committed. Review the changes with git diff.
```

The summary uses this order:

1. Executable files and non-Markdown files in skill directories
2. `AGENTS.md` and `factory.yaml`
3. Workflows
4. Skills
5. Preserved local edits
6. Conflicts
7. New changelog entries

The summary also calls out:

- Changes to a skill's `allowed-tools` field
- Changes to `uses` lists
- The skills that include a changed skill, because one change to an inlined skill changes each of them

`--json` returns the same information as structured data.

## Comparing local edits

```sh
metafab diff [<path>]
```

This command compares `.factory/` with the base version recorded in `metafab.lock`.

Use the optional path to limit the comparison. Teams can use this diff when proposing a local change to the upstream fab.

## Detaching from an upstream

```sh
metafab detach
```

This command removes the upstream entry from `metafab.lock`. It does not change factory files.

After detachment, the factory has no upstream and `metafab update` has nothing to update.

## Lock file

`.factory/metafab.lock` records upstream and installed output state. Commit this file and do not edit it manually.

`import`, `update`, and `build` write it. `detach` removes its upstream entry.

Example with an npm upstream:

```json
{
  "lockVersion": 1,
  "upstream": {
    "source": "@seasb/fab-mark4",
    "requested": "^1.2.0",
    "version": "1.2.0",
    "resolved": "https://registry.npmjs.org/@seasb/fab-mark4/-/fab-mark4-1.2.0.tgz",
    "integrity": "sha512-YV31L5Ortk8lPC4RrKq7e...",
    "files": {
      "factory.yaml": "sha256-9f3c2e1...",
      "workflows/review-slice/SKILL.md": "sha256-41ab0c7...",
      "scripts/next.mjs": "sha256-c0de11a..."
    }
  },
  "output": {
    ".claude/skills/review-slice": {
      "from": ".factory/workflows/review-slice",
      "hash": "sha256-5d2a9e0..."
    },
    ".agents/skills/review-slice": {
      "from": ".factory/workflows/review-slice",
      "hash": "sha256-5d2a9e0..."
    },
    ".claude/skills/metafab": {
      "from": "@seasb/metafab@1.0.0",
      "hash": "sha256-77e0..."
    }
  }
}
```

The same `upstream` entry with a Git source:

```json
{
  "source": "github:seasb/fab-mark4",
  "requested": "^1.2.0",
  "version": "1.2.0",
  "resolved": "3f9c2e1a7b4d0c8e5f6a2b1c9d8e7f6a5b4c3d2e",
  "files": { "factory.yaml": "sha256-9f3c2e1..." }
}
```

Upstream fields:

| Field | npm source | Git source |
| --- | --- | --- |
| `source` | Package name | Source without its ref |
| `requested` | Requested version or range | Requested range, tag, branch, or commit |
| `version` | Exact version | Version from the tag, or the commit SHA when no version tag applies |
| `resolved` | Tarball URL | Full commit SHA |
| `integrity` | Registry hash | Absent. The commit SHA identifies the content |

Lock file rules:

- `upstream` is absent when the factory has no upstream fab.
- `upstream.files` records the upstream hash for each copied file.
- These hashes define the base for `update`, `diff`, and local edit detection.
- `update` fetches the base from `resolved`.
- `output` records every path created by `build`, with the hash of its compiled contents.
- Metafab changes or removes only paths recorded in `output`.
- Upstream file paths are relative to `.factory/`.
- Linked paths are relative to the repository root.

## Open questions

- Should the merge handle YAML frontmatter fields separately from Markdown body text?
- Is npm provenance sufficient, or should projects configure trusted fab publishers?
- How should an organisation update one fab across many repositories?
