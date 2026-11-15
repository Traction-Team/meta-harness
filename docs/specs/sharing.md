# Sharing a factory

A **fab** is a factory packaged for reuse. The usual way to share one is a Git repository with `.factory/` at its root and a version tag for each release. Version 1 can also publish fabs to npm. `import` also accepts HTTPS tarballs and local paths.

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
7. Metafab unpacks packages itself and never runs package scripts. `import` and `update` never run factory scripts either: they create a [required file](#creating-required-files) only by copying its template.

A repository does not need a `package.json` to use a fab. It needs Node.js only to run the Metafab CLI.

## Fab layout

A fab has this layout, in a Git repository and in an npm package:

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
- A format 2 fab needs Metafab 2 or later. Metafab 1 rejects it as an unknown format, with exit code 4.
- The `metafab` keyword makes an npm fab discoverable with `npm search keywords:metafab`.

Anyone can publish a fab. Recommended names are `fab-<name>` and `@<scope>/fab-<name>`, for npm packages and fab repositories alike.

The Metafab project shares its own fabs as Git repositories in the `Traction-Team` GitHub organization, such as `github:Traction-Team/fab-basic`, and also publishes them to npm under `@seasb/`.

## Sharing a Git repository

The simplest fab is a Git repository whose `.factory/` you already use. To release a version, tag a commit `v<version>` and push the tag:

```sh
git tag v1.2.0
git push origin v1.2.0
```

Others import it with `metafab import github:<owner>/<repo>`, and `update` follows its version tags (see [Git refs](#git-refs)). This needs no `publish` step and no npm account. The repository shares its whole `.factory/`, so keep it free of project-specific files, or use `metafab publish` with `publish.exclude` to release a filtered fab instead.

## Publishing

```sh
metafab publish [--dry-run] [--tag <tag>]
```

Run this command in the repository that contains the source `.factory/`.

### Publishing from a project repository

Use `metafab publish` when you want to leave project-specific files out of the fab, or to publish it to npm. Publish it from the project repository whose factory you use every day:

1. Keep working in `.factory/` as usual.
2. Add a `publish` section to `metafab.yaml` once.
3. Run `metafab publish` when you want to release.

`publish` builds the fab in a temporary directory. It does not add `package.json` or any other file to the project repository. Use `publish.exclude` to keep project-specific skills out of the fab.

### Targets

`publish` releases to every configured target:

| Target | Setting | Result |
| --- | --- | --- |
| Git | `publish.git` | A commit and version tag in a fab repository |
| npm | `publish.name` | An npm package |

Configure one target or both. Git is the recommended target; npm is optional. Both targets carry the same staged fab in the same published version: the `.factory/` tree after `publish.exclude`, and the README at its root. The npm target also carries a generated `package.json`; the Git target never does. When npm is a target, staging also leaves out the names `npm pack` never packs (see [Steps](#steps)), and reports each path it left out, so the Git fab then carries the same files as the npm tarball apart from `package.json`. A Git-only publish keeps those files. A path Git reads as a `.git` directory is refused when the Git target is configured. An npm-only publish leaves out only the case spellings of `.git` itself (`.git`, `.GIT`, and so on) with a warning, because `npm pack` never carries those, and refuses every other name Git reads as `.git`: one with trailing spaces or dots, with the code points HFS+ ignores, with a `:` stream suffix, or with the 8.3 short name `git~1`, any of which npm would pack.

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
5. Add the README at the fab root, from `publish.readme`. See [Configuration](configuration.md#publish). A generated README describes the staged fab, so an excluded skill is not listed, and it names the source without credentials: a token in `publish.git` is never written to the published README, and it names the source in the form `import` accepts (`https://` and `file://` URLs gain `git+`, and a `#` in a `file://` path becomes `%23` so the path is not read as a ref).
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

1. Clone `publish.git` into a temporary directory and check out `publish.branch`. An empty repository starts that branch. `publish.git` may also be written in the import form, `git+https://`, `git+ssh://` or `git+file://`: Metafab removes `git+` before it hands the URL to Git.
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
| Add a requires entry | Minor |
| Change existing text without changing names | Patch |
| Change a required file's template text | Patch |

Renaming a skill is a major change because receiving teams can refer to or invoke it by name.

A new `requires` entry is minor because `update` offers to create its file and asks first. A changed template never changes an existing file, so it is a patch.

A published version cannot be changed:

- After npm's 72-hour unpublish window, an npm version cannot be removed. Deprecate a bad version and publish a fix.
- Do not move or delete a Git version tag after it is pushed. Publish a fix as a new version.

`metafab update` warns when the selected npm version is deprecated.

## Supported sources

`metafab import` accepts these source forms:

| Source | Example | Retrieval method |
| --- | --- | --- |
| GitHub repository | `github:seasb/fab-mark4#v1.2.0` | Git |
| Other Git repository | `git+ssh://git@example.com/fab-acme.git`, `git+https://example.com/fab-acme.git` or `git+file:///srv/fabs/fab-acme.git` | Git |
| npm package | `@seasb/fab-mark4@^1.2.0` | npm registry with the user's `.npmrc` configuration |
| HTTPS tarball | `https://example.com/fab-acme-1.0.0.tgz` | HTTPS |
| Local path | `../platform/.factory` or `file:../fab-acme` | Local file system |

Metafab also reads `ssh://` URLs and the scp form `git@example.com:fab-acme.git` as Git sources. A plain `https://` URL is always an HTTPS tarball, even when it ends in `.git`; use `git+https://` for a Git repository. A recorded `source` never contains a password, a token, or an HTTPS query string.

`git+file:///<absolute path>` names a Git repository on this machine or on a mounted share, such as the bare fab repository `publish.git: file:///…` writes. It works exactly like `git+https://`: version tags, ranges, refs, `update` and `diff`. The path must be absolute: three slashes (`git+file:///srv/fabs/fab-acme.git`), `localhost` (`git+file://localhost/srv/fabs/fab-acme.git`), or on Windows a drive after two or three slashes (`git+file:///C:/fabs/fab-acme.git` or `git+file://C:\fabs\fab-acme.git`). Encode a `#` in the path as `%23`, because `#` starts the ref. The recorded `source` is the URL as written, so it names a path on this machine. Metafab reads only committed content: uncommitted edits in a working tree are not part of the fab. A source with `file:` and no `git+` is a local path: it reads `.factory/` from a working tree and never sees tags.

Any other URL scheme, such as `http://`, `git://`, `git+http://` or `ftp://`, is refused with exit code 1 and a message that lists the supported forms. A local path that is a bare Git repository is refused with exit code 3 and a message that names its `git+file://` form.

Every source stores the factory in `.factory/`. For a Git repository, HTTPS tarball, or `file:` package, Metafab reads `.factory/` at its root. A local path can also name a `.factory/` directory directly.

A Git source can be a fab repository or any project repository. A project repository shares its whole `.factory/`, because `publish.exclude` applies only to published fabs.

Metafab fetches Git sources with Git and the user's Git credentials. It does not use npm for them because npm can run a Git package's `prepare` script.

Metafab downloads an npm fab with `npm pack <name>@<version> --ignore-scripts`. In npm 9.6.4, 10.9.2 and 11, the versions checked, `npm pack` runs lifecycle scripts only for a local directory, never for a registry package, and `--ignore-scripts` turns those off as well. A test pins this on the npm that CI runs. Before the download, Metafab reads the package's reported size and file count from the registry (`dist.unpackedSize` and `dist.fileCount`) and refuses a package that reports more than the [fab limits](#importing-a-fab) with exit code 4. A package that reports less than it holds is still refused after the download. The recorded version that `update` downloads as its base, and that `diff` compares with, skips the reported-size check, because it was accepted once; the checks after the download still apply.

Downloads are cached in `~/.metafab/cache/` (`METAFAB_CACHE` overrides it). Commands that run at the same time can share the cache: each download is written to a temporary entry next to its final place and then renamed into place, so one command never removes or reads another's partial entry. A temporary entry an interrupted command leaves behind is removed by a later command after 24 hours. A cache Metafab cannot write, for example because of its permissions or a full disk, stops the command with exit code 3 and names the cache path, before the repository changes.

A Git fetch takes the committed blob bytes exactly. Line-ending conversion, `.gitattributes` `text`, `eol`, `filter`, `ident` and `working-tree-encoding` rules, and `export-ignore` and `export-subst` are not applied, mirroring how `publish` stores bytes verbatim, so a fab fetched on any machine is the fab that was published.

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

Git repositories and npm packages are **versioned** sources. Metafab can download any earlier version again, so `update` can merge.

HTTPS tarballs and local paths are **unversioned** sources. Metafab cannot download the earlier version, so `update` overwrites `.factory/` with the current source files (see [Updating from an unversioned source](#updating-from-an-unversioned-source)).

## Importing a fab

```sh
metafab import <source> [--agents <list>] [--force] [--adopt] [--setup | --no-setup]
```

The command performs these steps:

1. Resolve the source to an exact version or revision.
2. Download the source and verify its integrity when the source provides a hash.
3. Validate the fab and its factory.
4. Select the initial targets from `--agents` or with the same target-selection behaviour as `init`. Scan those destinations, compare existing skills with the incoming fab, report conflicts, and collect any consent required by the [existing-skill adoption](cli.md#adopt-existing-skills) rules and by the [setup](#creating-required-files) rules. Complete this preflight before changing the repository.
5. Check that the build output can be written. Stop if the repository holds a file, link or directory at a path Metafab does not own.
6. When the repository has no `.factory/`, create `.factory/metafab.yaml` and add the Metafab lines to `.gitattributes`. Do not create placeholder `factory.yaml` or `AGENTS.md` files.
7. Move adopted skills into `.factory/skills/` as local additions and add each selected destination to the managed `.gitignore` block. A migrated skill that overlaps the incoming fab follows the normal conflict rule below.
8. Copy the factory into `.factory/`, except `metafab.yaml` and `README.md`.
9. Write the [upstream entry](#upstream-entry) to `metafab.yaml`.
10. Create the missing [required files](#creating-required-files) the person agreed to in step 4.
11. Run `metafab build`.
12. Print a review summary.

A failure in steps 1 to 5 leaves the repository unchanged.

Metafab never copies `metafab.yaml` from a source. A Git source that is a project repository contains one, and it belongs to that project.

Fab validation rejects:

- Unknown factory format versions (Metafab 2 knows 1 and 2)
- Paths that escape `.factory/`
- Paths that collide with `.factory/`, such as a case variant or a name ending in dots or spaces
- Links that point outside `.factory/`
- Links whose target does not exist
- Files larger than 1 MB
- More than 10,000 files, directories and links
- More than 64 MiB in total

A factory can have only one upstream fab. If `metafab.yaml` already contains an upstream entry, use `update` or `detach`.

`import` stops when the incoming fab would replace or remove different local content, and lists all conflicts. That is a different file, a link, a directory, or a local path that differs only in letter case. A case-only clash is refused on every filesystem, so `import` behaves the same everywhere. `--force` permits those replacements, including a case-only clash with a single local entry, which it renames to the fab's spelling. It never resolves two local entries that differ only in case from one incoming path.

With `--force`, the realignment happens before the copy: the local entry is renamed to the fab's spelling, a local-only file beneath it moves with it, and nothing is deleted. The result is the same on every filesystem. A local file where the fab has a directory is still replaced by that directory.

### Creating required files

A fab's `factory.yaml` can list repository files its workflows need under [`requires`](factory-format.md#required-repository-files). During the preflight, `import` looks at each one in the repository:

- **Present.** A file or a link (even a dangling one) exists at the path, or any other entry that is not a directory, such as a socket. Metafab never changes it.
- **Blocked.** The path cannot be created without changing other content: a directory is at the path, a parent is a file or a symbolic link, or the path or a parent differs only in letter case from an existing entry. A case variant is reported the same way on every filesystem. Metafab never changes the entry in the way.
- **Missing.** Nothing is at the path. With a template it can be created; without one, a person creates it.

When at least one missing file has a template, `import` lists those files on standard error, one `<path>  <description>` line each in `factory.yaml` order, and asks "Create the missing files from the fab's templates? Existing files are never changed." in a terminal, with yes as the default. `--setup` answers yes and `--no-setup` answers no without asking; passing both is a usage error. Without a terminal and without either flag, `import` exits with code 2 before changing anything, and the required value names `--setup`. When adoption consent is also missing, both required values are reported together.

After the copy and the upstream entry, `import` creates each agreed file: missing parent directories first, then the file with the template's bytes, 0755 when the template has any executable bit and 0644 otherwise. It creates the file exclusively, so a file that appeared since the preflight is left alone and reported as present. A file that cannot be created (for example, a permission error) is a warning naming the path and the fix `Copy <template> to <path>`; the import continues and exits 0. A template that is not a regular file, or whose real path is outside `.factory/`, is not read: nothing is created, and the warning's fix is `Replace <template> with a file inside .factory/templates/`. Declining leaves those files missing; `check` then warns about them.

## Updating a fab

```sh
metafab update [--to <version|range|ref>] [--dry-run] [--no-build] [--setup | --no-setup]
```

For a versioned source, the update uses three versions of each file:

- **Base:** The upstream version recorded in the upstream entry, downloaded again
- **Yours:** The current file in `.factory/`
- **Theirs:** The selected new upstream version

The command performs these steps:

1. Resolve `--to`, or select a newer version as the requested range or [Git ref](#git-refs) allows.
2. When the selected version is the recorded one, do not change factory files. If `--to` names a different range or ref, the upstream entry records it even though no newer version exists, because the next update follows it, and the output says so.
3. Download the base and new upstream versions.
4. Plan the merge of each path, without writing. When the merged `factory.yaml` adds a requirement the current one does not have, report it and collect consent to create the missing ones, as `import` does in its step 4. Nothing is written before this step ends.
5. Merge each path into `.factory/`, except `metafab.yaml`.
6. Update the resolved version and revision fields in the upstream entry, including when the merge has conflicts. The selected new upstream is the base for future updates after those conflicts are resolved.
7. Create the missing [required files](#creating-required-files) the person agreed to in step 4.
8. When the merge has no conflicts, run `metafab build` unless `--no-build` is present. Do not build conflicted source.
9. Print a review summary.

Only a requirement that is new in this update is offered: a requirement that was already listed and is still missing is `check`'s to report. The consent, the flags and the exit code without a terminal are the same as for `import`; without a terminal and a flag, `update` exits with code 2 and `.factory/` is unchanged. A dry run never asks and never writes: it reports the new requirements as missing and creates nothing. When `factory.yaml` or a new requirement's template has a conflict, `update` creates nothing for it and says so. A requirement removed upstream leaves its file alone. When upstream changed the template of a requirement whose file existed before the update, the summary notes it: `Upstream changed <template>, the template for <path>; <path> was not changed.`

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

A conflict where either side is a symbolic link is never merged as text. Metafab keeps yours and writes upstream's link target, or upstream's file bytes when upstream is a file, to `<file>.upstream`. The summary says `Conflict in <path>: upstream is a link to <target>; its target is in <path>.upstream.` or, when yours is the link and upstream is a file, `Conflict in <path>: your entry is a link to <target>; upstream's file is in <path>.upstream.`

Metafab compares text files with CRLF line endings treated as LF. A change of line endings alone is not a change. When every line of the local copy ends in CRLF, `update` writes a clean merge, a file taken from upstream, and a conflict-marker file with CRLF; otherwise it writes LF. A `<file>.upstream` side file holds upstream's bytes unchanged.

If the base version is unavailable, every path where both sides have different content is a conflict. A file only upstream has is written to `<file>.upstream`, and a file only you have is kept and reported. For example, a Git base is unavailable when its commit was removed by a force push, and an npm base is unavailable when its version was unpublished or removed. A base download that fails for any other reason, such as an unreachable source, rejected credentials, or a cache or filesystem problem, stops the update before it changes a file and reports that problem and its exit code.

Before the first write, `update` records what `.factory/` holds: every file's bytes and permission bits, every link's target, and every directory, empty ones included, with its exact spelling. An entry that is none of these, such as a socket or a named pipe, is not factory content: the record does not hold it, so a restore never creates one and leaves it alone unless it sits on a recorded path, where the recorded entry is restored over it. A planned write onto such a path replaces it as it would replace any other file. A failure while writing, realigning path spelling, or recording the upstream restores `.factory/` to that record, leaves the upstream record unchanged, and exits 1 with code `update-write-failed`. The message reports the original failure and says `.factory/` was restored. The build that runs after the writes is outside this block: a build failure does not undo a complete update. If the restore itself fails, the message says `.factory/` may be partly updated, and the fix is `Restore .factory/ from Git (git status shows what changed), then run metafab update again`. A dry run writes nothing and records nothing.

After a conflicted update, `metafab check` fails while either condition remains:

- A file contains conflict markers.
- A `.upstream` file exists.

`metafab update` refuses to start while either condition remains. Resolve every marker and `.upstream` file, run `metafab build`, and then run `metafab check` before updating again. This prevents a second update from treating unresolved merge output as local edits against the newly recorded base.

### Updating from an unversioned source

For an HTTPS tarball or a local path, `update` does not merge. This operation is intentionally destructive for files that also exist in the source:

1. Download or read the current source.
2. When the source's `factory.yaml` adds a requirement the current one does not have, report it and collect consent to create the missing ones, as for a versioned source. Nothing is written before this step ends.
3. Copy every source file into `.factory/`, replacing the local file. Files that exist only locally are kept.
4. Create the missing [required files](#creating-required-files) the person agreed to in step 2. A file outside `.factory/` is never replaced, even here.
5. Run `metafab build` unless `--no-build` is present.
6. Print a review summary.

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

Repository files the factory needs
  A opencode.json                          created from .factory/templates/setup/opencode.json
  docs/roadmap.md                          missing: The roadmap that prioritise-roadmap writes and start-plan reads
  orca.yaml                                present: Runs metafab build in each new Orca worktree; when it exists, add the build step to scripts.setup

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
3. Repository files the factory needs
4. Workflows
5. Skills
6. Other files, such as templates
7. Preserved local edits
8. Conflicts

`import` lists every requirement; `update` lists only the requirements that are new in the update. Each line is `A <path> created from <template>`, `<path> present: <description>` when the requirement has a template (the template was not used, so the description is how the person learns what the existing file needs), `<path> present` when it has none, `<path> missing: <description>`, `<path> not created: declined`, `<path> blocked: <reason>`, or `<path> not created: <error>`.

The summary also calls out:

- Changes to a skill's `allowed-tools` field

`--json` returns the same information as structured data.

## Comparing local edits

```sh
metafab diff [<path>]
```

This command downloads the version recorded in the upstream entry and compares `.factory/` with it. For an unversioned source, it compares with the current source.

Use the optional path to limit the comparison. Teams can use this diff when proposing a local change to the upstream fab.

When `.factory/` matches its upstream, `diff` prints `No local edits since <source> <version>.` For an unversioned source it omits the version: `No local edits since <source>.` With a path limit it prints `No local edits in <path> since ...` with the same source and version.

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
