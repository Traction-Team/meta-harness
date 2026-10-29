# Store (draft)

> Draft for a later version. Not the acceptance standard. See [Next iterations](README.md).

The store records metadata about work, such as scores, memory, and decisions, and follows that metadata through branches, pull requests, and merges. Metafab provides it as `metafab store` commands. A factory's workflows write to it and read from it.

The commands work with more than one store implementation, called a **backend**. Metastore, our hosted product, is one backend. A team can also keep records in the repository itself, or in its own database through an adapter. See [Backends](#backends).

## Problem

Teams now engineer their delivery process the way they engineer AI features: with judges, scores, evaluations, and memory. A factory can already run a judge as a workflow step, but the result disappears into a chat transcript. Nobody can answer:

- For a released feature, what did the plan, code review, and QA judges score, and how did those scores change?
- Which scores belong to this pull request, and do they pass?
- What did agents learn while building this branch, and should another developer see it yet?

The hard part is not storing a record. It is knowing **which work a record belongs to** as that work moves from a plan on `main`, to a feature branch, to a pull request, to a merge.

## Goals

1. Attach any metadata to any subject: a file, a set of files, a commit range, a plan, a pull request, or a URL.
2. Understand Git branches: a record made on a branch is visible on that branch and its descendants, and on `main` only after the work merges.
3. Keep the whole history: from a merged change, find every record made along the way.
4. Treat scores as a first-class record kind, and show them on pull requests as GitHub checks.
5. Support other kinds, starting with agent memory.
6. Answer "what is visible here" with one fast query, from a hosted service, with a serverless Git alternative.

## The store is dumb

The store saves records, links them, and answers queries. It makes no judgement about them. Every policy belongs to the factory, in its workflows and skills:

- Whether memory is reviewed before the team relies on it.
- Which score passes, and what threshold applies.
- Whether scores from different rubrics or judge models can be compared.
- Which records a workflow reads, and what it does with them.

## Non-goals

- Running workflows or judges. The factory does that; the store keeps results.
- Replacing Git, the issue tracker, or the pull request.
- A general analytics product. Queries serve the factory and the pull request first.

## Concepts

| Term | Meaning |
| --- | --- |
| **Record** | One immutable entry: a kind, a subject, a value, and its context |
| **Kind** | The type of record, such as `score`, `memory`, `decision`, or a team-defined kind |
| **Subject** | What the record is about. See [Subjects](#subjects) |
| **Context** | Where and when the record was made: repository, branch, commit, workflow, agent, author, time |
| **Anchor** | A location (repository and branch), optionally narrowed to an object such as a file or plan. See [Anchors](#anchors) |
| **Link** | An edge between two anchors that factory workflows write. Links decide what a location can see. See [Links](#links) |
| **Backend** | The implementation that holds the records |

### Record shape

```json
{
  "id": "01JC8Z4M…",
  "kind": "score",
  "subject": { "type": "plan", "ref": "docs/plans/14-bundling.md" },
  "value": { "scorer": "plan-judge", "score": 0.82, "scale": "0-1", "pass": true,
             "rubric": ".factory/scorers/plan-judge/SKILL.md", "summary": "Two edge cases unscoped" },
  "context": {
    "repo": "github.com/seasb/meta-harness",
    "branch": "main",
    "commit": "a1b2c3d",
    "dirty": true,
    "workflow": "plan-feature",
    "agent": "opencode/claude-opus",
    "author": "sebastian",
    "at": "2026-10-29T10:12:00Z"
  },
  "supersedes": null
}
```

Records are append-only. A correction is a new record with `supersedes` set to the old id.

## Subjects

| Type | Example | Notes |
| --- | --- | --- |
| `path` | `src/build/compile.ts` | One file, at the record's commit |
| `paths` | `src/build/**` | A glob, for a group of files |
| `range` | `main...feat/bundling` | A diff. Use this for large changes instead of listing files |
| `plan` | `docs/plans/14-bundling.md` | A path with plan semantics, so a branch can find its plan |
| `pr` | `github:seasb/meta-harness#42` | A pull request |
| `url` | `https://…` | Anything outside the repository |
| `repo` | — | The whole repository at a ref |

### Subjects that are deleted

A subject is identified by its reference together with the record's commit, not by a file that exists today. When a file is deleted, such as a plan file removed when its pull request merges, its records and their lineage stay intact and can still be queried. To show the subject as it was, the store reads it from Git: `git show <commit>:<path>`.

### Subjects that are renamed

When a file or folder moves, its records should follow it. `metafab store rename` writes a rename:

```sh
metafab store rename src/build/compile.ts src/compile/index.ts
```

```json
{ "kind": "rename",
  "from": "path:src/build/compile.ts", "to": "path:src/compile/index.ts",
  "context": { "branch": "refactor/compile", "commit": "c4d5e6f" } }
```

A rename is linked like any record, so it follows visibility: on `refactor/compile` the new path shows the old path's records at once, and on `main` only after the branch merges. A query for the new path includes records for the old path made before the rename. Renaming a folder renames every path below it.

A factory workflow can run `metafab store rename` for each rename Git detects in a branch, such as from `git diff --find-renames --name-status`. The store does not detect renames itself.

### Large sets of files

A code review covers hundreds of files. Storing one record per file is wasteful and loses the fact that the score is about the change as a whole. Proposal:

1. A judge scores a `range` subject. The store keeps one record.
2. A query by path matches a `range` record when that path appears in the range's diff. The store computes the diff from Git when asked, and caches the file list.
3. A judge can add per-file records for specific findings, such as a file it scored low.

## Anchors and links

The store does not know Git's commit graph, and it gives no branch special meaning. `main`, `develop`, `staging`, and feature branches are all just locations. Factory workflows tell the store how work moves by writing **links**. The store follows them.

### Anchors

An **anchor** is a location, optionally narrowed to an object:

| Part | Meaning | Examples |
| --- | --- | --- |
| Location | A repository and branch, optionally at a commit | `main`, `feat/x`, `staging@5a6b7c8` |
| Object | Optional. Any [subject](#subjects) | `plan:docs/plans/14-bundling.md`, `commit:a1b2c3d`, `pr:42` |

Written as `[<object>@]<location>`:

```text
main                                     the whole branch
plan:docs/plans/14-bundling.md@main      one plan, as it is on main
commit:a1b2c3d@feat/x                    one commit on feat/x
```

Every record is attached to an anchor: its subject is the object, and its context branch is the location.

### Links

A **link** is an edge from one anchor to another: what is visible at the source becomes visible at the target, from that moment. The store keeps links like records: append-only, with context. It does not check that they make sense; the factory decides when to write them.

```sh
metafab store link <from> <to>
```

When the source anchor has an object, the link brings only the records for that object. When it is a bare location, it brings everything visible there. One kind of link therefore covers forks, merges, and narrower hand-overs:

| Situation | Command |
| --- | --- |
| An agent starts a branch for a plan written on `main` | `metafab store link plan:docs/plans/14-bundling.md@main feat/x` |
| A branch should inherit everything from where it started | `metafab store link develop feat/x` |
| A pull request merges `feat/x` into `staging` | `metafab store link feat/x staging --via pr:42` |
| `staging` is promoted to `main` | `metafab store link staging main` |
| A branch is the work for issue 87 | `metafab store link issue:87 feat/x --relate` |

In the first row, `feat/x` sees the plan and its scores, but not memory and scores about unrelated work on `main`. It is linked to the plan, not to `main`. Because the plan's anchor is on `main`, the trail still shows where the plan came from.

`--relate` makes a **related link**: the two anchors are connected for the [trail](#trail), but nothing becomes visible at the target.

```json
{ "kind": "link",
  "from": "plan:docs/plans/14-bundling.md@main", "to": "feat/x",
  "context": { "workflow": "build-plan", "commit": "a1b2c3d", "at": "2026-10-29T11:02:00Z" } }
```

A related link adds `"relate": true`.

Because links join locations, not commits, merge commits, squash merges, and rebase merges all behave the same. A branch name can be reused after a branch is dropped, so the store gives each branch instance its own id.

Two other commands change how work moves, and are stored the same way:

| Command | Meaning |
| --- | --- |
| `metafab store rename <old> <new>` | An object moved, such as a path to a new path. See [Subjects that are renamed](#subjects-that-are-renamed) |
| `metafab store drop <branch>` | The branch ended without being linked anywhere. See [Branches that never merge](#branches-that-never-merge) |

Links are written by:

1. Factory workflows, such as `build-plan` when it creates a branch for a plan.
2. The GitHub connection, for merged and closed pull requests. See [Default links](#default-links).
3. The CLI, for new branches. See [Default links](#default-links).
4. A person or agent with `metafab store link`.

### Default links

Some links should exist even when no workflow writes them:

| When | Default | Written by |
| --- | --- | --- |
| The first write on a branch that has no incoming link | Link `<parent> → <branch>`, where the parent is the branch's upstream, or else the default branch | The CLI |
| A pull request merges | Link `<head> → <base>`, with `via: pr:<n>` | The GitHub connection |
| A pull request closes without merging, and its branch has no other open pull request | Drop `<head>` | The GitHub connection |

Pull requests are usually merged by a person in GitHub, not by an agent, so no workflow is running at that moment. The GitHub connection, an App or Action, is therefore required for merges to reach the base branch automatically. Without it, a workflow or a person writes the link with `metafab store link`.

A team turns the CLI default off in `metafab.yaml` when its workflows write every branch link themselves:

```yaml
store:
  default-links: false
```

### Visibility

The strict query is: **at this location, which records have made it into its lineage?** The answer is one flattened list of records, wherever they were first written.

A record is visible at a location when one of these is true:

1. It was written at that location.
2. A link into the location brought it, and it was visible at the link's source when the link was written. Related links bring nothing.

The rule applies recursively. A plan scored on `main`, linked to `feat/x`, reviewed there, and linked into `main` by the merge, shows the plan score and the review scores on `main` after the merge. Nothing from `feat/x` shows on `main` before it.

A record written at the source after a link is not brought by that link. A later link brings it.

### Trail

The fuzzy query is: **how did this get here, and what is connected to it?** From any anchor, the trail follows every link, related links and renames included, in both directions, up to a depth, and returns each record with the chain of links that reached it.

Trail is for people and history views, such as "for PR #42, show the plan score, every code review score, and the QA score". Visibility is for agents and checks, which need a strict answer.

### Uncommitted work

Agents often write records before committing. A record stores the branch, the `HEAD` commit, and `dirty: true` when the working tree has changes. Its place in time is when it was written, so it needs no commit of its own.

### Ordering

Records and links are ordered by write time, as the store receives them. When two people write on the same branch at once, or a branch is force-pushed, write time still decides. "Before a link" and "after a link" in [Visibility](#visibility) use the same order.

### Branches that never merge

A branch can be deleted, or its pull request closed, without merging. `metafab store drop <branch>` marks it, or the GitHub connection does when the pull request closes. Its records are **hidden but kept**: no link takes them anywhere, and normal queries do not return them. `metafab store trail --include-dropped` and history views can still show them, so a team can study failed attempts.

### Private until merged

Visibility rules make branch memory private to the branch by default. A developer on `main` or another branch does not see memory from `feat/x` until it merges. A record can widen its visibility with `"visibility": "repo"` for facts that apply everywhere, or narrow it with `"visibility": "author"` for notes that never leave one developer.

## Record kinds

### Scores

Scores are the first kind to build.

- `value.scorer` names the judge, ideally a skill in the factory's reserved `scorers/` folder.
- `value.score` is a number. `value.scale` describes it. `value.pass` is the judge's verdict.
- `value.rubric` and `value.model` record the rubric and judge model used. The factory decides whether scores from different rubrics or models are comparable.
- `value.evidence` links to a report, a transcript, or a file.

### Memory

- An agent writes what it learned: a convention, a pitfall, a decision, a fix that worked.
- Subjects are usually `path`, `paths`, or `repo`.
- A factory skill reads memory visible on the current ref for the paths an agent is about to change.
- Memory merges into `main` with the branch, so the team keeps what the work taught.
- Any review of memory before the team relies on it is a factory step, not a store feature.

### Team-defined kinds

A team declares extra kinds with a JSON Schema for `value`. The store validates records against it.

## History

From any subject, the store answers:

- **Trail:** every record visible at a ref for that subject, in time order, with the branch and workflow that made it.
- **Release history:** for a merged pull request, every record made on its branch and on the plan it implemented, found by following links.
- **Trend:** how one scorer's results changed across a branch's commits.

Example: "For PR #42, show the plan score, every code review score, and the QA score, and which commit each was made at."

## GitHub integration

A GitHub App or Action reports store records on pull requests:

1. A check run per scorer, or one summary check, at the pull request's head commit.
2. The check passes or fails from `value.pass`, or from a threshold in configuration.
3. The check summary shows the trail: the plan score from `main`, then each score on the branch.
4. Teams can make a check required, so a pull request cannot merge without passing judges.
5. It writes the [default links](#default-links) for merged and closed pull requests.

## Backends

`metafab store` defines one interface. Every backend answers the same visibility and trail queries with the same result.

A backend has two parts:

- **Log:** the source of truth. An append-only list of records and links. It never needs to understand links.
- **Index:** a queryable database built from the log. It flattens links so that "what is visible here" is one indexed query, not a replay of the whole history.

| Backend | Log | Index | Use |
| --- | --- | --- | --- |
| **Metastore** (primary) | Postgres, behind an HTTP API | The same Postgres | Our hosted product, or self-hosted. Fast queries, multi-user, GitHub checks, dashboards |
| **Git ref** (alternative) | One file per record on a shared ref, such as `refs/metafab/store`, pushed and fetched with the repository | A local SQLite database that `metafab` keeps in `.git/` | No server. Works offline |
| **Adapter** | A team's own database | Supplied by the adapter, or the local SQLite index | Teams with their own infrastructure |

For the Git ref backend, the local index is a cache. `metafab store` fetches the ref and adds only records that are new since the last sync, so it never loads the whole history into memory. Deleting the cache only costs a full rebuild. Two people can write at once safely, because each record is its own file and two writes never touch the same one; a rejected push is fetched, combined, and retried.

The team chooses the backend in `metafab.yaml`, because every developer must write to the same place:

```yaml
store:
  backend: metastore
  url: https://metastore.example.com/seasb/meta-harness
```

Credentials are personal and never committed. They come from Git config or environment variables.

## Interface

A CLI and an agent skill, so workflows can use the store in any harness:

```sh
metafab store put score --subject plan:docs/plans/14-bundling.md --value '{"scorer":"plan-judge","score":0.82,"pass":true}'
metafab store get --kind score --subject pr:42
metafab store trail --subject path:src/build/compile.ts
metafab store memory --paths 'src/build/**'
metafab store rename src/build/compile.ts src/compile/index.ts
metafab store link plan:docs/plans/14-bundling.md@main feat/x
metafab store link feat/x main --via pr:42
metafab store link issue:87 feat/x --relate
metafab store drop feat/abandoned
metafab store trail --anchor pr:42 --depth 4
```

Every command reads context from Git by default and prints JSON with `--json`. The built-in `metafab` skill teaches agents these commands, and [Bundling](bundling.md) can install store-specific skills for the developer's environment.

## Security and privacy

- Records can contain code, transcripts, and memory. In Metastore, access follows the team's repository permissions. In the Git ref backend, anyone who can fetch the repository can read every record, including unmerged branch memory: visibility rules filter queries, they do not restrict access.
- Records with `visibility: author` are never pushed.
- The CLI redacts known secret shapes before writing.
- Deleting a record removes its content and keeps a tombstone, so history stays consistent.

## Open questions

1. What is the smallest useful first version?

Cross-repository history is out of scope for now.
