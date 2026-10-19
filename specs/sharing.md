# Sharing a factory

A **fab** is a factory packaged for reuse. Version 1 distributes fabs through npm and also accepts Git, HTTPS, and local sources.

`metafab add` copies a fab into a repository. The receiving team owns that copy and can edit any file.

`metafab update` merges a newer upstream version with those local edits. A person reviews and commits the result.

## Safety model

Sharing follows these rules:

1. `.factory/` in the repository is the active factory.
2. A fab is copied into `.factory/`. It is not loaded from `node_modules` at runtime.
3. `add` and `update` change only the working tree. They never stage, commit, or push.
4. `update` uses a three-way merge to preserve local edits.
5. npm acts only as a package registry and transport.
6. Metafab unpacks packages itself and never runs package scripts.

A repository does not need a `package.json` to use a fab. It needs Node.js only to run the Metafab CLI.

## Fab package format

An npm fab has this layout:

```text
package.json
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

`.factory/` in a package is the same directory as `.factory/` in a repository. A fab has one location in every source.

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

Package requirements:

- `metafab.format` identifies the factory format version.
- The package must include `.factory/`. npm includes a dot directory when `files` names it.
- `metafab.yaml` and `metafab.lock` must not appear in the packaged `.factory/`.
- The `metafab` keyword makes the package discoverable with `npm search keywords:metafab`.

Anyone can publish a fab. Recommended names are `fab-<name>` and `@<scope>/fab-<name>`.

The Metafab project publishes its own fabs under `@seasb/`.

## Publishing

```sh
metafab publish [--dry-run] [--tag <tag>]
```

Run this command in the repository that contains the source `.factory/`.

### Publishing from a project repository

A fab does not need its own repository. Publish it from the project repository whose factory you use every day:

1. Keep working in `.factory/` as usual.
2. Add a `publish` section to `metafab.yaml` once.
3. Run `metafab publish` when you want to release.

`publish` builds the package in a temporary directory. It does not add `package.json` or any other file to the project repository. Use `publish.exclude` to keep project-specific skills out of the fab.

### Steps

The command performs these steps:

1. Run `metafab check` and stop if validation fails.
2. Create a temporary package directory.
3. Build `package.json` from `publish` settings in `metafab.yaml`.
4. Copy `.factory/` into the package directory.
5. Exclude `metafab.yaml`, `metafab.lock`, and configured paths.
6. Print the package files and total size.
7. Stop without publishing when `--dry-run` is present.
8. Run `npm publish` in the temporary directory.
9. Add `--provenance` when the current CI system supports npm provenance.

Example configuration:

```yaml
publish:
  name: "@seasb/fab-mark4"
  version: 1.2.0
  exclude:
    - skills/our-api/**
    - workflows/deploy-production/**
```

[Configuration](configuration.md#publish) defines every `publish` key, including `readme`, `license`, and `access`.

`publish` fails when an excluded skill is still named in a published `uses` list or in the pipeline.

Metafab uses the npm registry and credentials already configured for `npm`. It does not store registry tokens.

### Version policy

Use semantic versions as follows:

| Change | Version |
| --- | --- |
| Remove or rename a workflow or skill | Major |
| Add a workflow, skill, template, or script, or change the pipeline | Minor |
| Change existing text without changing names | Patch |

Renaming a skill is a major change because receiving teams can name it in their own `uses` lists.

After npm's 72-hour unpublish window, a published version cannot be removed. Deprecate a bad version and publish a fix.

`metafab update` warns when the selected version is deprecated.

## Supported sources

`metafab add` accepts these source forms:

| Source | Example | Retrieval method |
| --- | --- | --- |
| npm package | `@seasb/fab-mark4@^1.2.0` | npm registry with the user's `.npmrc` configuration |
| GitHub repository | `github:acme/factory#v3` | Git |
| HTTPS tarball | `https://example.com/fab-acme-1.0.0.tgz` | HTTPS |
| Local path | `../platform/.factory` or `file:../fab-acme` | Local file system |

Every source stores the factory in `.factory/`. For a Git repository, HTTPS tarball, or `file:` package, Metafab reads `.factory/` at its root. A local path can also name a `.factory/` directory directly.

Metafab fetches Git sources with Git. It does not use npm for them because npm can run a Git package's `prepare` script.

## Adding a fab

```sh
metafab add <source> [--force]
```

The command performs these steps:

1. Resolve the source to an exact version or revision.
2. Download the source and verify its integrity when the source provides a hash.
3. Validate the package and its factory.
4. Copy the factory into `.factory/`.
5. Write the source, version, integrity, and file hashes to `metafab.lock`.
6. Run `metafab link`.
7. Print a review summary.

Package validation rejects:

- Unknown factory format versions
- Paths that escape `.factory/`
- Links that point outside `.factory/`
- Files larger than 1 MB

A factory can have only one upstream fab. If `metafab.lock` already contains an upstream, use `update` or `detach`.

If the incoming fab would replace a different local file, `add` stops and lists all conflicts. `--force` permits those replacements.

`metafab init --from <source>` runs `init` and then `add <source>`.

## Updating a fab

```sh
metafab update [--to <version|range>] [--dry-run] [--no-link]
```

The update uses three versions of each file:

- **Base:** The upstream version recorded in `metafab.lock`
- **Yours:** The current file in `.factory/`
- **Theirs:** The selected new upstream version

The command performs these steps:

1. Resolve `--to`, or select the newest version allowed by the original requested range.
2. Stop without changes when no newer version exists.
3. Download and verify the base and new upstream versions.
4. Merge each path into `.factory/`.
5. Update the upstream version and file hashes in `metafab.lock`.
6. Run `metafab link` unless `--no-link` is present.
7. Print a review summary.

Downloads use `~/.metafab/cache/`.

`--dry-run` reports planned changes and conflicts without writing files.

An update never creates a commit. Because `update` runs `link`, the installed skills in the working tree change immediately. Review the update before starting agent work in that working tree, or update on a separate branch.

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

If the base version is unavailable, Metafab treats every difference between yours and theirs as a conflict.

After a conflicted update, `metafab check` fails while either condition remains:

- A file contains conflict markers.
- A `.upstream` file exists.

### Review summary

`add` and `update` group changes by risk instead of printing one long file list.

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

`add`, `update`, and `link` write it. `detach` removes its upstream entry.

Example:

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
  "linked": {
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

Lock file rules:

- `upstream` is absent when the factory has no upstream fab.
- `upstream.files` records the upstream hash for each copied file.
- These hashes define the base for `update`, `diff`, and local edit detection.
- `linked` records every path created by `link`, with the hash of its compiled contents.
- Metafab changes or removes only paths recorded in `linked`.
- Upstream file paths are relative to `.factory/`.
- Linked paths are relative to the repository root.

## Open questions

- Should the merge handle YAML frontmatter fields separately from Markdown body text?
- Is npm provenance sufficient, or should projects configure trusted fab publishers?
- How should an organisation update one fab across many repositories?
