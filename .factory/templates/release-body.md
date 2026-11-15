Everything merged to `<trunk>` since the last release (#<previous release pr>): <n> commits.

<!--
Written for the person who approves the release and has not read every pull request in it. The release workflow's "Writing the release body" section says how. Start straight with this line and the headings below: no title line and no merge instructions. Delete every comment and any section whose setting is empty before you open the pull request.
-->

## Team update

<!-- Only when `release-announce` names a place. One plain line per change the approver said to tell the team about, for people who are not engineers: what someone can now do or will notice, in words they would use. No plan codes, pull request numbers, table names or tool names. The approver reads exactly what the team will read. Say "Fixes and upkeep, nothing new to see." when they chose none or the release has nothing for users. -->

- <what someone can now do or will notice>

## What changes for users

<!-- One bold line per change a user, customer or operator notices, newest first, then a sentence or two in plain words. Name the plan code when there is one and the pull request number. Chores, dependency bumps and docs stay out of this section. When nothing changes for users, say "Nothing: fixes, chores and docs only." -->

- **<what users notice> (<CODE-n>, #<pr>).** <What it does now, what it did before, and anything that needs a person, such as an approval.>

## Before you merge

<!-- A checklist from the `switch:` line and the **Release:** line of every plan that ships, plus anything a pull request body says must happen before release: access to grant, a person to tell, a switch to have ready. Name the person. Say "Nothing" when the list is empty. -->

- [ ] <who confirms or does what> (<CODE-n>).

## Risky paths

<!-- From the `release-risky-paths` setting: the path prefixes in this release's diff, and what each one does in plain words. Say "Nothing flagged." when the diff touches none of them, or when the setting is `none`. -->

- `<path prefix>/`: <what it changes, and what to watch>.

## Deploys

<!-- From the `release-guide` document: what this release starts, which of it runs for these paths, and what to watch. Name no workflow the guide does not name. -->

- Expected: <what the guide says this release deploys, and what to watch>.
- <New environment variables or access, or "Nothing new.">

## Ships

<!-- Every line of `git log --first-parent --oneline origin/<release-branch>..origin/<trunk>`, grouped, newest first in each group. Plain list items, never a code block, so the host links each commit and pull request. Drop a group that has no lines. -->

Features and fixes
- <sha> feat: <title> (#<pr>)

Chores
- <sha> chore: <title> (#<pr>)

Docs and factory
- <sha> docs: <title> (#<pr>)
