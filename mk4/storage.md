# Storage

This document says where fab keeps what it learns about the work: scores, history links, finished runs, and who is working on what now. The factory (`.fab/`) and the work itself (files, branches, PRs, tickets) stay where they are, in the repository and its hosts. This document is only about the records that fab adds. See [`overview.md`](overview.md) for the parts of a fab and [`cli.md`](cli.md) for the commands.

## What it must do

- **Work for a team, not one machine.** Scores and links that one person's agents make must reach every teammate. Coordinating many people is the point of a fab.
- **Need nothing new to start.** A team uses fab free, with the Git host it already has as the store.
- **Get better with Fab Cloud.** A team that wants live sync, teammates' agents and claims swaps the store for the Fab Cloud service. Nothing else changes.
- **Never block an agent.** An agent that runs `fab score` may have no network and no Git credentials, for example in a Codex sandbox. Its record must still be kept.
- **Not change the team's Git.** `git pull` and `git push` work as before. No branch, PR or diff gets fab files.
- **Look up by any reference.** A score can be on a file, a slice, a branch, a PR or a ticket. A lookup by any of them must be fast.

## What is stored

| Kind | Example | Lasts | Shared by |
| --- | --- | --- | --- |
| **Score record** | *tech debt* 7.1 on `#412` in *Built branches* | Always | Ledger or Fab Cloud |
| **Link record** | Seb's session linked `docs/plans/context-packs.md § S2`, then `#412` | Always | Ledger or Fab Cloud |
| **Run record, shared part** | Seb's *build-slice* session in Claude Code: two hours, about $2.14 | Always | Ledger or Fab Cloud |
| **Run record, local part** | The worktree path, session ID and inputs | Always | Not shared. It stays in `~/.fab/runs/` |
| **Presence** | Seb's Codex session works on `#412` now | Expires | Fab Cloud only |
| **Claim** | Anna's agent has `#412` for *review-slice* | A lease | Fab Cloud only |

Score, link and run records are **records**. Presence and claims are **live state**. Records are facts that can arrive a minute late. Live state is useless when it is a minute late, so only Fab Cloud has it.

## Records

Every record is a small JSON object:

```json
{
  "id": "s_20261017_8c21f0a93e1b",
  "kind": "score",
  "by": "sebkade",
  "at": "2026-10-17T07:40:11Z",
  "scorer": "tech-debt",
  "ref": "feat/context-packs-s2 · #412",
  "stage": "review",
  "anchor": "pr-head:9f3c2e1",
  "score": 7.1,
  "why": "One helper is copied from the export module instead of shared.",
  "run": "r_20261016_c41e0b7d2f91",
  "fabCommit": "4e1d9a2"
}
```

The fields of each kind are in [`cli.md`](cli.md#records). The rules are the same for every kind:

- **A record never changes.** A correction is a new record. A newer score for the same scorer, artifact and stage replaces the older one in `fab work`. A newer shared run record for the same run replaces the older one.
- **IDs are unique without coordination.** An ID is a letter for its kind (`s`, `l`, `r`), the date, and 12 random hex digits (48 bits). Two machines never make the same one.
- **So two copies of the records merge as a union.** No store can have a conflict, whether it is Git or Fab Cloud. "The latest score" is worked out when the records are read, not when they are written.
- **`by`** is the person: their GitHub login when `gh` is signed in, or else a short hash of `user.email`.
- **`anchor`** says which version of the artifact the record is about:

| Artifact | Anchor |
| --- | --- |
| File | `blob:<sha>`, the hash of the file's contents (`git hash-object`). It works for a file that is not committed |
| Slice or line | `text:<sha>`, the hash of the slice's text |
| Branch | `head:<sha>`, its head commit |
| PR | `pr-head:<sha>`, its head commit |
| Linear issue | `updated:<time>`, its last change |

When an artifact's anchor today is not the one in its score, the score is **out of date**. The monitor still shows it, dimmed, with "scored on an earlier version". Without an anchor, a plan that was edited after its score would show the old score as current.

## The store

Every fab client has two local parts and one backend.

```
fab score / fab link / a session goes idle
        │  writes, then returns at once
        ▼
  ~/.fab/spool/<fab>/          records not yet sent
        │  fab sync
        ▼
  backend: git ledger  or  Fab Cloud
        │  fab sync, or a live stream from Fab Cloud
        ▼
  ~/.fab/index/<fab>.sqlite    every record this machine knows
        ▲
  fab work / fab history / fab scores / the monitor   (read only this)
```

- **The spool.** Commands that make a record write it to the spool and add it to the index. They return at once. They do not use the network or write to Git. So an agent in a sandbox can score.
- **The index** holds every record that this machine knows, its own and its teammates'. It is the only thing that `fab work`, `fab history`, `fab scores` and the monitor read. No view reads Git or Fab Cloud directly. The index has a key for each part of a reference, so a record on `feat/context-packs-s2 · #412` is found by `feat/context-packs-s2` and by `#412`. It also has keys for stage, scorer and run. `fab sync --rebuild` makes it again from the backend.
- **The backend** moves records between machines. The team chooses it in `fab.yaml`, because everyone on the team must use the same one:

```yaml
store: git                # the default: the git ledger on the remote

# or
store:
  kind: cloud
  project: fp_7k2m9x
  mirror: git             # optional: Fab Cloud also writes the git ledger
```

The commands, the monitor and the records are the same with both backends. Only speed and live state are different.

## The git ledger

The free backend. Records are kept in Git refs on the team's own remote, outside every branch.

### Refs

- **One ref for each writer:** `refs/fab/ledger/<person>/<clone>`.
- **`<person>`** is the same as `by`.
- **`<clone>`** is made once for each clone, for example `mbp-3f2a`, and kept in the clone's Git folder (`.git/fab/clone-id`). All worktrees of a clone share a Git folder, so they share one ledger ref. Two clones on one machine, or one person's laptop and desktop, have different refs.
- **Only one writer for each ref.** So a push to it is always a fast-forward. There are no merges and no retries, and teammates cannot race each other, or race themselves on two machines.
- **Inside a ref** there are commits whose tree holds one file for each record, in day folders: `2026/10/17/s_20261017_8c21f0a93e1b.json`. A commit changes only one day's folder, so each tree stays small.
- **fab writes with Git plumbing**: `hash-object`, a temporary index, `commit-tree` and `update-ref`. The working tree, the staging area, `HEAD` and the branches do not change. One sync makes one commit, not one for each record.
- **Ledger commits are not signed** by default. Signing rules apply to branches, not these refs, and a key prompt each minute would stop the sync. `store: { kind: git, sign: true }` signs them.

The git notes of earlier designs (`refs/notes/fab`) are not used. A note must hang on a commit, but a file that is not committed, a PR on an existing branch, and a Linear issue have no commit of their own. And all teammates would push to one notes ref, so their pushes would race.

### Sync

`fab sync` does this:

1. It takes a lock, `.git/fab/sync.lock`, so only one sync runs in a clone, even with many worktrees and agents.
2. It commits the spooled records to this writer's ref.
3. It pushes that one ref: `git push <remote> refs/fab/ledger/<person>/<clone>`.
4. It fetches every writer's ref: `git fetch <remote> '+refs/fab/ledger/*:refs/fab-remote/<remote>/ledger/*'`.
5. For each ref that moved, it compares the old and new tips, reads only the new files in one `git cat-file --batch`, and adds them to the index.
6. It removes the records that were pushed from the spool.

The monitor runs `fab sync` about once a minute while it is open. Each command that makes a record also starts one in the background. A person can run it at any time. Offline, records wait in the spool and the next sync sends them. The remote is `origin` unless `store.remote` names another.

The fetch writes to `refs/fab-remote/`, not to `refs/fab/`. A forced fetch into `refs/fab/` would replace this writer's own ref with the older copy on the remote, and the records not yet pushed would be lost.

### What a developer sees

- **`git pull`, `git fetch` and `git clone` do not get the ledger.** Their default refspec gets only branches and tags. fab fetches the ledger itself.
- **`git push` does not change.** fab adds no push refspec. If `remote.<name>.push` is set, a plain `git push` pushes only those refspecs, and not the current branch. That would break every teammate's push.
- **`fab install` changes no Git config.**
- **`git log --all`** and some Git apps (Fork, GitKraken) show the ledger commits, because they show every ref. One commit for each sync keeps this small.
- **`fab store`** shows the backend, this writer's ref, the time of the last sync, and how many records wait in the spool.

### Team rules on the host

- **Branch protection does not cover the ledger.** GitHub branch protection and rulesets apply to branches and tags, not to `refs/fab/`. Anyone with write access can push records. They cannot push code that way. Say this clearly to security teams.
- **Forks.** A contributor without write access cannot push. Their records stay on their own machine.
- **Some servers refuse unknown refs.** Self-hosted GitLab, Bitbucket, or an enterprise server with pre-receive hooks may refuse a push to `refs/fab/`. Then `fab sync` stops pushing and says why. Records stay in the spool and the index, and fab works as on one machine.
- **CI clones do not have the ledger.** A CI job that needs scores runs `fab sync` first.
- **Prior art.** git-bug keeps issues in custom refs and syncs them through GitHub in the same way.

### Size

Rough numbers for a busy team: 10 people, 100 records each on a working day.

| | |
| --- | --- |
| One record | About 400 bytes of JSON, about 250 bytes compressed |
| One year | About 250,000 records, about 60 MB before Git's delta compression, less in a pack |
| One day's fetch | About 1,000 new records, about 250 KB |
| Building the index from nothing | 250,000 small files through one `git cat-file --batch`: seconds |

Nothing is checked out, and each fetch gets only what is new. Size does not matter for the first year or two. How to clean up after that is an open question.

## Fab Cloud

The paid backend. It has the same records, the same index and the same commands. It adds what Git cannot do: speed, and live state.

- **Records in seconds.** Each fab client keeps a connection open, and new records come into the index as they are made.
- **Presence.** The fab client of each session sends a heartbeat with the person, the job, the artifact, the harness, the branch and the state (working, waits for you, idle). Presence expires about two minutes after the last heartbeat. The monitor's team view, and the teammates' count in its footer, use it. Presence is not kept. The links and the shared run record are kept, as in Git mode. A session's first `fab link` also starts its presence and its claim, if `fab run` did not already.
- **Claims.** `fab run --on` and the monitor take a lease on a job and an artifact. "The oldest artifact that nobody's agent is on" then means nobody on the team, not nobody on this machine. A second person who starts the same job on the same artifact sees who has it. They can still start it, because a claim informs, as a scorer does. Heartbeats renew the lease. It ends when the run ends or the heartbeats stop.
- **Sign-in.** `fab login`. Fab Cloud checks access to the repository through a GitHub App, so the people who can read a fab's records are the people who can read its repository.
- **Offline.** The spool and the index work as in Git mode. Teammates see the person as offline.
- **Mirror.** With `mirror: git`, Fab Cloud also writes the git ledger. The records stay in the team's repository, so to leave Fab Cloud a team changes `store` back.
- **Moving to Fab Cloud.** Fab Cloud imports the ledger refs. Record IDs make it safe to import more than once.
- **What leaves the machine.** Records (references, scorer reasons, job names, people, token counts and cost estimates) and presence. Code, transcripts, prompts, session IDs and run inputs do not.

## Git ledger or Fab Cloud

| | Git ledger (free) | Fab Cloud |
| --- | --- | --- |
| Scores, links, finished runs | Shared, about a minute late | Shared in seconds |
| Teammates' agents now | Not shown | Shown, from presence |
| Who has an artifact | This machine only | The whole team, from claims |
| Sign-in | The remote's Git credentials | `fab login` |
| Where records are | The team's repository | Fab Cloud, and the repository with `mirror: git` |
| Works offline | Yes | Yes, without live state |

## Open questions

- **Clean-up.** How long do records stay? Two ways: each writer squashes the history of their own ref, which only they write, or old records move to `refs/fab-archive/<person>/<year>`, which a normal sync does not fetch. Choose a policy, and when to build it.
- **Hosts.** Before building on the ledger, test a push to `refs/fab/ledger/*` on GitHub (with rulesets on), GitLab, Bitbucket, and one self-hosted server with pre-receive hooks.
- **Index at scale.** Measure the index rebuild and a `fab work` read on 250,000 made-up records.
- **Out-of-date scores.** Is a dimmed score enough, or should a changed anchor run the scorer again?
- **Teammates' agents in Git mode.** A teammate's links arrive about a minute late, so Git mode could show "Kat's session linked `#412` 3 minutes ago". That is not presence: it cannot say the session is still running. Is it worth showing?
- **One person, two IDs.** A person with `gh` on one machine and only `user.email` on another gets two `by` values. Fab Cloud can map them. Git mode needs a rule.
- **Signing.** Is unsigned by default right for teams that sign every commit?
- **Fab Cloud for enterprises.** Some teams will not send references and scorer reasons to a service. Is `mirror: git` with a self-hosted relay enough, or do they need a self-hosted Fab Cloud?
