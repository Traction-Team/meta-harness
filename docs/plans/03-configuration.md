---
title: "feat: read, validate and write metafab.yaml"
status: building
kind: feature
pr: 2
needs:
  - docs/plans/01-foundation.md
owns:
  - src/core/config.ts
  - src/core/config/**
  - test/core/config/**
  - test/fixtures/config/**
  - package.json
  - package-lock.json
proves: "npx vitest run test/core/config → the spec example is valid, each invalid fixture fails, and setUpstream/removeUpstream round-trip comments"
---

# Plan 03: Configuration (`metafab.yaml`)

Read, validate, and safely write `.factory/metafab.yaml`.

## Specs

- [Configuration](../specs/configuration.md)
- [Sharing: Upstream entry](../specs/sharing.md#upstream-entry)
- [Building: Target selection](../specs/building.md#target-selection)

## Design

### Model

```ts
type Target = "claude" | "codex" | "cursor" | "opencode" | "copilot";
const TARGETS: Target[] = ["claude", "codex", "cursor", "opencode", "copilot"];

interface Config {
  agents: Target[];                 // resolved: absent or "all" -> TARGETS
  agentsRaw: "all" | Target[] | undefined;
  metafabSkill: boolean;            // default true
  publish?: PublishConfig;
  upstream?: UpstreamEntry;
  doc: YAML.Document;               // for comment-preserving writes
  problems: Problem[];
}

type UpstreamEntry =
  | { kind: "npm"; source: string; requested: string; version: string }
  | { kind: "git"; source: string; requested?: string; version?: string; commit: string }
  | { kind: "unversioned"; source: string };
```

The upstream kind is derived from `source` with the source parser from [Plan 08](08-sources.md). Until Plan 08 lands, use a minimal classifier (`github:`, `git+`, `https:`, path-like, otherwise npm) and replace it later.

### Destinations

```ts
function destinations(targets: Target[]): Destination[]
// claude -> ".claude/skills"; any other target -> ".agents/skills"; deduplicated
```

This is the single source of truth for the target-to-directory mapping. Build, check, init, and adoption all use it.

### Validation

Implement the eleven rules in [Configuration: Validation](../specs/configuration.md#validation). Notes:

- Rule 2 uses `util/suggest.ts` for the closest known key, including inside `publish` and `upstream`.
- Rule 6 uses `validate-npm-package-name` (new names rules).
- Rule 7 accepts `git@host:path`, `ssh://`, `git+ssh://`, `https://`, `git+https://`, and `file://` (the last one for tests and local fab repositories).
- Rule 9 uses `semver.valid`.
- Rule 10 resolves `publish.readme` from the repository root.
- Rule 11 depends on the upstream kind.

A missing file is an empty config. An invalid file still produces a `Config` with defaults, plus problems, so `check` can continue.

### Writing

Commands write only these keys:

| Writer | Used by |
| --- | --- |
| `createConfig({ agents })` | `init`, `import` into a repository without a factory |
| `setUpstream(entry)` | `import`, `update` |
| `removeUpstream()` | `detach` |

Writes edit the parsed `YAML.Document` and preserve comments, key order, and the other keys. `setUpstream` adds the comment `# Written by metafab import. Do not edit.` above a new `upstream` key, as in the spec example. Output always ends with one LF.

## Steps

- [x] `core/config.ts`: load, defaults, `destinations()`
- [x] Validation rules 1 to 11
- [x] The three writers, with round-trip tests that preserve comments
- [x] Fixtures: the full spec example, plus one invalid file per rule

## Tests

- The spec example parses and is valid
- `agents: all`, absent `agents`, and `agents: []` resolve as the spec says
- `agents: [claude, codex]` gives two destinations; `[codex, cursor]` gives one
- `setUpstream` then `removeUpstream` returns the file to its original text, comments included
- `publush:` reports "Did you mean publish?"

## Open questions

1. Should a duplicate target (`agents: [codex, codex]`) be an error or a warning? Proposal: warning.
