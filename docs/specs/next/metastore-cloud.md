# Metastore Cloud (draft)

> Draft. Not the acceptance standard for this repository. Metastore Cloud is built in its own repository, `seasb/metafab-metastore`, and planned there. This draft records what it must do so that the two repositories agree. See [Next iterations](README.md).

Metastore Cloud is our hosted [metastore](../metastore.md). A team points `metafab.yaml` at it and gets a shared, current copy of its factory's documents and scores, with no server to run.

## What it must do

1. **Implement the [Metastore protocol](../metastore-protocol.md), version 1,** and pass the contract suite with `npm run test:contract` against a fresh metastore in CI.
2. **Accounts, organisations and metastores.** A person signs in with GitHub. An organisation owns metastores; each metastore has one base URL, `https://metastore.metafab.dev/<org>/<metastore>`. Members have `read` or `write`; owners also manage members.
3. **Tokens.** A person creates personal tokens at the URL `GET /v1/info` returns as `tokenUrl`, scoped to one organisation, with an expiry. CI uses a token tied to the organisation, not a person. Tokens are stored hashed.
4. **Storage.** Postgres for documents, versions, scores and origins; object storage for blobs, uploaded through signed URLs. Every version is kept. Indexes cover path prefixes, properties (for filtered views), and score subject, name and time.
5. **Web app.**
   - A document browser by folder, with filters on properties, the rendered document, its properties, its version history with diffs, and the origin of each version (repository, branch, commit, agent, workflow) linked to GitHub.
   - Saved views over properties, such as "plans with `status: ready`", which replace the roadmap file for teams that want that.
   - A scores page: by name, by subject kind and over time, with each score's criteria and rationale, and the version or commit it scored.
   - Read-only at first. Editing in the browser comes later.
6. **Limits** as the protocol's defaults, with per-plan quotas for storage and requests.
7. **Self-hosting.** The same code runs as a container with Postgres and an S3-compatible store, for teams that keep data on their own infrastructure.

## Later

- A GitHub App that records merges and closes (the [branch-aware draft](metastore.md)'s default links) and shows scores on pull requests as checks, advisory first.
- Server-side document rules (the `rules` capability in [Metastore: Open questions](../metastore.md#open-questions)).
- Body search, as a protocol capability.
- Forwarding scores to tracing and evaluation tools such as Langfuse.

## Open questions

1. Pricing and the free tier: by metastore, by member, or by storage?
2. Does a metastore belong to one repository, or can several repositories in an organisation share one? The protocol allows sharing, and `origin.repo` tells changes apart; the web app needs a repository filter if they share.
3. Data residency for teams outside the United States.
