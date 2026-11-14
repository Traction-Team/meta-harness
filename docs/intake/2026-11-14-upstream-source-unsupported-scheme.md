---
title: An unsupported URL scheme in upstream.source gets the npm "requires version" message
kind: follow-up
status: new
filed: 2026-11-14
reported-by: build of PR #20 (Plan 1.021), 14 Nov
source: "#20"
links: [docs/plans/1.021-source-hardening.md, docs/specs/configuration.md]
---

# `upstream.source: ftp://…` is validated as an npm source

## What happened, or what is wanted

`metafab import ftp://…` now says the scheme is unsupported and lists the supported forms. The same value written into `upstream.source` in `metafab.yaml` is still classified as an npm source by `check`, which then asks for a version instead of naming the unsupported scheme.

## What we know

`classifySource` in `src/core/config/source.ts` falls back to npm when `parseSource` throws. It could pass the `invalid-source` message through for a value with a URL scheme. Outside Plan 1.021's `owns`.
