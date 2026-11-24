Where this checkout and its branch came from, and what to do about setup before the first check:

<!-- factory:switch env.workspace -->
<!-- factory:case orca -->
`start-plan` created this worktree with Orca's `--setup run`, so the repository's setup hook ran in it. If the first command fails on missing dependencies, read the hook with `orca repo list --json` (`hookSettings.scripts.setup`) and run it. Run the `setup` command by hand only when the hook is empty or failed, and say which in the final report and the TL;DR.

Orca names a new worktree's branch `<git user>/<flattened name>`, for example `<user>/feat-1.005-check`. If the branch has that shape, has no commit beyond its base, and has no pull request, rename it now, before the claim, and treat it as case 3:

```bash
git branch -m <type>/<plan-file-stem>   # the type comes from the plan's title; the stem is the file name without .md
git branch --show-current               # must print the new name
```

<!-- factory:case orb -->
An orb starts on the trunk. Your brief tells you to create the plan's branch first (`git fetch origin && git switch -c <type>/<plan-file-stem> <base>`), or to switch to one that already exists; do what it says, then take the case below that matches, usually case 3. The repository's setup already ran in the orb, so dependencies and the skills are ready.

<!-- factory:case worktree -->
`start-plan` created this worktree on the plan's branch, so there is no branch to rename. Run the setup setting from `docs/factory.md` once before your first check, and say in the final report and the TL;DR that no setup hook ran. When it is empty, use the repository's install command from its README.
<!-- factory:endswitch -->
