---
title: "feat: resolve, fetch and validate fab sources"
status: ready
kind: feature
pr:
needs:
  - docs/plans/02-factory-model.md
  - docs/plans/03-configuration.md
owns:
  - src/core/sources/**
  - test/core/sources/**
  - test/fixtures/fabs/**
  - test/helpers/registry/**
proves: "npx vitest run test/core/sources → every source form resolves against local Git and Verdaccio fixtures; the extractor rejects traversal, links and oversize files"
---

# Plan 08: Fab sources, fetching, and fab validation

Parse every source form, resolve it to an exact version or revision, download it safely into the cache, and validate the fab. `import`, `update`, and `diff` build on this module.

## Specs

- [Sharing: Supported sources](../specs/sharing.md#supported-sources)
- [Sharing: Git refs](../specs/sharing.md#git-refs)
- [Sharing: Versioned and unversioned sources](../specs/sharing.md#versioned-and-unversioned-sources)
- [Sharing: Fab layout](../specs/sharing.md#fab-layout)
- [Sharing: Importing a fab](../specs/sharing.md#importing-a-fab) (fab validation list)
- [Sharing: Upstream entry](../specs/sharing.md#upstream-entry)

## Design

### Source parser

```ts
type SourceSpec =
  | { kind: "npm"; name: string; requested?: string }                      // absent: see open question 1
  | { kind: "git"; url: string; source: string; ref?: GitRef }
  | { kind: "https"; url: string }
  | { kind: "path"; path: string };                                         // resolved absolute path

type GitRef = { type: "range"; range: string } | { type: "name"; name: string }; // tag, branch or commit
```

Classification order: `file:` or a path that starts with `.`, `/`, `~`, or a drive letter → path; `github:` → git; `git+ssh://` / `git+https://` → git; `https://…` → https tarball; otherwise npm (`name[@range]`). `#semver:<range>` is a range; any other `#x` is a name resolved later.

`github:owner/repo` fetches from `https://github.com/owner/repo.git`. The recorded `source` keeps the original form without its ref.

### Resolver and fetcher

```ts
resolve(spec, opts: { to?: string }): Promise<Resolved>
fetchFab(resolved): Promise<FetchedFab>

interface FetchedFab {
  factoryDir: string;            // a .factory directory in the cache (read-only by convention)
  upstream: UpstreamEntry;       // ready to write to metafab.yaml
  deprecated?: string;           // npm deprecation message
  versioned: boolean;
}
```

**npm**

- Resolve with `npm view <name> versions dist-tags --json`, then `semver.maxSatisfying`. Get `dist.tarball`, `dist.integrity`, and `deprecated` with `npm view <name>@<version> --json`.
- Download with `npm pack <name>@<version> --pack-destination <tmp> --json --ignore-scripts`. npm then uses the user's `.npmrc`, registry, and credentials. A registry tarball runs no scripts.
- Verify the tarball against `dist.integrity` (sha512, with `ssri`).
- Unpack it ourselves (below) and strip the `package/` prefix.
- Read `metafab.format` from `package.json`. Missing or not `1` → exit 4.

**Git**

- Keep a bare mirror per URL in the cache: `git clone --mirror`, later `git fetch --prune --tags`. Run Git with `-c core.hooksPath=/dev/null` and `GIT_TERMINAL_PROMPT=0` when not interactive.
- List refs with `git ls-remote --tags --heads`. Select according to the [Git refs table](../specs/sharing.md#git-refs). Tags `v1.2.0` and `1.2.0` are versions.
- Export the commit with `git archive <sha> .factory` into a temporary directory. No checkout, no submodules, no LFS.
- Upstream fields: `commit` always; `version` when a version tag points at the commit; `requested` as in the spec table.

**HTTPS tarball**: download with `fetch`, unpack, read `.factory/` at the archive root (also accept a single top-level directory, as GitHub archives use). Unversioned.

**Local path**: if the path is a `.factory` directory, use it; else use `<path>/.factory`. Copy into a temporary directory so later steps cannot modify the source. Unversioned.

### Safe extraction and fab validation

One extractor (`tar` package) with a filter that rejects, as exit 4:

- Absolute paths and paths that contain `..`
- Symbolic links and hard links whose target leaves `.factory/`
- Device files and FIFOs
- Any file larger than 1 MB

After extraction, `validateFab(dir)`:

1. Format: `package.json` `metafab.format` for npm, else `factory.yaml` `format`, else format 1. Unknown → exit 4.
2. Drop `.factory/metafab.yaml` and `.factory/README.md` from the payload (they never enter the receiving repository).
3. Run `loadFactory` validation. Invalid → exit 4 with the problems, paths prefixed with the source.

### Cache

`~/.metafab/cache/` (override with `METAFAB_CACHE` for tests):

```text
npm/<name>/<version>.tgz
git/<sha256(url)>/            bare mirror
fabs/<key>/.factory/          extracted, validated payloads keyed by npm version or Git commit
```

HTTPS and path sources are never cached. A corrupt cache entry is deleted and fetched again.

### Errors

Network, authentication, missing package or ref → exit 3 with the underlying `npm`/`git` message. Invalid content → exit 4.

## Steps

- [ ] Source parser with a table-driven test of every spec example
- [ ] Safe extractor and `validateFab`
- [ ] npm resolver and fetcher
- [ ] Git resolver and fetcher (all five ref forms)
- [ ] HTTPS and local-path fetchers
- [ ] Cache layout and reuse
- [ ] Replace the temporary upstream classifier from [Plan 03](03-configuration.md)

## Tests

- Parser: every row of the supported-sources table, plus Windows paths
- Extractor rejects `../evil`, `/etc/passwd`, a symlink to `/`, and a 2 MB file
- Git: a local bare repository with tags `v1.0.0`, `v1.1.0`, `v2.0.0` and a branch covers no-ref, range, tag, branch, and commit
- npm: a local Verdaccio registry started by the test suite covers range resolution, integrity, scoped names, and deprecation
- A package with an `install` script does not run it

## Open questions

1. What does `requested` record for an npm source given without a range (`@seasb/fab-mark4`)? Proposal: `^<resolved version>`, matching the Git no-ref behaviour.
2. What does `requested` record for a Git source with no ref and no version tags? Proposal: omit it; `update` then follows the default branch.
3. `npm pack` versus fetching `dist.tarball` directly with registry auth from `.npmrc`. `npm pack` is simpler and honours every npm setting; confirm in a spike that it never runs scripts for registry specs on npm 9, 10, and 11.
