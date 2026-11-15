---
name: hello
description: Say hello. Use when testing the build.
---

# Hello

<!-- factory:switch env.harness -->
<!-- factory:case opencode -->
Run `opencode` in the repository root.
<!-- factory:case claude -->
Run `claude` in the repository root.
<!-- factory:case amp -->
Start an Amp thread and run the skill there.
<!-- factory:endswitch -->

<!-- factory:when env.workspace == orca and env.harness == amp -->
On Orca, the thread runs in its own worktree.
<!-- factory:endwhen -->
