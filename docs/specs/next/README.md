# Next iterations

These are draft specifications for work after version 1. They are **not** the acceptance standard yet. No plan may link to them until a person moves a section into the main specs in `docs/specs/`, usually through `prioritise-roadmap` and `plan-feature`.

Each draft records the intent, a proposed design, and the open questions to settle before planning. Take them one at a time.

## Three roles of Metafab

| Role | What it does | Where it is specified |
| --- | --- | --- |
| Distributor | Find, import, and update other people's fabs | [Sharing](../sharing.md) (v1). Finding fabs is still open |
| Bundler | Compile one factory into the right skills for each developer's environment | [Bundling](bundling.md) (draft) |
| Record keeper | Keep a factory's working documents and scores in a shared store outside Git | [Metastore](../metastore.md) (version 2, plans 2.001 to 2.009). Branch-aware records and memory: [draft](metastore.md) |

## Drafts

| File | Summary |
| --- | --- |
| [Bundling](bundling.md) | Environment profiles, conditional skill content, skill composition, and configurable skill folders |
| [Branch-aware records](metastore.md) | Records visible only on a branch until it merges, links between branches, the trail, and agent memory. Partly superseded by the version 2 [Metastore](../metastore.md) |
| [Metastore Cloud](metastore-cloud.md) | What our hosted metastore, built in its own repository, must do |

## Relation to v1 deferred features

The [v1 deferred features](../README.md#deferred-features) include scorers, score records, `metafab score`, history links, the Git ledger, and runtimes. These drafts propose how some of them return:

- `runtimes/` and agent-tool instructions → environment profiles in [Bundling](bundling.md).
- Scorers and score records → the version 2 [Metastore](../metastore.md). History links and the Git ledger → [Branch-aware records](metastore.md).
