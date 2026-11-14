---
title: "fix: harden fab sources and accept git+file:// sources"
date: 2026-11-14
pr: 20
plan: docs/plans/1.021-source-hardening.md
---

# A fab in a local Git repository can be imported and updated, and the fetch cache is safe to share

`metafab import git+file:///srv/fabs/fab-acme.git` reads a fab from a Git repository on this machine or a mounted share, such as the bare repository `publish.git: file:///…` writes, with tags, ranges, `update` and `diff` exactly like `git+https://`. `publish.git` also accepts the `git+` import form, and a generated README names a source `import` accepts. Any other URL scheme (`http://`, `git://`, `ftp://`…) is refused with a message that lists the supported forms, and a local path that is a bare repository names its `git+file://` form. Commands running at the same time no longer delete each other's cache entries, an interrupted fetch leaves nothing partial, a cache Metafab cannot write stops with exit 3 naming the path, and an npm fab whose registry metadata reports more than the fab limits is refused before it is downloaded. Existing short cache keys are unchanged, so existing caches stay valid.

## Still to come

Follow-ups filed to intake: the publish summary label for a Windows drive `publish.git`, the `upstream.source` validation message for an unsupported scheme, and a few small `publish.git` and `git+file://` edge cases.
