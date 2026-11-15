---
title: "fix: <what becomes true>"   # "fix: <CODE-n> <what becomes true>" when the bug belongs to a feature
code:                  # optional: <CODE>-<n>, the feature's next free number, when the bug belongs to a feature in flight
status: ready          # a bug plan is usually ready as soon as it is filed
kind: bug
reported-by: Kat, <where: a conversation, an issue, a pull request, 14 Oct>
pr:
needs: []
owns:                  # the paths the fix will probably change; the builder can widen it
  - path/to/file.ts
proves: "<the command that failed before and passes now>; by hand: <what to check>"
switch: none           # or the flag or setting that keeps the fix off, and who turns it on
---

# <What is wrong, in the words of the person who hit it>

## What happens

The command or screen, its input, what it did, and what was expected instead. Link the ticket, issue or pull request, and the spec section when one says so.

## Why

The cause, if it is known, with `file:line`. If it is not known yet, say what to check first.

## The fix

What changes, and what must not change with it. If the fix needs more than one pull request, it is not a bug plan: run `plan-feature`.

## Tests

- <the test that fails before the fix and passes after it>

## Done when

- <an outcome someone who did not build it can observe>
