---
title: "fix: <the PR title>"
status: ready          # a bug plan is usually ready as soon as it is filed
kind: bug
reported-by: <who, and where: "Sebastian, PR #12, 23 Oct">
pr:
needs: []
owns:
  - path/to/file.ts
proves: "<the test that failed before and passes now>"
---

# <What is wrong, in the words of the person who hit it>

## What happens

The command, its input, what it did, and what the spec says it should do. Link the spec section, issue or PR.

## Why

The cause, if known, with `file:line`. If not known yet, say what to check first.

## The fix

What changes, and what must not change with it. If the fix needs more than one PR, it is not a bug plan: run `plan-feature`.
