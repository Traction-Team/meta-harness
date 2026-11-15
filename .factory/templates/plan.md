---
title: "feat: <what this pull request makes true>"   # the pull request title: Conventional Commits, no scope, lowercase after the code
code:                  # optional: <CODE>-<n> in a feature, when `features` is set; delete it outside a feature
status: draft          # draft | ready | building | merged | live | dropped | superseded
kind: feature          # feature | bug | chore
pr:                    # the pull request number, set when its draft opens
needs: []              # plans that must merge first, as repo paths. An unmerged need stacks this plan on its branch when `stacking` is on
owns:                  # the paths this pull request may change. Two plans whose owns overlap are never built side by side
  - path/to/area/**
  - path/to/file.ts
proves: "<command> -> <what a passing result proves>; by hand: <manual check>"
builds-on: []          # earlier plans this one extends, as repo paths
retires: []            # plans this one replaces, as repo paths
reported-by:           # optional: who asked, and where
---

# Plan <number or code>: <the plan's title>

<!--
One plan is one pull request. The what and why live in the specs and the feature doc; this plan says how to build its pull request.
Write one plan for each pull request and connect them with `needs`. Use the real names of files, functions, commands and settings.
Delete a section this plan does not need, and delete every comment before the plan goes to review.
-->

<One paragraph: what this pull request builds, for whom, and why now. A reader who stops here knows what is true after it merges.>

## Specs

<!-- Delete this section when the `specs` setting is empty. -->

- [<Spec>: <section>](../specs/<file>.md#<section>)

## Decisions

| Topic | Choice | Reason |
| --- | --- | --- |
| <the question that was open> | <what was chosen> | <why> |

## Design

How it works, in the real module, function and type names. Explain what a builder or reviewer must understand:

- What happens on failure: what the person sees, which exit code, and whether the repository is left unchanged.
- What happens on a second run, and on a run after a partial or interrupted one.
- Windows: paths, line endings and case.

## Steps

- [ ] <one reviewable step>
- [ ] <the next>

## Tests

- <what each test proves, and the command that runs it>

## Done when

- <an outcome someone who did not build it can observe>

## Out of scope

- <work a reader might expect here, and the plan or intake note that picks it up>

## Open questions

<!-- Only in a draft plan: the calls still open, and who settles each. Delete it from a ready plan. -->

1. <question>. Proposal: <answer>.
