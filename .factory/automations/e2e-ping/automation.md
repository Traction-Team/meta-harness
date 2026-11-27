---
description: End-to-end test that reports what a fired run saw; safe, changes nothing
owner: "*"
triggers:
  - schedule: { cron: "0 9 * * 1", tz: Australia/Sydney }
---

# e2e-ping

This is a harmless test run. Change no files, commit nothing, push nothing.

1. Run `git rev-parse HEAD`, `git status --short --branch`, `pwd`, `hostname` and `echo "AMP_USER_EMAIL=${AMP_USER_EMAIL:-unset} AMP_THREAD_ID=${AMP_THREAD_ID:-unset}"`.
2. Use send_thread_message to send thread `T-01a21b9d-eecb-764d-9fd8-17dbe1a2105f` (the parent of the thread that set this test up) one message that starts with `E2E-PING REPORT` and holds: the output of step 1, and the full prompt you received from `metafab automations prompt`, quoted exactly.
3. End the run.
