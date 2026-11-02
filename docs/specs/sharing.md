# Sharing a factory

A **fab** is a factory packaged for reuse. Version 1 publishes fabs to npm, to a Git fab repository, or to both. `import` also accepts HTTPS tarballs and local paths.

`metafab import` copies a fab into a repository. The receiving team owns that copy and can edit any file.

`metafab update` merges a newer versioned upstream with those local edits. Updates from unversioned local paths and HTTPS tarballs replace upstream-owned files instead; see [Updating from an unversioned source](#updating-from-an-unversioned-source). A person reviews and commits the result.

## Safety model

Sharing follows these rules:

1. `.factory/` in the repository is the active factory.
2. A fab is copied into `.factory/`. It is not loaded from `node_modules` at runtime.
3. `import` and `update` change only the working tree. They never stage, commit, or push.
4. `publish` never changes the project repository. A Git publish commits and pushes only to the configured fab repository.
5. `update` uses a three-way merge for versioned sources. An update from an unversioned source replaces upstream-owned files and can discard edits to them. Git is the review and undo mechanism.
6. npm and Git act only as transport.
7. Metafab unpacks packages itself and never runs package scripts.

A repository does not need a `package.json` to use a fab. It needs Node.js only to run the Metafab CLI.

## Fab layout

A fab has this layout, in an npm package and in a fab repository:

```text
package.json         npm only
README.md
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
  "files": [".factory", "README.md"],
  "metafab": { "format": 1 },
  "license": "MIT"
}
```

Fab requirements:

- The fab must include `.factory/`. npm includes a dot directory when `files` names it.
- `metafab.yaml` and `README.md` must not appear in a published `.factory/`. The fab's README is at the fab root.
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

Configure one target or both. Both targets carry the same staged fab in the same published version: the `.factory/` tree after `publish.exclude`, and the README at its root. The npm target also carries a generated `package.json`; the Git target never does. When npm is a target, staging also leaves out the names `npm pack` never packs (see [Steps](#steps)), and reports each path it left out, so the Git fab then carries the same files as the npm tarball apart from `package.json`. A Git-only publish keeps those files. A path Git reads as a `.git` directory is refused when the Git target is configured. An npm-only publish leaves out only the case spellings of `.git` itself (`.git`, `.GIT`, and so on) with a warning, because `npm pack` never carries those, and refuses every other name Git reads as `.git`: one with trailing spaces or dots, with the code points HFS+ ignores, with a `:` stream suffix, or with the 8.3 short name `git~1`, any of which npm would pack.

The printed file list and total size describe the npm package when npm is a target, `package.json` included, and the Git fab when it is the only target.

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

`publish` fails when an excluded workflow is still named in the pipeline.

### Steps

The command performs these steps:

1. Run `metafab check` and stop if validation fails.
2. Create a temporary fab directory.
3. Copy `.factory/` into it, keeping file modes, without `metafab.yaml`, without `.factory/README.md`, and without configured paths. When npm is a target, also leave out the names `npm pack` never carries and report each path left out as a warning, so the Git fab then carries the same files as the npm tarball; a Git-only publish keeps those files. The names are `.DS_Store`, `.gitignore`, `.npmignore`, `.npmrc`, `npm-debug.log`, `._*`, `.*.swp`, `*.orig`, `.lock-wscript`, `.wafpickle-*`, `build/config.gypi`, and every `.git`, `.svn`, `.hg`, `CVS` and `archived-packages` directory. A link inside `.factory/` is copied as the content of its target, the same decision `build` makes; a link named `README.md` or `metafab.yaml` at the factory root is left out like a file of that name. A broken link, or one that points outside `.factory/`, stops the publish and names the path, even when its name is one npm would leave out. `.factory/README.md` may be a link that points outside `.factory/` because it is read as the fab README and never copied. Git cannot store a path with a `.git` component, so a publish to the Git target stops with exit code 4 and names the path. The match follows Git: case-insensitive, after the trailing spaces and dots NTFS and HFS ignore, after the code points HFS+ ignores entirely (a zero-width non-joiner, for example), after the `:` stream suffix NTFS drops, and including the 8.3 short name `git~1`. An npm-only publish leaves out only the case spellings of `.git` itself with a warning, because `npm pack` never carries them, and stops with exit code 4 on every other name Git reads as `.git` — differing only by trailing spaces or dots, by the code points HFS+ ignores, by a `:` stream suffix, or by the 8.3 short name `git~1` — because npm would pack it and Git would read it as `.git`.
4. Validate the staged `.factory/` against the [fab requirements](#fab-layout) and the factory rules again. Stop with exit code 4 and list the problems when an exclude emptied `.factory/`, left a file above the fab size limit, or broke a reference.
5. Add the README at the fab root, from `publish.readme`. See [Configuration](configuration.md#publish). A generated README describes the staged fab, so an excluded skill is not listed, and it names the source without credentials: a token in `publish.git` is never written to the published README.
6. For the npm target, build `package.json` from `publish` settings.
7. Print the file list and total size of the npm package when npm is a target, `package.json` included, or of the Git fab when it is the only target, and print the targets.
8. Stop without publishing when `--dry-run` is present.
9. Publish to each target, as described below.

`publish` releases to the Git target first, then npm. Before it changes any target, it confirms the version is new on every target:

- A target that already has the version with different content stops the whole publish. Nothing is published.
- A target that already has the version with identical content is skipped, and the remaining targets are published.

The Git target stages and compares the tag's tree with the staged fab using Git itself, with text conversion off: the clone gets `.git/info/attributes` containing `* -text -eol -filter -ident -working-tree-encoding`, and staging passes `core.autocrlf=false`. A fab's own `.gitattributes`, a clean filter, `ident` and the user's line-ending settings therefore cannot change the published bytes. The comparison checks path and blob id, so a file Git stored differently is reported by name, and the executable bit counts as a difference.

The skip is how a half-finished release is completed. When one target succeeds and a later one fails, fix the failure and run `metafab publish` again: the target that already has these bytes is skipped and the rest is published. Nothing is overwritten. When the content has to change, bump `publish.version` and publish again.

### npm target

1. Run `npm publish` in the temporary directory.
2. Add `--provenance` when the current CI system supports npm provenance. The generated `package.json` then also names `repository`, taken from the same CI environment, because npm requires it to match the provenance bundle.
3. Pass `--tag` as the npm dist-tag.

Metafab uses the npm registry and credentials already configured for `npm`. It does not store registry tokens.

### Git target

A fab repository holds published output only. Do not edit it directly. Its history is a list of releases.

1. Clone `publish.git` into a temporary directory and check out `publish.branch`. An empty repository starts that branch.
2. Skip the target when tag `v<version>` already carries the same content, and stop the publish when it carries different content. The comparison stages the temporary fab the same way the publish does, with the ignore rules and text conversion off and blob ids compared, so a file Git's ignore rules would skip or a filter would change cannot make a lossy tag look identical.
3. Stop with exit code 5 when the branch head is not a commit tagged by an earlier `publish`. This protects edits made directly in the fab repository.
4. Replace every tracked file with the contents of the temporary fab directory. Staging bypasses Git's ignore rules (`git add --force`), so a fab's own `.gitignore` and the user's exclude file never decide what a release carries. After staging, Metafab compares the index with the temporary fab by path and blob id (`git ls-files -s` against `git hash-object --no-filters`), and fails the Git target with exit code 4, naming the paths in the reported problems, when Git did not stage a fab file, stored different bytes for it, or staged one the fab does not have. A path `git add` itself rejects is reported the same way, with exit code 4 and the path named.
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

Renaming a skill is a major change because receiving teams can refer to or invoke it by name.

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

Metafab also reads `ssh://` URLs and the scp form `git@example.com:fab-acme.git` as Git sources. A plain `https://` URL is always an HTTPS tarball, even when it ends in `.git`; use `git+https://` for a Git repository. A recorded `source` never contains a password, a token, or an HTTPS query string.

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

### Versioned and unversioned sources

npm packages and Git repositories are **versioned** sources. Metafab can download any earlier version again, so `update` can merge.

HTTPS tarballs and local paths are **unversioned** sources. Metafab cannot download the earlier version, so `update` overwrites `.factory/` with the current source files (see [Updating from an unversioned source](#updating-from-an-unversioned-source)).

## Importing a fab

```sh
metafab import <source> [--agents <list>] [--force] [--adopt]
```

The command performs these steps:

1. Resolve the source to an exact version or revision.
2. Download the source and verify its integrity when the source provides a hash.
3. Validate the fab and its factory.
4. Select the initial targets from `--agents` or with the same target-selection behaviour as `init`. Scan those destinations, compare existing skills with the incoming fab, report conflicts, and collect any consent required by the [existing-skill adoption](cli.md#adopt-existing-skills) rules. Complete this preflight before changing the repository.
5. Check that the build output can be written. Stop if the repository holds a file, link or directory at a path Metafab does not own.
6. When the repository has no `.factory/`, create `.factory/metafab.yaml` and add the Metafab lines to `.gitattributes`. Do not create placeholder `factory.yaml` or `AGENTS.md` files.
7. Move adopted skills into `.factory/skills/` as local additions and add each selected destination to the managed `.gitignore` block. A migrated skill that overlaps the incoming fab follows the normal conflict rule below.
8. Copy the factory into `.factory/`, except `metafab.yaml` and `README.md`.
9. Write the [upstream entry](#upstream-entry) to `metafab.yaml`.
10. Run `metafab build`.
11. Print a review summary.

A failure in steps 1 to 5 leaves the repository unchanged.

Metafab never copies `metafab.yaml` from a source. A Git source that is a project repository contains one, and it belongs to that project.

Fab validation rejects:

- Unknown factory format versions
- Paths that escape `.factory/`
- Paths that collide with `.factory/`, such as a case variant or a name ending in dots or spaces
- Links that point outside `.factory/`
- Links whose target does not exist
- Files larger than 1 MB
- More than 10,000 files, directories and links
- More than 64 MiB in total

A factory can have only one upstream fab. If `metafab.yaml` already contains an upstream entry, use `update` or `detach`.

`import` stops when the incoming fab would replace or remove different local content, and lists all conflicts. That is a different file, a link, a directory, or a local path that differs only in letter case. A case-only clash is refused on every filesystem, so `import` behaves the same everywhere. `--force` permits those replacements.

## Updating a fab

```sh
metafab update [--to <version|range|ref>] [--dry-run] [--no-build]
```

For a versioned source, the update uses three versions of each file:

- **Base:** The upstream version recorded in the upstream entry, downloaded again
- **Yours:** The current file in `.factory/`
- **Theirs:** The selected new upstream version

The command performs these steps:

1. Resolve `--to`, or select a newer version as the requested range or [Git ref](#git-refs) allows.
2. Stop without changes when no newer version exists.
3. Download the base and new upstream versions.
4. Merge each path into `.factory/`, except `metafab.yaml`.
5. Update the resolved version and revision fields in the upstream entry, including when the merge has conflicts. The selected new upstream is the base for future updates after those conflicts are resolved.
6. When the merge has no conflicts, run `metafab build` unless `--no-build` is present. Do not build conflicted source.
7. Print a review summary.

Downloads use `~/.metafab/cache/`.

`--dry-run` reports planned changes and conflicts without writing files.

An update never creates a commit. When `update` runs `build`, the installed skills in the working tree change immediately. A conflicted update does not build, and `--no-build` skips it. Review the update before starting agent work in that working tree, or update on a separate branch.

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

Metafab compares text files with CRLF line endings treated as LF. A change of line endings alone is not a change.

If the base version is unavailable, Metafab treats every difference between yours and theirs as a conflict. For example, a Git base is unavailable when its commit was removed by a force push.

After a conflicted update, `metafab check` fails while either condition remains:

- A file contains conflict markers.
- A `.upstream` file exists.

`metafab update` refuses to start while either condition remains. Resolve every marker and `.upstream` file, run `metafab build`, and then run `metafab check` before updating again. This prevents a second update from treating unresolved merge output as local edits against the newly recorded base.

### Updating from an unversioned source

For an HTTPS tarball or a local path, `update` does not merge. This operation is intentionally destructive for files that also exist in the source:

1. Download or read the current source.
2. Copy every source file into `.factory/`, replacing the local file. Files that exist only locally are kept.
3. Run `metafab build` unless `--no-build` is present.
4. Print a review summary.

Local edits to replaced files are lost from the working tree. Use `git diff` to review the result, and restore the edits you want to keep from Git. `--to` is not accepted for an unversioned source.

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
  M skills/git-conventions/SKILL.md        +3 -1

Local edits preserved
  workflows/build-slice/SKILL.md

Conflicts: 1
  C workflows/plan-feature/SKILL.md        Resolve markers, then run metafab build and metafab check

Nothing was committed. Review the changes with git diff.
```

The summary uses this order:

1. Files under `scripts/`, executable files, and non-Markdown files in skill directories
2. `AGENTS.md` and `factory.yaml`
3. Workflows
4. Skills
5. Other files, such as templates
6. Preserved local edits
7. Conflicts

The summary also calls out:

- Changes to a skill's `allowed-tools` field

`--json` returns the same information as structured data.

## Comparing local edits

```sh
metafab diff [<path>]
```

This command downloads the version recorded in the upstream entry and compares `.factory/` with it. For an unversioned source, it compares with the current source.

Use the optional path to limit the comparison. Teams can use this diff when proposing a local change to the upstream fab.

## Detaching from an upstream

```sh
metafab detach
```

This command removes the upstream entry from `metafab.yaml`. It does not change factory files.

After detachment, the factory has no upstream and `metafab update` has nothing to update.

## Upstream entry

`import` records where the factory came from in the `upstream` key of `.factory/metafab.yaml`. Commit it with the factory. Do not edit it manually.

Only `import`, `update`, and `detach` change this key. They preserve the rest of `metafab.yaml`, including comments.

With an npm source:

```yaml
upstream:
  source: "@seasb/fab-mark4"
  requested: ^1.2.0
  version: 1.2.0
```

With a Git source:

```yaml
upstream:
  source: github:seasb/fab-mark4
  requested: ^1.2.0
  version: 1.2.0
  commit: 3f9c2e1a7b4d0c8e5f6a2b1c9d8e7f6a5b4c3d2e
```

With an unversioned source:

```yaml
upstream:
  source: ../platform/.factory
```

| Field | npm source | Git source | Unversioned source |
| --- | --- | --- | --- |
| `source` | Package name | Source without its ref | Path or URL |
| `requested` | Requested version or range | Requested range, tag, branch, or commit | Absent |
| `version` | Exact version | Version from the tag. Absent when no version tag applies | Absent |
| `commit` | Absent | Full commit SHA | Absent |

The recorded version is the base for `update` and `diff`. Metafab downloads it again when it needs it, and keeps downloads in `~/.metafab/cache/`. npm versions cannot change, and a Git commit SHA identifies its content, so no file hashes are recorded.

## Open questions

- Should the merge handle YAML frontmatter fields separately from Markdown body text?
- Is npm provenance sufficient, or should projects configure trusted fab publishers?
- How should an organisation update one fab across many repositories?
