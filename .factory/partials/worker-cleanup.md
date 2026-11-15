Find the workers from earlier waves whose pull requests have left the open set, and clean up each merged one. Origin is the record:

<!-- factory:switch env.workspace -->
<!-- factory:case orca -->
```bash
orca worktree list
gh pr list --head <branch> --state all --json number,state --jq '.[0] // empty | "\(.state) #\(.number)"'
```

For each merged pull request, remove its worktree:

```bash
orca worktree rm --worktree name:<type>/<plan-file-stem>
```

`--force` is for a tree the worker left dirty. Say so when you use it.

<!-- factory:case orb -->
```bash
gh pr list --head <branch> --state all --json number,state --jq '.[0] // empty | "\(.state) #\(.number)"'
```

There is no checkout to remove: the worker's orb belongs to its thread, so offer to archive the worker thread. Its branch stays on origin.

<!-- factory:case worktree -->
```bash
git worktree list
gh pr list --head <branch> --state all --json number,state --jq '.[0] // empty | "\(.state) #\(.number)"'
```

For each merged pull request, remove its worktree:

```bash
git worktree remove <path>
```

`--force` is for a tree the worker left dirty. Say so when you use it. Its branch stays on origin.
<!-- factory:endswitch -->
