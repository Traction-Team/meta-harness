# Metastore (draft)

> Draft for a later version. Not the acceptance standard. See [Next iterations](README.md).

Metastore records metadata about work, such as scores, memory, and decisions, and follows that metadata through branches, pull requests, and merges. It is a separate product next to Metafab. A factory's workflows write to it and read from it. Teams can use the reference implementation, host their own, or use their own database behind the same interface.

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
6. Work with no server by default, and scale to a hosted store.

## Non-goals

- Running workflows or judges. The factory does that; Metastore stores results.
- Replacing Git, the issue tracker, or the pull request.
- A general analytics product. Queries serve the factory and the pull request first.

## Concepts

| Term | Meaning |
| --- | --- |
| **Record** | One immutable entry: a kind, a subject, a value, and its context |
| **Kind** | The type of record, such as `score`, `memory`, `decision`, or a team-defined kind |
| **Subject** | What the record is about. See [Subjects](#subjects) |
| **Context** | Where and when the record was made: repository, branch, commit, workflow, agent, author, time |
| **Lineage** | The links between commits and branches that decide which records a ref can see |

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

A subject is identified by its reference together with the record's commit, not by a file that exists today. When a file is deleted, such as a plan file removed when its pull request merges, its records and their lineage stay intact and can still be queried. To show the subject as it was, Metastore reads it from Git: `git show <commit>:<path>`.

### Large sets of files

A code review covers hundreds of files. Storing one record per file is wasteful and loses the fact that the score is about the change as a whole. Proposal:

1. A judge scores a `range` subject. Metastore stores one record.
2. A query by path matches a `range` record when that path appears in the range's diff. Metastore computes the diff from Git when asked, and caches the file list.
3. A judge can add per-file records for specific findings, such as a file it scored low.

## Branch-aware visibility

Visibility follows Git ancestry. A record made at commit `C` is visible on a ref when `C` is in that ref's history.

- A plan scored on `main` at commit `M` is visible on every branch created from `M` or later. Branching needs no extra link.
- A review scored on `feat/x` at commit `F` is not visible on `main` until `main` contains `F`.
- After a merge commit, `main` contains `F`, so the record becomes visible on `main` with no extra step.

### Uncommitted work

Agents often write records before committing. A record made with uncommitted changes stores the `HEAD` commit, sets `dirty: true`, and stores the branch name. It is visible on that branch and its descendants. When the branch is merged, it follows the branch's records.

### Squash and rebase merges

A squash or rebase merge creates new commits, so ancestry breaks. Metastore records a **lineage link** from the original branch head to the new commit:

```json
{ "kind": "lineage", "from": { "branch": "feat/x", "commit": "f9e8d7c" },
  "to": { "branch": "main", "commit": "5a6b7c8" }, "via": "github:seasb/meta-harness#42" }
```

A lineage link makes every record visible at `from` also visible at `to` and its descendants. It is written by one of:

1. A GitHub App or Action that listens for merged pull requests.
2. A factory workflow, such as `finish-plan`, after the merge.
3. `metastore link` run by a person.

Plain merges need no link, but writing one anyway keeps the history readable.

### Private until merged

Visibility rules make branch memory private to the branch by default. A developer on `main` or another branch does not see memory from `feat/x` until it merges. A record can widen its visibility with `"visibility": "repo"` for facts that apply everywhere, or narrow it with `"visibility": "author"` for notes that never leave one developer.

## Record kinds

### Scores

Scores are the first kind to build.

- `value.scorer` names the judge, ideally a skill in the factory's reserved `scorers/` folder.
- `value.score` is a number. `value.scale` describes it. `value.pass` is the judge's verdict against its threshold.
- `value.rubric` points to the rubric or skill version used, so scores from different rubric versions are not compared blindly.
- `value.evidence` links to a report, a transcript, or a file.

### Memory

- An agent writes what it learned: a convention, a pitfall, a decision, a fix that worked.
- Subjects are usually `path`, `paths`, or `repo`.
- A factory skill reads memory visible on the current ref for the paths an agent is about to change.
- Memory merges into `main` with the branch, so the team keeps what the work taught.
- Open question: whether merged memory needs review before others see it, like code.

### Team-defined kinds

A team declares extra kinds with a JSON Schema for `value`. Metastore validates records against it.

## History

From any subject, Metastore answers:

- **Trail:** every record visible at a ref for that subject, in time order, with the branch and workflow that made it.
- **Release history:** for a merged pull request, every record made on its branch and on the plan it implemented, linked through lineage.
- **Trend:** how one scorer's results changed across a branch's commits.

Example: "For PR #42, show the plan score, every code review score, and the QA score, and which commit each was made at."

## GitHub integration

A GitHub App or Action reports Metastore records on pull requests:

1. A check run per scorer, or one summary check, at the pull request's head commit.
2. The check passes or fails from `value.pass`, or from a threshold in configuration.
3. The check summary shows the trail: the plan score from `main`, then each score on the branch.
4. Teams can make a check required, so a pull request cannot merge without passing judges.
5. On merge, it writes the lineage link.

## Storage

Metastore defines an interface. Implementations are interchangeable.

| Backend | Use |
| --- | --- |
| **Git-native** (default) | Records as append-only JSON Lines on a dedicated ref, such as `refs/metastore/records`, pushed and fetched with the repository. No server. Works offline |
| **Hosted** | A Metastore service with an HTTP API, for teams that want dashboards, cross-repository queries, and fast history |
| **Bring your own** | An adapter for a team's database, behind the same interface |

The Git-native backend must handle concurrent writers. One option is one file per record named by its id, so writes never conflict and merges are unions.

## Interface

A CLI and an agent skill, so workflows can use it in any harness:

```sh
metastore put score --subject plan:docs/plans/14-bundling.md --value '{"scorer":"plan-judge","score":0.82,"pass":true}'
metastore get --kind score --subject pr:42
metastore trail --subject path:src/build/compile.ts
metastore memory --paths 'src/build/**'
metastore link --from feat/x@f9e8d7c --to main@5a6b7c8 --via pr:42
```

Every command reads context from Git by default and prints JSON with `--json`.

Metafab's part is small: a fab can declare that it uses Metastore, and [Bundling](bundling.md) can install the Metastore skill and configuration for the developer's environment.

## Security and privacy

- Records can contain code, transcripts, and memory. They follow the repository's access rules in the Git-native backend.
- Records with `visibility: author` are never pushed.
- The CLI redacts known secret shapes before writing, as nodeterm and Metafab already do for reports.
- Deleting a record removes its content and keeps a tombstone, so history stays consistent.

## Open questions

1. Is Metastore a separate package and CLI (`metastore`), or a set of `metafab meta` commands? The product boundary argues for separate.
2. Which Git-native layout survives large histories: one ref, one ref per branch, or Git notes on commits?
3. How should a record about uncommitted work on a branch that is deleted without merging be handled: kept, hidden, or expired?
4. Does memory need a review step before it becomes visible on `main`?
5. How do records follow a file that is renamed or moved?
6. How are scores compared when the rubric or the judge model changes?
7. Do cross-repository histories matter, such as a fab change that affects many repositories?
8. What is the minimum first version: scores on `range` subjects, Git-native storage, and a GitHub check?
