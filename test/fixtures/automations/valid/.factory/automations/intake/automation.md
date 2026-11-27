---
description: Triage the intake backlog
owner: "*"
triggers:
  - schedule: { cron: "0 8 * * 1,4", tz: Australia/Sydney }
---

# intake

Triage the intake backlog with the `file-work` workflow's rules.
