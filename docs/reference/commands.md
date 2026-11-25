# Commands and menus

Agntree's commands are in three places: the Command Palette, the hover icons and right-click menu of each row, and the title bar and `…` menu of each view. This page lists all of them.

## Command Palette

Open the Command Palette (`Ctrl+Shift+P`, `Cmd+Shift+P` on macOS) and type **Agntree**. The palette lists only the commands that work without a row under the cursor.

### Projects, worktrees, and the managed workspace

| Command | What it does |
| --- | --- |
| **Agntree: Add Project…** | Add a folder as a Project; a folder without git is offered a `git init` |
| **Agntree: Clone from GitHub…** | Clone a repository and add it as a Project |
| **Agntree: Remove Project from Agntree…** | Remove a Project from the sidebar and its folders from the workspace. Files and conversations are kept |
| **Agntree: Add Project to Workspace** | Open every worktree of the Project as a folder of the managed workspace |
| **Agntree: Remove Project from Workspace** | Take the Project's folders out of the managed workspace |
| **Agntree: Open Managed Workspace** | Open the managed workspace for this host |
| **Agntree: Create Worktree…** | Create a git worktree from an existing or a new branch |
| **Agntree: Check Out Pull Request…** | Check out a GitHub pull request into a new worktree |

### Sessions

| Command | What it does |
| --- | --- |
| **Agntree: New Session** | Start a session with your default agent in the current worktree. Asks which agent when none is set |
| **Agntree: Set Default Agent…** | Choose the agent **New Session** starts, or go back to asking every time |
| **Agntree: New Claude Code Session** | Start a Claude Code session where your settings say sessions open |
| **Agntree: New Claude Code Session in Terminal** | Start a Claude Code session in a terminal |
| **Agntree: New Claude Code Session in Claude Code UI** | Start a Claude Code session in the Claude Code extension's panel |
| **Agntree: New Codex Session** | Start a Codex session where your settings say sessions open |
| **Agntree: New Codex Session in Terminal** | Start a Codex session in a terminal |
| **Agntree: New Codex Session in Codex UI** | Start a Codex session in the Codex extension's panel |
| **Agntree: New opencode Session** | Start an opencode session |
| **Agntree: New Pi Session** | Start a Pi session |
| **Agntree: Open Session in Terminal** | Open or focus the selected session in its terminal |
| **Agntree: Open in Claude Code UI** | Open the selected Claude Code session in the Claude Code panel |
| **Agntree: Open in Codex UI** | Open the selected Codex session in the Codex panel |
| **Agntree: Import Existing Sessions…** | Add sessions the agents already hold for a worktree |
| **Agntree: Starred Sessions…** | Pick one of your starred sessions to open |
| **Agntree: Go to Next Session That Needs You** | Open the session that has waited longest since it finished or asked you something |

### Changes and files

| Command | What it does |
| --- | --- |
| **Agntree: Stage All Changes** | Stage every change in the current worktree |
| **Agntree: Unstage All Changes** | Unstage every staged change |
| **Agntree: Discard All Changes** | Discard every unstaged change, after a confirmation |
| **Agntree: Continue Rebase** | Continue a rebase that stopped on a conflict |
| **Agntree: Skip Commit** | Skip the current commit of a rebase |
| **Agntree: Abort Rebase** | Abort the rebase in progress |
| **Agntree: Search in Files** | Search inside the current worktree |
| **Agntree: New File...** | Create a file in the current worktree |
| **Agntree: New Folder...** | Create a folder in the current worktree |
| **Agntree: Paste** | Paste the copied or cut file |
| **Agntree: Refresh** | Refresh the Workspaces, Changes, or All Files view |

### Settings

| Command | What it does |
| --- | --- |
| **Agntree: Agntree Settings…** | Open Agntree's settings in the Settings editor |
| **Agntree: Agntree Keyboard Shortcuts…** | Open Agntree's shortcuts in the Keyboard Shortcuts editor |
| **Agntree: Turn On Focus on Startup** / **Turn Off Focus on Startup** | Open the Agntree sidebar when VS Code starts |

## Projects view

The view's title bar has **Add Project…**. Its `…` menu has:

- **Open Managed Workspace**, **Clone from GitHub…**, **Check Out Pull Request…**
- **Go to Next Session That Needs You**, **Starred Sessions…**
- **Set Default Agent…**, the **Turn On** / **Turn Off** Focus on Startup switch, **Agntree Settings…**, **Agntree Keyboard Shortcuts…**
- **Refresh**

## Project rows

| Action | Where | Notes |
| --- | --- | --- |
| **Create Worktree…** | Hover icon, right-click | Git repositories |
| **Check Out Pull Request…** | Right-click | Git repositories; needs the `gh` CLI |
| **Add Project to Workspace**, **Remove Project from Workspace** | Right-click | The command that does not apply explains itself |
| **Move Up**, **Move Down** | Right-click | Reorder the list |
| **Remove Project from Agntree…** | Right-click | Removes the row and the Project's folders only |

A plain folder row also has every action of a worktree row except the git ones, because sessions run directly in it.

## Worktree rows

| Action | Where | Notes |
| --- | --- | --- |
| **New Session** | Hover icon, right-click | A menu of installed agents, or your default agent in one click |
| **Import Existing Sessions…** | Right-click | |
| **Open in New Window** | Right-click | |
| **Open Terminal Here** | Hover icon, right-click | A plain terminal |
| **Open Pull Request in Browser** | Right-click | When the branch has a pull request |
| **Copy Path** | Right-click | |
| **Merge Branch into This Worktree…** | Right-click | |
| **Rebase onto Upstream…** | Right-click | |
| **Remove All Sessions from List…** | Right-click | Conversations are kept |
| **Delete Worktree…** | Right-click | Not available on the main worktree |

## Session rows

| Action | Where | Notes |
| --- | --- | --- |
| **Open Session** | Click, right-click | Opens where your settings say, or focuses it where it is open |
| **Open Session in Terminal** | Hover icon, right-click | |
| **Open in Claude Code UI**, **Open in Codex UI** | Hover icon, right-click | Claude Code and Codex sessions |
| **Rename Session…** | Hover icon, right-click, `F2` | |
| **Star Session**, **Unstar Session** | Hover icon, right-click | Works on several selected rows |
| **Fork Session Here** | Right-click | |
| **Fork Session to New Worktree…** | Right-click | |
| **Copy Resume Command** | Right-click, `Ctrl+C` / `Cmd+C` | |
| **Copy Session ID** | Right-click | |
| **Close Session** | Hover icon, right-click | Open sessions; works on several selected rows |
| **Remove Session from List…** | Right-click, `Delete` / `Cmd+Backspace` | Works on several selected rows; conversations are kept |

Select several sessions with `Shift` or `Ctrl`/`Cmd` click.

## Changes panel

| Action | Where |
| --- | --- |
| **Open Diff** | Click a file |
| **Stage File**, **Discard Changes** | Hover icon or right-click on a file under Changes |
| **Unstage File** | Hover icon or right-click on a file under Staged Changes |
| **Stage All Changes**, **Discard All Changes** | Hover icon on the Changes section |
| **Unstage All Changes** | Hover icon on the Staged Changes section |
| **Continue Rebase**, **Skip Commit**, **Abort Rebase** | Hover icon on the rebase row |
| **Refresh** | View title bar |

## All Files panel

| Action | Where |
| --- | --- |
| **Search in Files**, **New File...**, **New Folder...**, **Paste**, **Refresh** | View title bar |
| **Open to the Side** | Right-click a file |
| **Reveal in File Manager**, **Open in Integrated Terminal** | Right-click |
| **Copy Path**, **Copy Relative Path** | Right-click |
| **Copy**, **Cut**, **Paste** | Right-click, `Ctrl+C` / `Ctrl+X` / `Ctrl+V` |
| **New File...**, **New Folder...** | Right-click a folder |
| **Rename...** | Right-click, `F2` |
| **Delete** | Right-click, `Delete` / `Cmd+Backspace`. Moves to the Trash |

## Related

- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Settings](settings.md)
