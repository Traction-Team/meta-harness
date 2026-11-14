# Store protocol

> **Version 2.** Status: draft for approval, written 14 Nov 2026. Protocol version **1**. The `remote` backend in [Store](store.md) speaks it; Plan 2.003 implements the client.

This is the HTTP API that a remote store implements. Metastore Cloud implements it, and so can any team's own server. The CLI is the reference client. A server that implements it passes the contract test suite in this repository ([Conformance](#conformance)).

## Conventions

- **Base URL.** The `url` in `metafab.yaml` is the store's base URL, such as `https://metastore.metafab.dev/seasb/meta-harness`. One base URL is one store. Every route below is relative to it and starts with `/v1/`.
- **Encoding.** Requests and responses are JSON in UTF-8 (`Content-Type: application/json`), except blob uploads and downloads.
- **Authentication.** Every request to the base URL carries `Authorization: Bearer <token>`, except that `GET /v1/info` may be sent without one so that `login` can learn where to create a token. A server decides what a token may read and write. A client sends the token only to the base URL's origin: never to a blob upload URL, which carries its own `headers`, and never across a redirect to another origin.
- **Paths in queries.** Store paths contain `/` and spaces, so they travel in the query string or the body, never in the route.
- **Times.** ISO 8601 in UTC with a `Z`, such as `2026-11-14T03:12:00.000Z`.
- **Unknown fields.** A client ignores response fields it does not know. A server refuses a request with an unknown field with 422, so a typo is never silently dropped. Three objects are open and accept any field: `origin`, a score's `run`, and a document's `properties`.
- **Pagination.** A list route takes `limit` and `cursor`. Its response has `next`, a cursor string, or `null` on the last page. A server may return fewer items than `limit`. The cursor is opaque.

## Errors

An error response has a status code and this body:

```json
{ "error": { "code": "conflict", "message": "plans/x.md is at version 8, not 7.", "details": { } } }
```

| Status | `code` | Meaning | The CLI |
| --- | --- | --- | --- |
| 400 | `bad-request` | The request is malformed: the body is not JSON, a field has the wrong JSON type, or a query value is not valid (such as `limit=abc`) | Exit 1; a client bug |
| 401 | `unauthenticated` | No token, or the token is not valid | Exit 6, suggests `metafab store login` |
| 403 | `forbidden` | The token cannot do this | Exit 6 |
| 404 | `not-found` | The store, document or version does not exist | Depends on the command |
| 409 | `conflict` | A base version is stale. `details.conflicts` lists them | Conflict copies, exit 1 |
| 409 | `archived` | A save names an archived document. `details.paths` lists them | Exit 1, suggests `restore` |
| 413 | `too-large` | The request is over a limit. `details.limit` names it | Exit 1 |
| 422 | `invalid` | A document or score breaks a rule, or the request has an unknown field. `details.problems` lists them | Exit 1 |
| 426 | `upgrade-required` | The server no longer supports this protocol version | Exit 6, suggests upgrading `@seasb/metafab` |
| 429 | `rate-limited` | Too many requests. `Retry-After` gives seconds | Retries |
| 5xx | any | A server failure | Retries reads; exit 6 |

A problem is `{ "index": <n>, "path": <store path>?, "message": <text> }`, where `index` is the position of the change or score in the request.

## Retries and idempotency

A client retries a `GET` up to three times, after 1, 2 and 4 seconds, on a network error, 429 or 5xx, honouring `Retry-After`.

`POST /v1/changes` takes an `Idempotency-Key` header, a ULID the client creates for one push. A server keeps the result of each key for at least 24 hours, whatever the outcome (`saved`, `conflict`, `archived` or `invalid`), and answers a repeated key with the first result, without applying the change again. A client retries a push with the same key, and uses a new key for every new push, such as one after the person resolved a conflict. A 5xx answer is not a result: the change was not applied, and the key is not kept.

Scores carry their own `id`. A server ignores a score whose `id` it already holds and returns the stored score, so a retried `POST /v1/scores` never records a score twice.

## Objects

### Origin

As defined in [Store: Origin](store.md#origin). Every field is optional; unknown fields are stored and returned.

```json
{ "repo": "github.com/seasb/meta-harness", "branch": "feat/2.004-pull", "commit": "a1b2…", "dirty": false,
  "tool": "metafab/2.0.0", "agent": "claude", "session": "ses_01J…", "workflow": "build-plan" }
```

### Document version

```json
{
  "path": "plans/2.004-pull.md",
  "version": 3,
  "state": "active",
  "format": "markdown",
  "title": "Plan 2.004: pull fills the mirror",
  "properties": { "title": "feat: …", "status": "ready", "needs": ["plans/2.002-model.md"] },
  "body": "# Plan 2.004 …",
  "blob": null,
  "message": "plan approved",
  "savedAt": "2026-11-14T03:12:00.000Z",
  "savedBy": { "id": "usr_123", "name": "Sebastian" },
  "origin": { "repo": "github.com/seasb/meta-harness", "branch": "main", "commit": "a1b2…" }
}
```

- `state` is `active` or `archived`. A version that archives a document has `state: archived` and the content of the version before it.
- For a `file` document, `properties` is `{}`, `body` is `""`, and `blob` is `{ "sha256": "<64 hex>", "size": <bytes>, "contentType": "<type/subtype>" }`.
- A **list item** is the same object without `body`.
- A **version summary** has `version`, `state`, `message`, `savedAt`, `savedBy` and `origin`.

### Score

The fields in [Store: Scores](store.md#scores), with `recordedAt` and `recordedBy` added by the server. `recordedBy` has the shape of `savedBy`.

## Routes

### `GET /v1/info`

Checks the token and describes the store. `login` calls it.

```json
{
  "protocol": 1,
  "store": { "id": "ms_01J…", "name": "seasb/meta-harness" },
  "identity": { "id": "usr_123", "name": "Sebastian" },
  "tokenUrl": "https://metastore.metafab.dev/settings/tokens",
  "capabilities": [],
  "limits": { "changes": 500, "requestBytes": 104857600, "bodyBytes": 26214400, "blobBytes": 104857600,
              "propertiesBytes": 65536, "scores": 100, "pageSize": 1000 }
}
```

Without a token, or with a token that is not valid, it answers 401 `unauthenticated` with `details: { "protocol": 1, "tokenUrl": "…" }` (`tokenUrl` only when the server has one), so `login` can check the protocol and say where to create a token before it asks for one. It never answers 200 without a valid token. `capabilities` lists optional features by name; version 1 defines none. A client reads `limits` before a push and refuses a change over them before it sends anything.

### `GET /v1/documents`

Lists current documents, without bodies, ordered by path.

| Query | Meaning |
| --- | --- |
| `prefix` | Only paths that start with this text |
| `archived=include` | Also list archived documents |
| `limit`, `cursor` | [Pagination](#conventions). `limit` defaults to and is capped at `limits.pageSize` |

Response: `{ "documents": [<list item>…], "next": <cursor or null> }`.

### `GET /v1/document?path=<path>[&version=<n>]`

One version, with its body: the current one, or version `n`. 404 when the path or the version does not exist. Paths match exactly, including letter case.

### `GET /v1/versions?path=<path>`

`{ "versions": [<version summary>…] }`, newest first. 404 when the path has never existed.

### `POST /v1/blobs/uploads`

Prepares uploads for `file` documents. Request: `{ "blobs": [{ "sha256", "size", "contentType" }…] }`. Response: `{ "uploads": [{ "sha256", "url", "method": "PUT", "headers": { … } }…] }`, one per blob the server does not already hold. The client sends each blob's bytes to its `url` with the given method and only the given headers, which may point at the server itself or at object storage; when the `url` has the base URL's origin, the client also sends its token. A server checks each blob's hash and size before a change can use it.

### `GET /v1/blobs/<sha256>`

The blob's bytes, or a `302` redirect to them. 404 when the server does not hold it.

### `POST /v1/changes`

Saves, archives and restores documents in one atomic change: every item takes effect, or none does.

```json
{
  "message": "plan 2.004 approved",
  "origin": { "repo": "github.com/seasb/meta-harness", "branch": "main", "commit": "a1b2…" },
  "changes": [
    { "op": "save", "path": "plans/2.004-pull.md", "baseVersion": 2,
      "properties": { "status": "ready" }, "body": "# Plan 2.004 …" },
    { "op": "save", "path": "research/flow.png", "baseVersion": 0,
      "blob": { "sha256": "…", "size": 20481, "contentType": "image/png" } },
    { "op": "archive", "path": "plans/old.md", "baseVersion": 5 },
    { "op": "restore", "path": "plans/back.md", "baseVersion": 4 }
  ]
}
```

Rules:

1. `baseVersion` is the version the client last read: 0 for a new path. For `restore`, it is the archived version.
2. A path appears at most once in a request.
3. A `save` of a text document has `properties` and `body` and no `blob`. A `save` of a `file` document has `blob` and no `properties` or `body`. The format follows from the path's extension.
4. The server checks every item before it applies any. It answers 409 `conflict` when any base version is not the current version, with `details.conflicts`: `[{ "path", "baseVersion", "currentVersion", "currentState" }]`. It answers 409 `archived` for a `save` to an archived path. It answers 422 `invalid` for an item that breaks a [path rule](store.md#paths), a [property rule](store.md#properties) or a limit, for a `save` whose path differs only in letter case from another document's path, and for an unknown blob. `archive` of an archived document and `restore` of an active one are 422.
5. A `save` whose properties, body and blob equal the current version's creates no version.
6. Every version created in one request has the same `message`, `origin`, `savedAt` and `savedBy`.

Response 200: `{ "results": [{ "path", "op", "outcome", "document" }…] }`, in request order. `outcome` is `saved`, `unchanged`, `archived` or `restored`, and `document` is the document's [list item](#document-version) after the change, so a client can update its index without another request.

Properties are equal when they are equal as JSON values, ignoring the order of keys. A server stores the order of keys as sent.

### `POST /v1/scores`

Records scores in one atomic request. Request: `{ "scores": [<score without recordedAt or recordedBy>…] }`.

1. A document subject without `version` is pinned to the current version. A document subject whose path is not in the store, or whose version is past the newest, is 422. An archived document's versions are accepted.
2. A `pr`, `branch`, `commit` or `file` subject without `revision` is 422. The server does not resolve revisions.
3. A subject that is not in its canonical form ([Subjects](store.md#subjects)) is 422.
4. A score whose `id` the server already holds is not recorded again, and is not checked again: the response returns the stored score, even when the retried payload differs. An `id` repeated within one request is recorded once. Rules 1 to 3 apply only to new scores.

Response 200: `{ "scores": [<score>…] }`, in request order.

### `GET /v1/scores`

Lists scores, newest first.

| Query | Meaning |
| --- | --- |
| `subject` | One canonical subject |
| `prefix` | Document subjects whose path starts with this text |
| `name` | One score name |
| `kind` | `doc`, `pr`, `branch`, `commit`, `file` or `url` |
| `since` | Scores recorded at or after this time |
| `limit`, `cursor` | [Pagination](#conventions) |

Response: `{ "scores": [<score>…], "next": <cursor or null> }`.

### `GET /v1/scores/names`

`{ "names": [{ "name", "count", "latestAt" }…] }`, ordered by name.

## Versioning

The protocol version is the number in the route prefix. A server may add response fields, optional request fields, routes and capabilities within a version. Anything else is a new version, such as `/v2/`. The CLI reads `protocol` from `/v1/info` and refuses a server that reports a version it does not know.

## Conformance

`test/core/store/contract/` in this repository is a test suite written against the backend interface. It runs against the local backend, and against a remote backend that talks to the in-process test server in `test/helpers/store-server/`. Each test works under its own path prefix and score names, so the suite can share a store with earlier runs. A server implementation proves conformance by running the suite against the base URL of a test store that the token can write, with `METAFAB_CONTRACT_URL` and `METAFAB_CONTRACT_TOKEN` set: `npm run test:contract` in a checkout of this repository, which Plan 2.003 adds. The suite writes documents and scores, so never point it at a store in use. Without those variables, `npm run test:contract` runs only against the built-in backends, and `npm test` includes that run.
