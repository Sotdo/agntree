# 0025 — VS Code writes the open managed workspace file

- **Status:** Accepted
- **Date:** 2026-11-26
- **Supersedes in part:** [0019](0019-managed-multi-root-workspace.md)

## Context

`ManagedWorkspaceService` wrote `~/.agntree/agntree.code-workspace` itself (temp file plus
rename), then called `updateWorkspaceFolders()` to apply the same set to the open window. In
a Remote-SSH window every Focus reorder restarted the extension host: VS Code treats an
on-disk change to the open workspace configuration as an external edit and reloads the
window. The remote extension-host log shows "terminating: received terminate message from
renderer" seconds after a reorder, and the client renderer logged `File Modified Since` save
errors for the same file because its workspace-configuration model had been overtaken by the
write. A reload ends the Claude Code panel sessions the user was keeping open, which is the
interruption the managed workspace exists to avoid.

## Decision

When the managed workspace is the open workspace, `updateWorkspaceFolders()` is the only
writer: Add, Remove, and Focus update the window and let VS Code save the configuration in
its own form (relative paths, folder names). Agntree writes the file directly only when the
workspace is not the open one — first creation, or a Project added from a window that is not
the managed workspace. A refused folder update reverts the in-memory list, reports the error,
and leaves the file alone. While open, the window is also the source of truth for the folder
order: the folder-change handler syncs the list from the window, never by rereading a file
VS Code has not saved yet.

## Consequences

- Focus, Add, and Remove no longer reload the window, so the Claude Code panels and their
  sessions survive a worktree switch. The managed workspace fulfills the promise ADR 0019
  made: folder edits are in place.
- After a window update the durable order is whatever VS Code saves. The old "write the file
  first, restore it if VS Code refuses" path is gone, because the file is no longer ours to
  write while it is open.
- If the managed workspace is open in another window while a Project is added here, that
  other window still sees an external change to its configuration file and reloads. Every
  action taken inside the managed workspace window itself stays in place.
