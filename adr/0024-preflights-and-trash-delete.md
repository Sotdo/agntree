# 0024 — Dangerous git actions preflight, and a worktree delete goes to the Trash

- **Status:** Proposed (design accepted 2026-11-25; ships in Slice 1)
- **Date:** 2026-11-25

## Context

Only Delete Worktree confirmed with the facts, and only when the worktree was dirty; a
clean delete removed the directory permanently. Merge warned only about uncommitted
changes, rebase showed a preflight of its own, and fork-with-changes and PR checkout
acted without one. The fork's rule is narrow destructiveness with a reversible default
and an operation log (P7, Q6=A).

## Decision

- **Merge**, **Rebase**, **Delete Worktree**, **Fork Session to New Worktree**, and
  **Check Out Pull Request** each confirm before acting, naming the branch and worktree,
  the number of uncommitted files, and how many agent sessions are open in the worktree.
  The commands that already had a prompt (rebase, delete) keep their shape and gain the
  missing facts.
- **Delete Worktree** moves the directory to the Trash and then runs `git worktree prune`.
  A host whose file service has no usable Trash falls back to `git worktree remove` after
  the same confirmation; the success message and the operation log say the deletion was
  permanent.
- Every one of these actions writes an entry to the operation log on success, refusal,
  conflict, and failure.
- Creating a worktree and checking out a branch are not preflighted: they change no
  existing worktree and are cheap to undo.

## Alternatives

- **Warn only on delete.** Rejected: merge and fork-with-changes can also lose local work.
- **Preflight every git write, including create.** Rejected: it trains the user to dismiss
  dialogs.
- **Keep the permanent delete.** Rejected: the Trash is the one undo the platform offers.

## Consequences

- The confirmations add one dialog to merge, fork-with-changes, and PR checkout.
- On a host without a Trash, "Delete Worktree" stays permanent; the wording never claims
  otherwise.
- Restoring a deleted worktree from the Trash restores the files but not git's worktree
  metadata; `git worktree add` re-registers it.
- The Branches group is read-only and has no preflight: it only reads refs and focuses a
  worktree.
