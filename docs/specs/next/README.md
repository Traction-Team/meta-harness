# Next iterations

These are draft specifications for work after version 1. They are **not** the acceptance standard yet. No plan may link to them until a person moves a section into the main specs in `docs/specs/`, usually through `prioritise-roadmap` and `plan-feature`.

Each draft records the intent, a proposed design, and the open questions to settle before planning. Take them one at a time.

## Three roles of Metafab

| Role | What it does | Where it is specified |
| --- | --- | --- |
| Distributor | Find, import, and update other people's fabs | [Sharing](../sharing.md) (v1). Finding fabs is still open |
| Bundler | Compile one factory into the right skills for each developer's environment | [Bundling](bundling.md) (draft) |
| Record keeper | Attach metadata, such as scores and memory, to work, and follow it through branches and merges | [Metastore](metastore.md) (draft) |

## Drafts

| File | Summary |
| --- | --- |
| [Bundling](bundling.md) | Environment profiles, conditional skill content, skill composition, and configurable skill folders |
| [Metastore](metastore.md) | A branch-aware store of metadata about work: scores, memory, and other records, with history across branches, pull requests, and merges |

## Relation to v1 deferred features

The [v1 deferred features](../README.md#deferred-features) include scorers, score records, `metafab score`, history links, the Git ledger, and runtimes. These drafts propose how some of them return:

- `runtimes/` and agent-tool instructions → environment profiles in [Bundling](bundling.md).
- Scorers, score records, history links, and the Git ledger → [Metastore](metastore.md).
