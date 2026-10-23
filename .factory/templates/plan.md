---
title: "feat: <what this PR makes true>"   # the PR title: Conventional Commits, no scope, lowercase
status: draft          # draft | ready | building | merged | dropped | superseded
kind: feature          # feature | bug | chore
pr:                    # set when the draft PR opens
needs: []              # plans that must merge first, as repo paths. A need still building means this plan is built stacked on its branch
owns:                  # the paths this PR may change. Two plans whose owns overlap are never built side by side
  - src/core/<area>/**
  - test/core/<area>/**
proves: "<the command whose real output goes in the PR> → <what passing shows>"
builds-on: []          # earlier plans this one extends, as repo paths
retires: []            # plans this one replaces, as repo paths
---

# Plan NN: <title>

<!-- One plan is one pull request. The what and why live in docs/specs/; this plan says how to build it. -->

<One paragraph: what this PR builds and why now. A reader who stops here knows what `metafab` can do after it merges.>

## Specs

- [<Spec>: <section>](../specs/<file>.md#<section>)

## Decisions

| Topic | Choice | Reason |
| --- | --- | --- |

## Design

Modules, types and functions, with their real names. What happens on failure, on a second run, and on Windows.

## Steps

- [ ] <one reviewable step>

## Tests

- <what each test proves>

## Done when

- <observable outcome>

## Open questions

1. <question> Proposal: <answer>.
