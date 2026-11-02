---
title: "fix: adoption accepts links into .factory/ and init reports the real read error"
date: 2026-11-02
pr: 14
plan: docs/plans/1.014-adoption-polish.md
---

# Adoption accepts any skill that build accepts, and init names the real read error

`metafab init --adopt` now moves a skill whose symlink points into `.factory/` (for example `notes.md -> ../../../.factory/shared/notes.md`), and the following `metafab build` installs it. A link, including one inside a dot directory such as `.hidden/`, that would point outside `.factory/` or would contain the skill after the move is refused with exit 5 and a message that says "after the move".

When `init` cannot read `.factory/metafab.yaml`, it now names the cause: only a permissions error says "Check its permissions"; any other read error says "Restore the file, then run metafab init again". An unreadable `.factory/factory.yaml` now stops `init` before it writes anything. Other failures in the closing build can still leave the new factory files behind, as before.

## Still to come

1.016 Git hooks builds on this. Follow-ups are in `docs/intake/2026-11-02-adoption-link-edges.md`.
