# 0020 — Archive is a reversible visibility state

- **Status:** Proposed (design accepted 2026-11-25; ships in Slice 3)
- **Date:** 2026-11-25
- **Supersedes:** [0013](0013-rows-leave-with-their-worktree.md); supersedes in part
  [0012](0012-session-import-and-surface-choice.md)

## Context

Upstream made visibility automatic: auto-imported sessions older than
`autoImport.retentionDays` (15 by default) disappeared, **Remove Session** wrote a 90-day
tombstone, and deleting a worktree dropped its rows. The fork wants explicit, reversible
visibility and a way to take a Worktree or Project out of the Explorer without deleting
anything.

## Decision

- Archive applies to a Session, Worktree, or Project. An entity is visible only when it
  and all its ancestors are not archived.
- Archiving a Worktree or Project removes its folders from the Managed Workspace;
  Unarchive restores the previous Open or Registered state.
- Archive never deletes files, changes git, or stops an agent. A running agent keeps
  running.
- Provider-native archived sessions join the same Archived group; the provider's own field
  is not modified. Listing them is lazy and per provider.
- Auto-import aging is off by default; the setting stays for users who want it.
- The Remove/tombstone action remains as a secondary, Agntree-row-only action.
- Deleting a worktree keeps its session rows in the Project's Archived group marked
  `source unavailable`; the user can remove them explicitly. Deleting files never deletes
  provider conversations.
- An archived session that needs input still raises **Needs You** while its terminal or
  panel is open; archiving never silences a waiting agent.

## Alternatives

- **Hide only in the Agntree tree.** Rejected: the Explorer and Source Control would still
  show the folders.
- **Delete instead of archive.** Rejected: irreversible and risky.
- **Keep automatic aging.** Rejected: visibility should be the user's decision.

## Consequences

- Archive state lives in `globalState` per Host; the Managed Workspace file and the
  archived state must stay consistent.
- Unarchive needs the prior Open or Registered state.
- The tree gains an Archived group per scope; provider archived listing costs an extra
  query.
- Deleting a worktree no longer silently forgets its rows.
