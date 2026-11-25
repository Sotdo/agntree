# 0019 — Worktrees of Open Projects share one managed multi-root workspace

- **Status:** Proposed (design accepted 2026-11-25; ships in Slice 1)
- **Date:** 2026-11-25
- **Supersedes in part:** [0009](0009-restored-terminals-keep-their-chat.md),
  [0010](0010-claude-ui-handoff.md)

## Context

Upstream assumed one window folder equals the active worktree: `autoSwitchWorkspaceFolder`
and **Open in This Window** replaced the folder set, and a switch restarted the extension
host. On a Remote-SSH window that is a full window reload, which interrupts agents and is
hostile to the fork's primary target. The fork also wants the Claude Code official panel,
which reads `workspaceFolders[0]` when it creates its host and offers no cwd argument
(verified against `anthropic.claude-code` 2.1.331; its URI handler parses only `session`
and `prompt`).

## Decision

- One Managed Workspace per Host. An Open Project contributes every worktree as a folder;
  a Registered Project does not. A first-run prompt offers to open it; the tree still
  works when it is not open.
- **Focus** reveals and highlights the worktree, points the Changes and All Files panels
  at it, brings Source Control forward, and moves it to `workspaceFolders[0]`. The folder
  set does not change.
- Remove `autoSwitchWorkspaceFolder` and the Open in This Window command; keep **Open in
  New Window**.
- Declare `extensionKind: ["workspace"]`, and build folder and workspace-file URIs with
  the window's host authority, so a Remote-SSH window sees only its Host.
- User-facing nouns are **Project/Projects**. Git is required: Add Project offers an
  explicit `git init` for a folder that is not a repository, and refuses otherwise.
- The Claude official UI opens after the Focus reorder, so its first-folder constraint is
  satisfied for any worktree. The Codex new-panel path still requires a single folder and
  stays unavailable in a multi-root window; existing Codex threads are unaffected.

## Alternatives

- **Keep single-folder switching.** Rejected: a Remote-SSH reload interrupts panel
  sessions and loses the dashboard.
- **One window per worktree.** Rejected: it scatters the ADE across windows.
- **Reorder only when opening the Claude UI.** Rejected: an already-open Claude sidebar
  keeps the cwd from its construction, and the extra state is not worth it.
- **Keep the first-folder guard and fall back to the terminal.** Rejected: the official UI
  would serve only one worktree.

## Evidence

- VS Code 1.147 `doUpdateFolders` edits a multi-root workspace's configuration in place;
  `createAndEnterWorkspace` — and the host restart — is reached only when the sole folder
  of a single-folder window is replaced.
- Claude Code 2.1.331 `createPanel` uses the first `file`/`vscode-remote` workspace folder,
  else `os.homedir()`; `editor.open`'s options destructure only `{programmatic,
  preferredLocation, sessionAlreadyOpenInPanel, fullEditor}`. The only cwd exception is a
  transcript under `.claude/worktrees/<name>`.

## Consequences

- Explorer root order follows Focus; the tree's Project order stays independent.
- The active worktree is persisted separately; terminal restore keys PIDs by worktree, not
  by workspace folder.
- An already-open Claude sidebar may keep its construction cwd; the editor panel does not.
- Adding and removing folders is in-place in the managed workspace; the first conversion
  from a single-folder window reloads the window once.
- The managed workspace file is a new compatibility surface; the registry stays in
  `globalState`.
