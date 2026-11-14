# Store

> **Version 2.** Status: draft for approval, written 14 Nov 2026. Plans 2.001 to 2.010 implement it. It is the acceptance standard for those plans only; version 1 behaviour is unchanged until they merge. While they are being built, Plan 2.003 registers every `store` and `scorer` command, and a command whose plan has not merged yet exits 1 with `not implemented yet`; no release ships until Plans 2.009 and 2.010 have merged. The wire protocol that every remote backend implements is in [Store protocol](store-protocol.md).

The store is a shared, versioned home for a factory's working documents and for the scores that judges give to work. It lives outside Git. Agents read and edit its documents as ordinary files in a local folder, the **mirror**, and save them with `metafab store push`. Every save and every score records the repository, branch and commit it came from.

A team chooses where the store lives. Metafab talks to it through a **backend**: a remote server that implements the [Store protocol](store-protocol.md), such as Metastore Cloud, our hosted product; a ref in this or another Git repository; or a directory on the developer's own machine.

## Why

A factory writes many documents that are not code: plans, intake notes, changelog entries, reviews, research. Today they live in Git, beside the code, and that causes four problems. Dragonfly found each of them in practice before it moved these documents out of Git ([Background](#background)).

1. **Routine updates need Git ceremony.** A plan changes status several times while it is built. Each change needs a branch, a commit, a pull request and a merge, or a docs-only commit straight to `main`.
2. **Work on a branch is invisible.** A plan updated on a feature branch is not on `main` until the branch merges. Another developer or agent planning in parallel reads an old copy.
3. **Duplicated records conflict.** Landing commits update the plan, the roadmap and the changelog on every branch. Two pull requests that merge close together conflict on generated tables.
4. **Scores have no home.** A judge can score a plan or a pull request as a workflow step, but the result disappears into a chat transcript. Nobody can compare scores across plans, pull requests and months.

The store removes the Git ceremony for working documents, gives every developer the same current copy, and keeps scores where they can be compared. Specs, the factory, and the code stay in Git and keep their review process.

## Goals

1. Keep a factory's working documents in a shared store outside Git, with every version kept.
2. Let agents use those documents as ordinary files, with `grep`, editors and existing workflows, through a local mirror.
3. Let a factory declare its document folders and the properties each document must have, and check them before a save.
4. Record scores as append-only events, pinned to the exact version or commit that was scored.
5. Record where each change came from: repository, branch, commit, agent and workflow.
6. Work with more than one backend through one open protocol.

## Non-goals

- **Branch-aware visibility.** The store holds one current version of each document, like a trunk. It records the branch a change came from, but a change is visible to everyone as soon as it is saved. Branch-aware records are a later draft: [Branch-aware records](next/branch-aware-records.md).
- **Server-side merges.** A conflicting save is refused. The CLI helps the person or agent merge.
- **Running judges.** A workflow runs a judge. The store keeps the score.
- **Replacing Git** for code, specs, the factory, or anything that must change together with code.
- **Agent memory**, comments on documents, and editing documents in a browser. These are later work.

## Concepts

| Term | Meaning |
| --- | --- |
| **Store** | One shared, versioned home for documents and scores. A repository's factory uses at most one |
| **Backend** | The implementation that holds a store: `remote` (a server that implements the [protocol](store-protocol.md)), `git` (commits on a ref of this or another Git repository) or `local` (a directory on this machine) |
| **Document** | A file in the store, identified by its path. It has versions |
| **Store path** | A document's path relative to the mirror root, with its extension: `plans/2.004-pull.md` |
| **Version** | One saved state of a document. Versions of a path are numbered from 1 and never change |
| **Format** | `markdown`, `html` or `file`, from the path's extension |
| **Properties** | A document's frontmatter, stored as data |
| **Origin** | Where a change or score came from: repository, branch, commit, agent, workflow. See [Origin](#origin) |
| **Mirror** | The folders in a working tree that hold local copies of documents. Git ignores them |
| **Mirror root** | The repository folder that store paths are relative to. Default `docs` |
| **Store folder** | A folder under the mirror root whose files live in the store, such as `docs/plans/` |
| **Document folder** | A folder that the factory declares in `factory.yaml`, with rules for its documents. See [Declaring document folders](#declaring-document-folders) |
| **State file** | Per working tree. Records the version each local file is based on |
| **Index** | Per working tree. Lists every document in the store, without bodies |
| **Sync window** | A rule that limits which documents of a folder `pull` copies |
| **Score** | One judgement about one subject, by a judge, a script or a person |
| **Subject** | What a score is about: a document version, a pull request, a branch, a commit, a repository file, or a URL |
| **Scorer** | A rubric in the factory that a judge applies. See [Scorers](#scorers) |

## Documents

### Paths

A store path is relative to the mirror root and uses `/` separators. It must:

1. Have at most 400 characters, and at most 200 in each segment.
2. End with a file name that has an extension, such as `.md`.
3. Have no empty, `.` or `..` segment, and no segment that starts with `.`.
4. Be portable: no `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` or control character, no segment that ends in a dot or a space, and no Windows device name (`CON`, `PRN`, `AUX`, `NUL`, `COM1` to `COM9`, `LPT1` to `LPT9`, with or without an extension).
5. Differ from every other path in the store by more than letter case. A store never holds `plans/A.md` and `plans/a.md`, so a mirror works on case-insensitive file systems.

A folder is only a part of a path. The store has no folder records.

### Formats

The extension sets the format. Comparison ignores letter case.

| Extension | Format | Stored as |
| --- | --- | --- |
| `.md` | `markdown` | Properties from the YAML frontmatter, and the body after it |
| `.html` | `html` | Properties from a comment at the very top of the file: `<!--store` on its own line, then YAML, then `-->` on its own line. The body is the rest |
| Any other | `file` | The bytes, unchanged, as one content-addressed blob. No properties. Its content type comes from the extension: `.png` `image/png`, `.jpg` and `.jpeg` `image/jpeg`, `.gif` `image/gif`, `.webp` `image/webp`, `.svg` `image/svg+xml`, `.pdf` `application/pdf`, `.json` `application/json`, `.csv` `text/csv`, `.txt` `text/plain`, `.xlsx`, `.docx` and `.pptx` their Office Open XML types, `.zip` `application/zip`; anything else `application/octet-stream` |

A markdown file with no frontmatter, or an HTML file with no `<!--store` comment, has no properties and is all body. An empty file is a valid document.

Text formats are stored as UTF-8 with LF line endings. When the CLI reads a local markdown or HTML file, it removes a UTF-8 byte order mark and converts CRLF to LF. A text file that is not valid UTF-8 cannot be saved: the CLI reports it and suggests saving it as UTF-8, or renaming it so that it is a `file` document. A `file` document is never converted.

### Properties

Properties are a YAML mapping, stored as JSON. Rules:

1. Property names start with a lowercase ASCII letter and use lowercase letters, digits, `_` and `-`. This keeps names such as `builds-on`.
2. Values are any JSON value: string, number, boolean, null, list or mapping. YAML timestamps are read as strings.
3. The CLI keeps the order of keys.
4. A key with no value, such as `pr:`, is stored as `null` and written back as `pr:`.
5. Comments in frontmatter are not stored. A pull writes the YAML again from the stored properties, so a comment is gone after the next pull. Put notes in the body.

A change to the layout of the frontmatter alone, such as quotes or indentation, is not a change to the document.

### Title

Each version has a title, derived when it is saved: the `title` property when it is a non-empty string; else the first `# ` heading of a markdown body; else the `<title>` of an HTML body; else the file name.

### Versions, archive and restore

Every save that changes a document creates the next version. A save whose properties, body and blob equal the current version creates nothing and reports `unchanged`. Each version records its message, its author, the time, and its [origin](#origin).

A document is `active` or `archived`. Archiving keeps every version and removes the document from the current set: `pull` removes its local copy, and `ls` lists it only with `--archived`. Restoring makes it `active` again as a new version with the content of its last version.

A save to an archived path is refused. Restore it first, or choose another path.

### Moves

`metafab store mv <from> <to> -m <message>` archives `<from>` and saves its content at `<to>` as version 1, in one atomic change. The CLI adds `(moved from <from>)` to the message, so the history of both paths names the move. Scores stay on the old path, because they name what was scored.

### Limits

A backend states its limits. The defaults, which Metastore Cloud and the local backend use, are below; the Git backend lowers the blob limit to 50 MB.

| Limit | Default |
| --- | --- |
| Changes in one push | 500 |
| One push request | 100 MB |
| One text body | 25 MB |
| One `file` blob | 100 MB |
| Properties of one document | 64 KB as JSON |
| Scores in one request | 100 |

Sizes are measured in bytes as follows. A text body: its UTF-8 length after line endings are converted. Properties: the UTF-8 length of `JSON.stringify(properties)`, with no spaces. A push request: the UTF-8 length of the compact JSON of the whole `POST /v1/changes` body, message and origin included; blob bytes travel separately and count only against the blob limit. Changes in one push: the number of items in the request, with an `mv` counting its archive and its save.

## Document folders and rules

A factory declares the folders its workflows keep documents in, and the rules those documents follow. The declaration is factory content: a fab carries it, so every repository that imports the fab checks its plans the same way. Where the documents live, in Git or in the store, is the repository's choice in `metafab.yaml`.

### Declaring document folders

`factory.yaml` with `format: 2` accepts a `documents` list:

```yaml
format: 2
name: meta-harness
documents:
  - folder: docs/plans/
    description: One plan per pull request
    match: "*.md"
    schema: .factory/schemas/plan.yaml
    unique: [code]
    references: [needs, builds-on, retires]
  - folder: docs/intake/
    description: Bugs, ideas and follow-ups waiting for a decision
    schema: .factory/schemas/intake.yaml
```

| Key | Required | Meaning |
| --- | --- | --- |
| `folder` | Yes | A repository-relative folder that ends in `/` |
| `description` | Yes | One line that says what the folder holds |
| `match` | No | A glob, or a list of globs, relative to the folder, for the files the rules apply to. Default `**/*`. Files below a folder whose name starts with `.` never match |
| `schema` | No | A JSON Schema file in `.factory/`, as `.json`, `.yaml` or `.yml`, for the properties of each matching markdown or HTML document |
| `unique` | No | Property names whose values no two matching documents share |
| `references` | No | Property names whose values are repository paths of documents. See [References](#references) |

Validation rules, which `metafab check` reports with the line of the entry:

1. `documents` needs `format: 2`. With `format: 1`, it is an error whose fix is `Set format: 2`.
2. Each entry is a mapping with only the keys above. `folder` and `description` are non-empty single-line strings; `match`, `unique` and `references` are a non-empty string or a list of them.
3. `folder` follows rules 1, 3 and 4 of [Paths](#paths), contains none of `!`, `#`, `[` and `]` (so it can be written to `.gitignore` as it is), is not `.factory/` or below it, is not a skill destination or below one, and does not start with `.git/`.
4. No folder equals another, ignoring letter case, or is below another.
5. `schema` starts with `.factory/`, names an existing file, parses as JSON or YAML, and is a valid JSON Schema (draft 2020-12). It may use `$ref` only within the same file.
6. Names in `unique` and `references` follow the property name rule in [Properties](#properties).

### Checking documents

These checks apply to every matching file in each declared folder, whether the folder is in Git or in the store:

| Check | Level |
| --- | --- |
| Markdown frontmatter or the HTML `<!--store` comment does not parse as a YAML mapping | Error |
| The properties do not match the schema. One problem per schema error, on the line of the property it names, or the first line of the frontmatter | Error |
| Two documents share a value of a `unique` property. Reported on the later path in path order that has a file on disk, naming the other path | Error |
| A `references` value is not a relative path with `/` separators and no empty, `.` or `..` segment, or breaks rule 4 of [Paths](#paths), such as `../x.md` or `/x.md`. A segment that starts with a dot, such as `.factory/`, is allowed here | Warning |
| A `references` value names a repository path that is neither a file in the working tree nor a document in the [index](#the-index). A trailing `@v<n>` is ignored, and values that are URLs are skipped | Warning |

**Unique values.** A string, number or boolean value counts as itself. A list counts each of its items that is a string, number or boolean, once, however often it repeats in that list. `null`, empty lists, mappings, and lists or mappings inside a list do not count. Two values are equal when their JSON text is equal, so `"1"` and `1` differ, and comparison is case-sensitive.

**Which documents take part.** Schema checks apply to the matching files on disk. `unique` and `references` also count the documents that the index lists in the folder and that have no local file, with their stored properties, so a document outside the [sync windows](#sync-windows) still holds its unique values.

`metafab check` runs every check. `metafab store push` runs them for the documents it is about to save: schema checks on those documents, and `unique` against every other document of the folder, on disk or in the index. It saves nothing while an error remains. `metafab store import` runs them on the files it reads from Git, with `unique` also counting the store's current documents that Git does not hold. A `file` document has no properties, so no check applies to it, and neither do files that do not match the folder's `match`.

Backends do not run these rules in version 2. Two pushes at the same time can still save duplicate unique values; `check` reports them afterwards. See [Open questions](#open-questions).

### References

A reference property holds repository paths of documents, such as `needs: [docs/plans/2.003-remote-backend.md]`. A reference can name one version with `@v<n>`: `docs/plans/2.003-remote-backend.md@v4`.

Store paths do not include the mirror root, so the store does not depend on where a repository keeps its mirror. When the CLI saves a document, it removes the mirror root from each reference value that names a store folder: `docs/plans/x.md` is stored as `plans/x.md`. When it writes a local file, it adds the root again. Other values, such as `docs/specs/cli.md`, are stored as written.

## The mirror

### Configuration

The repository chooses its store in `.factory/metafab.yaml`, under the `store` key:

```yaml
store:
  backend: remote
  url: https://metastore.metafab.dev/seasb/meta-harness
  root: docs
  folders: [plans/, intake/, changelog/]
  sync:
    plans/: { where: { status: [draft, ready, building] }, recent: 30 }
    changelog/: { recent: 30 }
```

| Key | Required | Meaning |
| --- | --- | --- |
| `backend` | Yes | `remote`, `git` or `local` |
| `url` | For `remote` | The store's base URL. `https`, or `http` only for `localhost`, `127.0.0.1` or `[::1]` |
| `remote` | No, `git` only | The Git remote of this repository that holds the store. Default `origin` |
| `ref` | No, `git` only | The ref that holds the store in this repository. Default `refs/metafab/store` |
| `repository` | No, `git` only | A separate Git repository that holds the store, as a Git URL, instead of `remote` and `ref` |
| `branch` | No, `git` with `repository` only | The branch of that repository. Default `main` |
| `name` | No, `local` only | The local store's name. Default: the factory name in `factory.yaml`, else the name `init` would derive from the repository directory |
| `root` | No | The mirror root, a repository-relative folder. Default `docs` |
| `folders` | No | Store folders, relative to `root`, each ending in `/`. Default: every [document folder](#declaring-document-folders) strictly below `root` (a document folder equal to `root` is never a default store folder). `[]` keeps every document in Git and uses the store for scores only |
| `sync` | No | [Sync windows](#sync-windows), keyed by store folder |

Every developer of a repository must use the same store, so this configuration is committed. Credentials are personal and are never committed; see [Credentials](#credentials).

`metafab check` reports an error when:

1. `store` is not a mapping, has an unknown key, or a value has the wrong type.
2. `backend` is missing or is not `remote`, `git` or `local`.
3. `backend: remote` has no `url`, or `url` is not an absolute `https` URL, or an `http` URL for a loopback host. A URL with credentials, a query or a fragment is an error.
4. `name` is given with a backend other than `local`, or does not follow the factory name rule. `url` is given with a backend other than `remote`. `remote`, `ref`, `repository` or `branch` is given with a backend other than `git`.
5. With `backend: git`: `repository` is given together with `remote` or `ref`; `branch` is given without `repository`; `remote` is not a valid remote name; `ref` does not start with `refs/`, starts with `refs/tags/` or `refs/remotes/`, or breaks Git's ref name rules; `branch` breaks Git's branch name rules; `repository` is not a Git URL (`https://`, `ssh://`, `user@host:path` or `file://`), or is an `https` URL with credentials.
6. `root` breaks rules 1, 3 or 4 of [Paths](#paths), contains `!`, `#`, `[` or `]`, or is `.factory`, a skill destination, or below one of them.
7. A folder in `folders` does not end in `/`, breaks the same rules as `root`, repeats another ignoring letter case, or is below another.
8. A `sync` key is not one of the store folders, a window has an unknown key, has neither `where` nor `recent`, or `recent` is not a positive whole number.

### Git ignores the mirror

`metafab build` adds each store folder and the `<root>/.store/` folder to its [ignored build output block](building.md#ignored-build-output). A store folder must not hold files that Git tracks. While it does, `pull`, `push`, `mv`, `archive` and `restore` stop with exit code 1 and name the folder, and the fix explains [moving folders out of Git](#moving-folders-out-of-git). Outside a Git repository, or without `git`, this check is skipped.

Every file below a store folder is a document, except files below a folder whose name starts with `.`. Files outside the store folders are never read or written by the mirror commands.

The mirror commands never write through a symbolic link. When the mirror root, `<root>/.store`, or any folder between the repository root and them is a symbolic link, every mirror command stops with exit code 1 before it writes anything. A link inside a store folder is reported by `status` and left alone.

### Working-tree files

The CLI keeps its own files in `<root>/.store/`, which Git ignores. Do not edit them.

| File | Contents |
| --- | --- |
| `state.json` | For each store path: the version the local file is based on, a hash of what the CLI last wrote or saved, and whether it is [pinned](#pinning) |
| `index.json` | Every document in the store, active and archived: path, version, state, title, format, properties, when and by whom it was saved, and its origin. No bodies |
| `remote/<store path>` | Conflict copies. See [Conflicts](#conflicts) |
| `lock` | Held by a command that writes the state file |

A **hash** covers the format, the properties after reference mapping, and the body, for a text document; and the bytes, for a `file` document. A local file is **modified** when its hash differs from the state file's hash for its path.

Only one command that writes the state file runs in a working tree at a time. A second one stops at once and names the process that holds the lock. A lock left by a process that no longer runs on this machine is taken over.

Each working tree has its own mirror. Worktrees of one clone do not share state.

The state file records which store it belongs to. A state file for another store, after `backend`, `url` or `name` changed, is ignored as if it were missing and replaced at the next write. When the state file is missing or damaged, `pull` compares each local file with the current version: an equal file is recorded, and a different one gets a conflict copy.

### Pull

`metafab store pull [<path>…] [--all] [--force] [--if-signed-in] [--if-new]`

Pull lists the store once, rewrites the index, and brings each document inside its folder's [sync window](#sync-windows) up to date:

| Local file | Store | Result |
| --- | --- | --- |
| Missing, no state entry | Active | Written and recorded |
| Missing, with a state entry | Active | Left missing: the person deleted it. `status` reports it |
| Clean | Newer version | Replaced and recorded |
| Modified | Same version as the state | Left alone |
| Modified | Newer version | Left alone; the newer version is written as a [conflict copy](#conflicts) |
| No state entry | Same content | Recorded |
| No state entry | Different content | Left alone, with a conflict copy |
| Clean | Archived, or outside its sync window and not pinned | Removed, with its state entry |
| Modified, or with a conflict copy | Archived, or outside its window | Left alone. `status` reports it |

A pull never overwrites or removes a local change, and never re-creates a file the person deleted. With paths, pull touches only those documents or folders, ignores the sync windows for them, writes deleted files back, and [pins](#pinning) each named document. `--force` replaces local changes and deletions in the documents it covers with the current version. `--all` ignores the sync windows for this run and pins nothing.

`--if-signed-in` makes a missing credential or an unreachable remote a one-line notice with exit code 0. `--if-new` makes pull do nothing when the working tree already has a state file. Git hooks use both; see [Keeping the mirror current](#keeping-the-mirror-current).

Pull also writes a document whose path differs only in letter case from a local file as a conflict copy, and reports it.

### Status

`metafab store status` reads the state file and the local files, and lists the store once. It reports each document that is `modified`, `new` (a local file with no state entry and no document), `unrecorded` (a local file with no state entry whose path the store holds; status fetches the current version and says whether the next pull records it, when equal, or writes a conflict copy), `deleted` (a state entry with no local file), `behind` (clean, but the store has a newer version), `conflict` (has a conflict copy), or `archived` (the local file remains, but the document is archived). It reports tracked files in store folders, and counts the documents outside the sync windows on one line. With `--offline` it reads the index instead of listing the store, and says the result may be stale.

### Push

`metafab store push [<path>…] -m <message> [--resolved]`

Push saves every modified and new file, or only those under the given paths, in one atomic change: every document is saved, or none is.

1. Push collects the changed files. A deleted file is not archived; push reports it and names `metafab store archive`.
2. It reads each file as a document, maps references, and checks the [path rules](#paths), the [limits](#limits) and the [document rules](#document-folders-and-rules) of its folder. Any error stops the push, with every problem listed, and nothing is sent.
3. It sends the change with each document's base version: the version in the state file, or 0 for a new file. With `--resolved`, a document with a conflict copy uses the conflict copy's version as its base. Without `--resolved`, a document with a conflict copy stops the push, because its base is known to be stale: merge the copy, then push with `--resolved`.
4. When the backend saves the change, push records each new version and hash, updates the index, and deletes the conflict copies of the saved documents.
5. When a base version is stale, nothing is saved. Push writes a conflict copy for each stale document, and exits with code 1. See [Conflicts](#conflicts).
6. When a backend refuses a document, push prints the backend's problem beside the file and exits with code 1.

`-m` is required. When there is nothing to push, push says so and exits 0.

A push that fails after the request was sent, for example when the connection drops, may have been saved. The CLI retries with the same idempotency key, so a retry never saves twice. If the process stopped instead, the next push finds out: when the backend reports a stale base for a document whose current content equals the local file, push records that version and treats the document as saved. When every stale document is like that, push sends the rest of the change again, once.

Push checks the [document rules](#checking-documents) for the documents it saves. A problem in a document it does not save does not stop it, except a duplicate `unique` value shared with a document it saves, which is reported on the saved document.

Push warns, without stopping, about a reference to a document that does not exist and about a deleted local file.

### Conflicts

When the store has a newer version than the one a local file is based on, and the local file has changes, the CLI writes the current version to `<root>/.store/remote/<store path>` and records its version. It never merges.

To resolve a conflict:

1. Compare the files. `metafab store diff --remote <path>` shows the difference between the local file and the current version.
2. Merge the store's changes into the local file.
3. Run `metafab store push <path> -m <message> --resolved`.

If the store moved on again, push writes a new conflict copy. A pull that brings a file up to date deletes its conflict copy. Conflict copies are never documents, and the mirror commands and `metafab check` never read them as documents.

### Other commands

| Command | Behaviour |
| --- | --- |
| `diff [<path>…] [--remote]` | Shows what a push would change, against the version each file is based on. With `--remote`, against the current version |
| `show <path> [--version <n>]` | Writes a version to standard output as pull would write it, without changing a file. For a `file` document, it refuses when standard output is a terminal |
| `log <path>` | Lists the versions of a document, newest first: version, time, author, origin branch and message |
| `ls [<prefix>…] [--where <key>=<value>]… [--sort path\|saved] [--limit <n>] [--archived] [--remote]` | Lists documents from the index. See [The index](#the-index) |
| `mv <from> <to> -m <message>` | Moves a document, or every document under a folder, in one atomic change, then moves the local files. Warns about documents that reference the old path |
| `archive <path>… -m <message> [--force] [--base <n>]` | Archives documents, in one atomic change, and removes their local files. Takes documents, not folders. Refuses a local file with changes unless `--force`. `--base` gives the base version of a single document with no state entry |
| `restore <path>… -m <message>` | Restores archived documents as a new version, then pulls them |
| `unpin <path>…` | Removes the [pins](#pinning) on documents, or on everything under a folder |

## Sync windows

A store folder can have a sync window in `metafab.yaml`, so the mirror holds the documents that matter and not a whole log. A folder without a window is copied in full.

```yaml
sync:
  plans/: { where: { status: [draft, ready, building] }, recent: 30 }
  reviews/: { recent: 10 }
```

- `where` maps a property name to a value or a list of values. A document matches when every named property equals one of its values.
- `recent` is a whole number: the folder's newest units, ranked by the date at the start of the unit's name (`YYYY-MM-DD`), then by when they were last saved. A unit whose name has no date ranks after every dated unit, by when it was last saved.
- A unit is in the window when any of its documents matches `where`, or it is one of the `recent` newest. A window with neither key is an error.
- When two windows match a path, the longer folder wins.

A window keeps **units**, not files. A unit is the first path segment below the folder, without its extension: `intake/x.md` and the folder `intake/x/` are one unit, and so are `research/y.md`, `research/y.html` and `research/y/`. A unit is copied or removed as a whole.

`metafab check` and the mirror commands treat a document that is only in the index as present. `grep` sees only the files on disk; `ls` then `pull <path>` reaches the rest.

### Pinning

`pull <path>` pins each document it names, so a later pull keeps it whatever the window says. `unpin` releases it, and the next pull removes it when it is clean and outside its window. A pull never removes a modified, new or pinned file, or one with a conflict copy.

## The index

Each pull rewrites `<root>/.store/index.json` from its one list call. Push, `mv`, archive and restore update their own entries. `ls` reads the index, so it works offline and lists documents that have no local file. `--remote` lists the store instead and rewrites the index.

Each `ls` line shows a mark, the date the document was last saved, its version, its path and its title. The mark is blank for a clean local file, `M` for a modified one, `↓` for a document with no local file, `P` for a pinned one, and `A` for an archived one (only with `--archived`). `--where key=value` matches top-level properties as a window does; a value of a list property matches when the list contains it. `--json` prints the index entries.

Without an index, `ls` stops and suggests `metafab store pull`, and the document checks read only the files on disk.

## Origin

Every change and every score records its origin, so a team can see where it came from. The CLI collects it; a backend stores it as given, and adds the author and the time itself.

| Field | Source | Example |
| --- | --- | --- |
| `repo` | `git remote get-url origin`, normalised: host in lowercase, then the path, without credentials, a port, a `.git` suffix or a trailing `/` | `github.com/seasb/meta-harness` |
| `branch` | The current branch. `null` when `HEAD` is detached | `feat/2.004-pull` |
| `commit` | `HEAD` | `a1b2c3d…` (40 hex digits) |
| `dirty` | `true` when the working tree has changes Git does not ignore | `true` |
| `tool` | `metafab/<version>` | `metafab/2.0.0` |
| `agent` | `METAFAB_AGENT`; else `claude` when `CLAUDECODE` is `1`; else absent. Other agent tools are added when their documented variables are confirmed | `claude` |
| `session` | `METAFAB_SESSION`, else absent | `ses_01J…` |
| `workflow` | `METAFAB_WORKFLOW`, else absent | `build-plan` |

Outside a Git repository, or without an `origin` remote, the Git fields are absent. The origin never contains a local file path, a host name or an environment variable's value other than these.

## Scores

A score is one judgement about one subject. It has these fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | Yes | A ULID the CLI creates. A backend ignores a second score with the same id, so a retry never records a score twice |
| `subject` | Yes | The canonical subject. See [Subjects](#subjects) |
| `version` | For a document | The document version scored |
| `revision` | For a pull request, branch, commit or file | The commit scored |
| `name` | Yes | The score's name, such as `plan-quality`. Same rules as a property name |
| `value` | `value` or `label` | A finite number |
| `label` | `value` or `label` | A short category, such as `merge`, at most 100 characters |
| `scale` | No | `{ "min": <number>, "max": <number> }`, the range `value` is on |
| `criteria` | No | A list of `{ "id", "value"?, "label"?, "weight"?, "note"? }`, one per criterion |
| `rationale` | No | At most 20,000 characters |
| `scorer` | No | The scorer's repository path, such as `.factory/scorers/plan-quality.md` |
| `scorerVersion` | No | The Git blob hash of that file |
| `model` | No | The judge model |
| `run` | No | A JSON object of run context, such as `{ "round": 2, "plan": "docs/plans/2.004-pull.md" }` |
| `origin` | Yes | See [Origin](#origin) |

The backend adds `recordedAt` and `recordedBy`.

A score is refused, by the CLI before it sends it and by the backend, when any of these is true:

1. `id` is not a ULID; `name` breaks the property name rule; the subject is not [canonical](#subjects).
2. Neither `value` nor `label` is given. `value` is not a finite number. `label` is empty or longer than 100 characters.
3. `scale` is given and `min` or `max` is not finite, `min` is not less than `max`, or `value` is outside it.
4. A criterion has no `id`, an `id` that breaks the property name rule or repeats, neither a finite `value` nor a `label`, a `weight` that is not a positive finite number, or a `note` longer than 2,000 characters. When `scale` is given, a criterion `value` must be within it.
5. `rationale` is longer than 20,000 characters, or `run` is not a JSON object.
6. A `doc` subject has a `version` that is not a positive whole number, or a `revision`. A `pr`, `branch`, `commit` or `file` subject has no `revision`, or one that is not 40 hexadecimal characters, or a `version`. A `url` subject has either.

Scores are append-only. Nothing edits or deletes one. A later score with the same name on the same subject supersedes it for anyone who reads the newest one.

### Subjects

A subject is pinned to what was read, so an old score is never read as a score on what the subject is now.

| Kind | Input forms | Canonical subject | Pin |
| --- | --- | --- | --- |
| Document | `docs/plans/x.md`, `plans/x.md`, `plans/x.md@v7`, for a path in a store folder | `doc:plans/x.md` | `version`: the given version; else, when a clean local file exists, the version it is based on, which is what a reader of that file read; else the current version, set by the backend |
| Pull request | `#42`, `pr:42`, `pr:42@<sha>`, `https://github.com/<owner>/<repo>/pull/42` | `pr:github.com/<owner>/<repo>#42` | `revision`: the head commit |
| Branch | `branch:feat/x`, `branch:feat/x@<sha>`, `https://github.com/<owner>/<repo>/tree/<branch>` | `branch:github.com/<owner>/<repo>#feat/x` | `revision`: the branch's commit |
| Commit | `commit:<sha>`, `https://github.com/<owner>/<repo>/commit/<sha>` | `commit:github.com/<owner>/<repo>#<sha>` | `revision`: the full commit |
| Repository file | A repository path outside the store folders, such as `docs/specs/cli.md`, or `docs/specs/cli.md@<sha>` | `file:github.com/<owner>/<repo>#docs/specs/cli.md` | `revision`: the given commit, which must contain the path, else `HEAD`. Without a given commit, the score's `run.modified` is `true` when the file has uncommitted changes |
| URL | Any other `https://` URL | `url:<the URL without its fragment or trailing />` | None |

Every canonical subject is also accepted as input, with a pin: `doc:plans/x.md@v7`, `pr:github.com/o/r#42@<sha>`, `branch:github.com/o/r#feat/x@<sha>`, `commit:github.com/o/r#<sha>`, `file:github.com/o/r#docs/specs/cli.md@<sha>`, `url:https://…`. A canonical input is recognised by its prefix: `doc:` and `url:` always; `pr:`, `branch:`, `commit:` and `file:` when a repository (a host with a dot, then a path) and `#` follow, so `pr:42` and `branch:feat/x` stay short forms. `scorer prompt` prints the subject in this form, so `record` names exactly what the judge read, in any repository.

Short forms take the repository from the [origin](#origin) `repo`. The CLI resolves each revision before it sends the score, because a backend never calls Git or GitHub:

- A pull request: `gh pr view <n> --repo <owner>/<repo> --json headRefOid`. Without `gh`, or for a host other than `github.com`, the input must give `@<sha>`.
- A branch of this repository: the local branch when it exists, else `origin/<branch>`. A branch of another repository: `git ls-remote`. When neither finds it, the input must give `@<sha>`.
- A short commit is expanded with `git rev-parse` in this repository. A commit of another repository must be given in full.

A document subject for a path that is not in the store is refused, and so is a version the document never had. A version of a document archived since is accepted.

### Recording and listing

| Command | Behaviour |
| --- | --- |
| `score <subject> (--file <json> \| --name <n> (--value <x> \| --label <l>) [--scale <min>..<max>] [--rationale <text>] [--model <m>])` | Records one score. `--file` holds a whole score object without `id`, `subject` or `origin`; flags override its fields. The CLI checks the score before it sends it. A document subject without `@v<n>` whose local file has unsaved changes, is new, or was deleted is refused, with the fix `Push it first, or name the version with @v<n>`, because the score would name a version nobody read |
| `scores [<subject> \| <folder>] [--name <n>] [--since <date>] [--limit <n>] [--json]` | Lists scores, newest first: the time, the name, the value on its scale or the label, the subject at its version or revision, and the scorer. A folder lists the scores of the documents under it |

[Scorers](#scorers) record scores through `metafab scorer record`, which builds the score from a judge's result.

## Scorers

A **scorer** is a rubric that a judge applies to a subject: a fixed scale, named criteria, and guidance on what each score means. A judge is a model in a fresh session that sees only the scorer's prompt, so its scores can be compared across subjects and months. Scorers are factory content, so a fab can ship them.

### Scorer files

In a factory with `format: 2`, each Markdown file directly in `.factory/scorers/` is a scorer, `.factory/scorers/<name>.md`, except a file named exactly `SKILL.md`, which [Factory format](factory-format.md#validation) rule 11 already reports. Scorers are not Agent Skills and `build` does not install them. A skill directory in `scorers/` is still an ordinary skill.

```markdown
---
name: plan-quality
description: How well a plan lets a builder build one pull request without guessing.
subjects: [document]
paths: ["docs/plans/*.md"]
scale: { min: 1, max: 5 }
criteria:
  - { id: one-pull-request, weight: 1, question: Is it one pull request a reviewer can assess in one sitting? }
  - { id: real-names, weight: 2, question: Does it name real files, types and functions, checked against the code? }
  - { id: failure-paths, weight: 2, question: Does it say what happens on each failure? }
---

# Plan quality

Read the plan, then each spec section it links...
```

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | Yes | The file name without `.md`, and the name of the scores it records. Follows the skill name rules |
| `description` | Yes | One line |
| `subjects` | Yes | One or more of `document`, `pull-request`, `branch`, `commit`, `file`, `url` |
| `paths` | No | Globs of repository paths. A `document` or `file` subject must match one |
| `scale` | Yes | `{ min, max }`, whole numbers with `min` less than `max` |
| `criteria` | Yes | A list of `{ id, weight, question }`. `id` follows the property name rule and is unique; `weight` is a positive number; `question` is one line |

The body is the rubric: what to read, what each point on the scale means for each criterion, and what the judge must not reward, such as length or a confident tone. `metafab check` validates scorers: the fields above, no unknown field, and the name rules.

### Running a scorer

| Command | Behaviour |
| --- | --- |
| `metafab scorer list [--subject <subject>]` | Lists the scorers, or those that apply to the subject |
| `metafab scorer prompt <name> --subject <subject>` | Prints the whole prompt for a judge |
| `metafab scorer record <name> --subject <subject> --result <file> [--scorer-version <hash>] [--round <n>] [--model <m>] [--dry-run]` | Checks a judge's result and records it as a score |

The prompt has five parts: the judge's role, with the statement that it has no stake in the work; the pinned subject and the commands to read it; the rubric; the criteria with their questions and the scale; and the output contract. The contract asks for one fenced `json` block at the end of the answer:

```json
{ "criteria": [{ "id": "real-names", "value": 4, "note": "Names match src/core/store/." }], "rationale": "…" }
```

`prompt` pins the subject as `score` does, and prints the `record` command to run, with the pinned subject in canonical form (such as `doc:plans/x.md@v7` or `pr:github.com/o/r#42@<sha>`) and `--scorer-version` set to the scorer file's Git blob hash. The CLI computes that hash from the file's bytes as Git's SHA-1 object format does (`blob <size>\0<bytes>`), so it needs no Git and equals `git hash-object` in a SHA-1 repository. `record` refuses a scorer file whose hash differs from `--scorer-version`, because the judge saw another rubric. A document subject is read with `metafab store show <path> --version <n>`, a pull request with `gh pr view` and `gh pr diff`, a branch with `git log` and `git diff` from its merge base with the default branch, a commit with `git show`, and a file with `git show <sha>:<path>`. `prompt` refuses a document whose local file has unsaved changes or was deleted, with the fix `Push it first`, because the score would name a version the judge did not read. It also refuses a `branch`, `commit` or `file` subject in another repository than this checkout's `origin`, with the fix `Run metafab scorer prompt in a checkout of <repo>`, because the judge reads those with local Git. `record` checks that the scorer applies to the subject, as `prompt` does.

`record` reads the last fenced `json` block in the result file (`-` reads standard input), so a judge's whole answer can be saved as it is. It checks that every criterion appears exactly once with a whole-number `value` on the scale and a non-empty `note`, and that `rationale` is a non-empty string. It computes `value` as the mean of the criteria values weighted by `weight`, rounded to two decimal places, and records the score with `scale`, `criteria` (with weights), `rationale`, `scorer`, `scorerVersion` (the blob hash above), `model`, and `run.round`. When the scorer file has uncommitted changes, `run.dirty` is `true`; outside Git, `run.dirty` is left out. An invalid result exits with code 1 and one line that names the problem, so a workflow can ask the judge once more. `--dry-run` prints the score and records nothing.

`list` works without a store. `prompt` and `record` need one for a `document` subject, because the backend holds its versions, and `record` needs one unless `--dry-run` is given.

How a workflow uses scorers is the factory's choice. A typical workflow runs each scorer that applies in its own fresh sub-agent, with only the prompt, records the result, and shows the scores to the person. Scores inform; a factory decides whether any score gates work.

## Moving folders out of Git

A repository that keeps documents in Git moves them in four steps:

1. Add `store` to `metafab.yaml` and run `metafab build`, which adds the store folders to the ignore block.
2. Run `metafab store import`. It copies the files that Git tracks in the store folders at a ref, `HEAD` by default, to the store.
3. Run `git rm -r --cached <each store folder>` and commit, with the changed `.gitignore` and `metafab.yaml`. The local files stay and become the mirror. Metafab never stages or commits.
4. Run `metafab store pull`, which records the local files.

`metafab store import [--ref <ref>] [--dry-run]` reads Git only. Each file gets one result:

| Result | When | Action |
| --- | --- | --- |
| `created` | No document has the path | Saved as version 1 |
| `updated` | The content differs, and the current version's content appears in the file's Git history at the ref | Saved as the next version |
| `unchanged` | The content is equal | Nothing |
| `diverged` | The content differs, and the current version's content does not appear in the file's Git history | Skipped and reported: someone saved a change Git does not have |
| `archived` | The document is archived | Skipped and reported |
| `refused` | The file breaks a path rule, a limit or a document rule | Skipped and reported with the problem |

Each save has the message `imported from git <short commit>` and an origin whose `commit` is the ref's commit. The import saves in batches within the backend's limits, so it is not atomic as a whole; a run that stops can run again, and saved files then count as `unchanged`. A branch cut before the move runs `import --ref <branch>` before it merges `main`, then resolves each modify/delete conflict on a store folder by taking the deletion.

Refused and diverged files, and a stopped run, give exit code 1.

## Keeping the mirror current

The mirror is empty in a fresh clone or a new worktree, and stale when someone else saves. Three things keep it current:

1. **Git hooks.** With `git-hooks: true` and a `store`, the `post-checkout` hook also runs `metafab store pull --if-signed-in --if-new`. A new worktree therefore fills its mirror; a branch switch changes nothing, because the mirror does not depend on the branch.
2. **Worktree setup scripts.** Run `metafab store pull --if-signed-in` after `metafab build`.
3. **Agents.** The [built-in `metafab` skill](building.md#built-in-metafab-skill) tells an agent to pull before a decision that depends on current documents, such as choosing the next plan, and to push after a change that deserves a version.

## Backends

Every backend gives the same results for the same commands. A contract test suite in this repository runs against each built-in backend.

### Remote

A remote backend is a server that implements the [Store protocol](store-protocol.md) at `url`. Metastore Cloud is one; a team can run its own. `METAFAB_STORE_URL` replaces `url` for one command, for example to use a local development server.

### Git

The Git backend keeps the store in commits on its own ref, so a team shares a store with no server and no account. Access and credentials are Git's own.

```yaml
store:
  backend: git                       # in this repository, on refs/metafab/store at origin
```

```yaml
store:
  backend: git
  repository: git@github.com:acme/factory-docs.git
  branch: main                       # a separate repository
```

- **In this repository** (the default): the store lives on `ref`, `refs/metafab/store` by default, at `remote`. A ref outside `refs/heads/` is not a branch: a clone or a normal `git fetch` of the code never downloads it, and it never shows in branch lists or pull requests. A team that wants to browse the store on its Git host can set `ref: refs/heads/<name>`.
- **In a separate repository**: the store lives on `branch` of `repository`. It has its own permissions, can serve several code repositories, and can be browsed on the Git host.

The store's history is the ref's history. Each change, and each batch of scores, is one commit, with the change's message, by the Git user who made it. The commits hold the same files as the [local backend](#local), and their layout belongs to the CLI.

How a command uses it:

1. The CLI keeps a cache of the store per machine in `~/.metafab/cache/store/<id>/`. A command fetches the ref once, at its first request, so every read in one command sees one state of the store.
2. A change is checked and applied to the fetched state with the same rules as every backend, committed, and pushed so that it only lands if the ref has not moved (a push with a lease).
3. When someone else pushed first, the CLI fetches again and applies the same change to the new state. Base versions are checked again, so an overlapping edit becomes an ordinary [conflict](#conflicts), and work that does not overlap lands without the person noticing. After five tries the command stops with exit code 6: `The store is busy; try again`.
4. When the fetch fails, a command that only reads uses the cached state and warns `Read from the store as fetched at <time>`. A command that writes needs the network and stops with exit code 6.

The Git backend needs no `login`: `metafab store login` says so. It never lets Git prompt for a password: it uses the credentials Git already has, such as an SSH key or a credential helper. A refused fetch or push is exit code 6 with Git's first error line. Its blob limit is 50 MB, below the 100 MB that GitHub refuses.

Trade-offs to know before choosing it: every write is a fetch and a push, so it takes a second or two; many agents writing at the same moment retry each other; anyone who can fetch the ref can read every document; and the history only grows, because removing a document's content means rewriting the ref.

### Local

The local backend keeps the store in `~/.metafab/store/<name>/`, or in `$METAFAB_STORE_DIR/<name>/` when that variable is set. Every working tree on the machine that uses the same name shares it, so parallel worktrees see each other's saves. It needs no network and no credentials. Its author is `git config user.name`, else the operating system user name.

The local backend does not share documents between machines. Use it for one developer, for trying the store, and for tests. Its file layout belongs to the CLI and can change between versions.

### Credentials

`metafab store login [--url <url>] [--token-stdin]` saves a token for a remote store:

1. It reads the protocol's `info` route and prints where to create a token.
2. In a terminal, it asks for the token without echoing it. With `--token-stdin`, it reads the token from standard input. Without a terminal and without the flag, it exits with code 2.
3. It checks the token with the `info` route, prints the identity it belongs to, and saves it.

Tokens are saved in `~/.metafab/credentials.json`, keyed by the URL's scheme, host and port, with mode 0600. `METAFAB_STORE_TOKEN` replaces the saved token. `metafab store logout [--url <url>]` removes it. Commands other than `login` never prompt for a token; a missing or refused token stops them with exit code 6 and the fix `Run metafab store login`.

## Command behaviour

Store commands follow the [CLI rules](cli.md#command-behaviour), with these additions:

1. Every command finds the factory as other commands do, and stops with exit code 1 when `metafab.yaml` has no `store`: `No store is configured`, with the fix `Add a store section to .factory/metafab.yaml`. `login` and `logout` with `--url` need no factory.
2. Every command supports `--json`. Each result contains the documents or scores it changed or listed.
3. A command that cannot reach a remote backend, or whose credentials are missing or refused, exits with code 6. Read requests are retried three times with backoff; a push is retried with the same idempotency key.
4. A command never changes the code repository's Git state: it never stages, commits, checks out or pushes there. The one exception is the [Git backend](#git), which commits to and pushes only its own store ref, from a private cache outside the working tree.
5. Paths can be given as repository paths (`docs/plans/x.md`), as store paths (`plans/x.md`), or as folders ending in `/`.

## Security and privacy

- Documents and scores can contain code, plans and transcripts. A remote backend controls who can read and write. The Git backend gives everyone who can fetch the ref read access to all of it, and everyone who can push it write access. The local backend relies on file permissions.
- The CLI sends only the documents and scores a command names, plus the origin fields in [Origin](#origin).
- Tokens are never written to the repository, to a log line, or to `--json` output.
- Archiving keeps content. Removing content for good is a backend administration task, outside the protocol.

## Background

Dragonfly built this design for its own factory in November 2026 (its PMAP-1 to PMAP-10). It moved about 1,100 working documents out of Git into a platform table, filled a gitignored mirror on install, saved through an atomic batch API with base versions, added sync windows and a local index when the mirror grew, and added scores and judges. Its lessons are in this spec: atomic batches, never merging on the server, conflict copies, the state file, the index, units in sync windows, root-relative references, pinned score subjects, and resolving commits on the client. Metafab generalises it: any backend, factory-declared rules instead of code, and scorers as a factory part.

## Open questions

1. **Server-side rules.** Should a backend run the document rules too, so that two pushes at the same time cannot save duplicate unique values? Proposal: later. The protocol reserves a `rules` capability; the CLI would send the factory's rules with each change.
2. **Body search.** Should `ls` search document bodies on the backend? Proposal: later, as a protocol capability. Until then, `pull --all` then `grep`.
3. **Merge events.** Should a backend learn when a pull request merges, through a GitHub App, and update the plan? Proposal: a Metastore Cloud feature, outside the protocol.
4. **Scores on pull requests as checks.** Proposal: a Metastore Cloud GitHub App feature. Advisory first.
