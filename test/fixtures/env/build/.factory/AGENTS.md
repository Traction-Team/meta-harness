# Demo factory

Build and review work in slices.

<!-- factory:when env.harness == amp -->
Run metafab build with `--env harness=amp` before opening a thread.
<!-- factory:endwhen -->

<!-- factory:switch env.workspace -->
<!-- factory:case orca -->
Orca starts each worktree with a setup script.
<!-- factory:case orb -->
An orb starts from a clean checkout.
<!-- factory:endswitch -->
