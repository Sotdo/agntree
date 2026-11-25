# Agntree

Agntree is the navigation and state layer for git projects, worktrees, and AI-agent
sessions on one Host. It hands sessions to each agent's own terminal or official
extension instead of rebuilding their chat.

## Language

**Host**:
The machine whose filesystem, git, and agent processes Agntree sees. One VS Code window
belongs to exactly one Host.
_Avoid_: machine, server, remote (as a noun)

**Project**:
A git repository registered in Agntree, identified by its primary worktree. A folder that
is not a git repository becomes a Project only after an explicit `git init`.
_Avoid_: workspace, repository (for the user-facing concept), repo

**Registered Project**:
A Project in the Host's registry whose worktrees need not be in the current Managed
Workspace.
_Avoid_: known project, all projects

**Open Project**:
A Registered Project whose worktrees are members of the current Managed Workspace.
_Avoid_: active project, opened project

**Primary Worktree**:
The Project's main working tree, usually the directory where the repository was
registered.
_Avoid_: main branch, main worktree

**Linked Worktree**:
An additional working tree created with `git worktree add` for the same Project.
_Avoid_: child worktree, branch directory

**Worktree**:
One git working tree of a Project; the unit of navigation, Managed Workspace membership,
and session ownership.
_Avoid_: checkout, clone, workspace

**Branch**:
A git ref in a Project; at most one Worktree checks it out. A Branch without a Worktree is
inventory only.
_Avoid_: ref (for users)

**Focus**:
Making a Worktree the active one: highlight it in the tree, reveal it in the Explorer,
bring Source Control forward, point the Changes and All Files panels at it, and keep it
first in the Managed Workspace. Focus changes neither the Workspace's folder set nor the
git HEAD.
_Avoid_: switch, open, migrate (for this action)

**Workspace**:
The VS Code folder set and its workspace file. Never a synonym for Project or Worktree.
_Avoid_: project

**Managed Workspace**:
The Workspace whose folder membership Agntree maintains for the Host: every worktree of
the Open Projects. Agntree adds and removes folders only through Open and Archive; Focus
only reorders them.
_Avoid_: Agntree workspace (for a Project)

**Agent Provider**:
The product that owns an agent session: Claude Code, Antigravity, opencode, Codex, or Pi.
_Avoid_: agent (for a provider)

**Agent Session**:
One conversation or run created by an Agent Provider, with its native session ID, working
directory, status, and last activity.
_Avoid_: agent, conversation (when precision matters)

**Session Status**:
A Session's place in its turn lifecycle: `working` (a turn is running), `done` (a turn
finished), `closed` (no terminal or official panel is open), or `new` (no first prompt
yet).
_Avoid_: ready for review, complete (as a session status)

**Needs You**:
An attention state for a Session that finished a turn or is waiting for input while you
were not looking. It clears when you visit the Session.
_Avoid_: notification (the delivery, not the state)

**Archive**:
A reversible visibility state for a Session, Worktree, or Project. Archiving hides it from
the default tree; archiving a Worktree or Project also removes its folders from the
Managed Workspace. Archive never deletes files, changes git, or stops an agent.
_Avoid_: delete, remove, hide (as synonyms)

**Archived Session**:
A Session in the Archive state; hidden by default, still openable and resumable from its
Archived group.
_Avoid_: deleted, removed

**Archived Worktree**:
A Worktree in the Archive state; its folder leaves the Managed Workspace, while the
directory and git state stay unchanged.
_Avoid_: deleted, removed

**Archived Project**:
A Project in the Archive state; every worktree is hidden and leaves the Managed Workspace,
while the registry entry stays.
_Avoid_: unregistered, deleted
